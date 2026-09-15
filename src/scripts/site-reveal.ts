import { prefersReducedMotion } from "./motion";
import { revealConfig } from "./reveal-config";
import { initTextReveal, revealTextInDocumentRange } from "./text-reveal";

const revealItems = Array.from(
	document.querySelectorAll<HTMLElement>("[data-reveal]"),
);

interface CachedReveal {
	el: HTMLElement;
	top: number;
	bottom: number;
}

function isInLiveViewport(el: HTMLElement): boolean {
	const rect = el.getBoundingClientRect();
	const vh = window.innerHeight || document.documentElement.clientHeight;
	const vw = window.innerWidth || document.documentElement.clientWidth;
	return rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw;
}

function cacheRevealPositions(items: HTMLElement[]): CachedReveal[] {
	const scrollY = window.scrollY;
	const cached: CachedReveal[] = [];

	for (const el of items) {
		if (el.classList.contains("is-visible")) continue;
		const rect = el.getBoundingClientRect();
		cached.push({
			el,
			top: rect.top + scrollY,
			bottom: rect.bottom + scrollY,
		});
	}

	return cached;
}

/**
 * Monotonic reveal. Prefetched off-screen nodes keep the CSS transition.
 * Instant when already in the live viewport, or when `forceInstant` is set
 * (high-velocity safety flush) so fast jumps cannot paint opacity:0 ink.
 */
function markVisible(el: HTMLElement, forceInstant = false): void {
	if (el.classList.contains("is-visible")) return;

	if (forceInstant || isInLiveViewport(el)) {
		el.style.setProperty("transition", "none");
		el.classList.add("is-visible");
		return;
	}

	el.classList.add("is-visible");
}

/**
 * Lightweight rAF-coalesced safety net: reveal any still-hidden candidates
 * whose cached document box falls inside an expanded viewport band.
 * Does not scan the whole DOM every frame — only walks a shrinking cache.
 */
function installScrollSafetyNet(
	pending: CachedReveal[],
	observer: IntersectionObserver | null,
): void {
	let raf = 0;
	let cache = pending;
	let lastY = window.scrollY;

	const flush = () => {
		raf = 0;

		const vh = window.innerHeight || document.documentElement.clientHeight;
		const y = window.scrollY;
		const dy = Math.abs(y - lastY);
		lastY = y;
		/*
		 * Half-viewport (or more) since the previous rAF ⇒ PageDown / flick /
		 * interrupted smooth-scroll. Snap band contents so mid-fade cannot
		 * expose --ink. Normal wheel ticks stay animated via IO prefetch.
		 */
		const fastJump = dy >= vh * 0.5;
		const pad = vh * revealConfig.safetyBufferVh;
		const bandTop = y - pad;
		const bandBottom = y + vh + pad;

		if (fastJump) {
			/*
			 * Elements already armed by the prefetch observer can still be
			 * mid-fade (opacity≈0) when a large jump lands on them. Kill the
			 * in-flight transition so --ink cannot show through.
			 */
			for (const el of revealItems) {
				if (!el.classList.contains("is-visible")) continue;
				if (!isInLiveViewport(el)) continue;
				if (parseFloat(getComputedStyle(el).opacity) >= 0.95) continue;
				el.style.setProperty("transition", "none");
			}
		}

		if (cache.length > 0) {
			const remaining: CachedReveal[] = [];

			for (const item of cache) {
				if (item.el.classList.contains("is-visible")) {
					observer?.unobserve(item.el);
					continue;
				}

				if (item.bottom < bandTop || item.top > bandBottom) {
					remaining.push(item);
					continue;
				}

				markVisible(item.el, fastJump);
				observer?.unobserve(item.el);
			}

			cache = remaining;
		}

		revealTextInDocumentRange(bandTop, bandBottom, { forceInstant: fastJump });
	};

	const onScroll = () => {
		if (raf) return;
		raf = requestAnimationFrame(flush);
	};

	const onResize = () => {
		cache = cacheRevealPositions(cache.map((item) => item.el));
		onScroll();
	};

	window.addEventListener("scroll", onScroll, { passive: true });
	window.addEventListener("resize", onResize, { passive: true });
	// Arm once for the initial viewport + prefetch band.
	onScroll();
}

if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
	revealItems.forEach((item) => markVisible(item));
	initTextReveal();
} else {
	const revealObserver = new IntersectionObserver(
		(entries, observer) => {
			entries.forEach((entry) => {
				if (!entry.isIntersecting) return;
				const el = entry.target as HTMLElement;
				markVisible(el);
				observer.unobserve(el);
			});
		},
		{
			rootMargin: revealConfig.rootMargin,
			threshold: revealConfig.threshold,
		},
	);

	revealItems.forEach((item) => revealObserver.observe(item));
	// Text pending cache must exist before the shared scroll safety flush.
	initTextReveal();
	installScrollSafetyNet(cacheRevealPositions(revealItems), revealObserver);
}
