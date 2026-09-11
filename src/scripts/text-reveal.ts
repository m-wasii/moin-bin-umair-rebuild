import { textRevealConfig as config } from "./text-reveal-config";

const WORD_INNER = "text-reveal__word-inner";
const WORD_OUTER = "text-reveal__word";
const PREPARED = "is-text-reveal-prepared";
const REVEALED = "is-revealed";

type RevealMode = "words" | "mask";

function prefersReducedMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function visibleTextLength(el: HTMLElement): number {
	return (el.textContent ?? "").replace(/\s+/g, " ").trim().length;
}

function resolveMode(el: HTMLElement): RevealMode {
	const forced = el.dataset.textReveal;
	if (forced === "words" || forced === "mask") return forced;
	const tag = el.tagName;
	if (tag === "H1" || tag === "H2" || tag === "H3") return "words";
	return visibleTextLength(el) >= config.longTextChars ? "mask" : "words";
}

function durationFor(el: HTMLElement, mode: RevealMode): number {
	const len = visibleTextLength(el);
	if (mode === "mask" || len >= config.longTextChars) {
		return config.durationLongMs;
	}
	return config.durationShortMs;
}

function staggerFor(wordCount: number, durationMs: number): number {
	if (wordCount <= 1) return 0;
	const budget = Math.min(
		config.maxWordStaggerTotalMs,
		Math.max(0, durationMs - 280),
	);
	return Math.min(
		config.wordStaggerMs,
		Math.max(28, Math.floor(budget / (wordCount - 1))),
	);
}

function wrapTextNode(textNode: Text): void {
	const raw = textNode.nodeValue ?? "";
	if (!raw) return;

	const frag = document.createDocumentFragment();
	const parts = raw.split(/(\s+)/);

	for (const part of parts) {
		if (!part) continue;
		if (/^\s+$/.test(part)) {
			frag.appendChild(document.createTextNode(part));
			continue;
		}

		const outer = document.createElement("span");
		outer.className = WORD_OUTER;
		const inner = document.createElement("span");
		inner.className = WORD_INNER;
		inner.textContent = part;
		outer.appendChild(inner);
		frag.appendChild(outer);
	}

	textNode.parentNode?.replaceChild(frag, textNode);
}

function prepareWords(el: HTMLElement): number {
	const texts: Text[] = [];
	const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);

	let node = walker.nextNode();
	while (node) {
		const text = node as Text;
		if (text.nodeValue && text.nodeValue.trim().length > 0) {
			texts.push(text);
		}
		node = walker.nextNode();
	}

	texts.forEach(wrapTextNode);

	const inners = el.querySelectorAll<HTMLElement>(`.${WORD_INNER}`);
	inners.forEach((inner, index) => {
		inner.style.setProperty("--tr-i", String(index));
	});

	return inners.length;
}

function prepareElement(el: HTMLElement): void {
	if (el.classList.contains(PREPARED) || el.classList.contains(REVEALED)) {
		return;
	}

	const mode = resolveMode(el);
	const durationMs = durationFor(el, mode);
	el.dataset.textRevealMode = mode;
	el.style.setProperty("--tr-duration", `${durationMs}ms`);
	el.style.setProperty("--tr-ease", config.easing);

	if (mode === "words") {
		const count = prepareWords(el);
		const stagger = staggerFor(count, durationMs);
		el.style.setProperty("--tr-stagger", `${stagger}ms`);
		el.style.setProperty("--tr-words", String(Math.max(count, 1)));
	} else {
		// Clip an inner wrapper so IntersectionObserver still sees the host box.
		// Clipping the host itself yields a 0×0 intersection and never triggers.
		const mask = document.createElement("span");
		mask.className = "text-reveal__mask";
		while (el.firstChild) {
			mask.appendChild(el.firstChild);
		}
		el.appendChild(mask);
	}

	el.classList.add(PREPARED);
}

function revealElement(el: HTMLElement): void {
	prepareElement(el);
	// Next frame so initial clipped styles paint before transitioning.
	requestAnimationFrame(() => {
		el.classList.add(REVEALED);
	});
}

function showImmediately(el: HTMLElement): void {
	el.classList.add(PREPARED, REVEALED);
}

function isAlreadyInView(el: HTMLElement): boolean {
	const rect = el.getBoundingClientRect();
	const vh = window.innerHeight || document.documentElement.clientHeight;
	const vw = window.innerWidth || document.documentElement.clientWidth;
	// First paint: any on-screen copy (including hero footer near the
	// bottom edge) should play immediately. Scroll choreography for
	// below-fold elements still uses the observer rootMargin.
	return rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw;
}

/**
 * Instantly finish text reveals whose top is at or above `scrollLimitY`.
 * Used for long in-page nav jumps so smooth scrolling does not fly through
 * clipped / opacity-0 copy (black flash over the dark page background).
 */
export function forceTextRevealThrough(scrollLimitY: number): void {
	document.querySelectorAll<HTMLElement>("[data-text-reveal]").forEach((el) => {
		const top = el.getBoundingClientRect().top + window.scrollY;
		if (top > scrollLimitY) return;
		prepareElement(el);
		el.classList.add(REVEALED);
	});
}

/**
 * Initialize site-wide text writing/reveal for `[data-text-reveal]` targets.
 * Plays once on viewport entry; respects prefers-reduced-motion.
 */
export function initTextReveal(
	root: ParentNode = document,
): IntersectionObserver | null {
	const items = Array.from(
		root.querySelectorAll<HTMLElement>("[data-text-reveal]"),
	);

	if (items.length === 0) return null;

	if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
		items.forEach(showImmediately);
		return null;
	}

	items.forEach(prepareElement);

	const observer = new IntersectionObserver(
		(entries, obs) => {
			entries.forEach((entry) => {
				if (!entry.isIntersecting) return;
				const el = entry.target as HTMLElement;
				revealElement(el);
				obs.unobserve(el);
			});
		},
		{
			rootMargin: config.rootMargin,
			threshold: config.threshold,
		},
	);

	items.forEach((item) => {
		// Above-the-fold copy (e.g. hero footer) can sit in the bottom
		// rootMargin band and never intersect — reveal those immediately.
		if (isAlreadyInView(item)) {
			revealElement(item);
			return;
		}
		observer.observe(item);
	});

	return observer;
}
