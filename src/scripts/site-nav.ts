import { createFocusTrap, type FocusTrap } from "./focus-trap";
import { waitForScrollToSettle } from "./nav-scroll-settle";
import {
	forceTextRevealAlongPath,
	forceTextRevealInViewport,
} from "./text-reveal";

const header = document.querySelector<HTMLElement>("[data-header]");
const brand = document.querySelector<HTMLElement>(".site-brand");
const headerEnd = document.querySelector<HTMLElement>(".site-header__end");
const nav = document.querySelector<HTMLElement>("[data-nav]");
const navIndicator = document.querySelector<HTMLElement>(
	"[data-nav-indicator]",
);
const navInvertTrack = document.querySelector<HTMLElement>(
	"[data-nav-invert-track]",
);
const navToggle =
	document.querySelector<HTMLButtonElement>("[data-nav-toggle]");
const navLinks = Array.from(
	document.querySelectorAll<HTMLAnchorElement>("[data-nav-link]"),
);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
/** Extra space required between brand/nav and nav/lang before collapsing. */
const NAV_FIT_CLEARANCE = 32;
/** Extra width needed before expanding back out of compact (anti-flicker). */
const NAV_EXPAND_HYSTERESIS = 48;

let navFocusTrap: FocusTrap | null = header ? createFocusTrap(header) : null;
let navTrigger: HTMLElement | null = null;

let scrollFrame = 0;
let navIndicatorFrame = 0;
let navFitFrame = 0;
let wasNavTransitioning = false;
/** Min header width (px) that fits the expanded pill layout; 0 = unknown. */
let navExpandedFitWidth = 0;
let cachedLinkMetrics: Array<{
	x: number;
	y: number;
	w: number;
	h: number;
}> = [];
/** Document Y positions for nav sections; invalidated on resize / layout. */
let cachedSectionTops: number[] = [];
let sectionTopsDirty = true;
let cachedScrollPaddingTop = 0;
let scrollPaddingDirty = true;

function isNavCompact() {
	return document.documentElement.classList.contains("nav-is-compact");
}

function setNavCompact(compact: boolean) {
	const root = document.documentElement;
	const wasCompact = root.classList.contains("nav-is-compact");

	if (wasCompact === compact) return;

	/* Entering compact: snap overlay to closed (no opacity fade from the pill). */
	if (compact) {
		root.classList.add("nav-is-measuring");
		root.classList.add("nav-is-compact");
		void header?.offsetWidth;
		root.classList.remove("nav-is-measuring");
	} else {
		root.classList.remove("nav-is-compact");
	}

	closeNavigation();
	measureLinkMetrics();
	queueNavIndicatorUpdate();
}

function readExpandedFitMetrics() {
	if (!header || !nav || !brand || !headerEnd) {
		return { fitWidth: Number.POSITIVE_INFINITY, collides: true };
	}

	const headerStyles = getComputedStyle(header);
	const gap = parseFloat(headerStyles.columnGap) || 0;
	const padX =
		(parseFloat(headerStyles.paddingLeft) || 0) +
		(parseFloat(headerStyles.paddingRight) || 0);
	const brandRect = brand.getBoundingClientRect();
	const navRect = nav.getBoundingClientRect();
	const endRect = headerEnd.getBoundingClientRect();

	/* Equal 1fr side columns: each side must fit the wider of brand/end. */
	const side = Math.max(brandRect.width, endRect.width);
	const fitWidth =
		side * 2 + navRect.width + gap * 2 + padX + NAV_FIT_CLEARANCE;

	const collides =
		brandRect.right + NAV_FIT_CLEARANCE > navRect.left ||
		navRect.right + NAV_FIT_CLEARANCE > endRect.left;

	return { fitWidth, collides };
}

function withExpandedNavMetrics<T>(fn: () => T): T {
	const root = document.documentElement;
	const wasCompact = root.classList.contains("nav-is-compact");

	if (wasCompact) {
		root.classList.add("nav-is-measuring");
		root.classList.remove("nav-is-compact");
		void header?.offsetWidth;
	}

	try {
		return fn();
	} finally {
		if (wasCompact) {
			/* Commit closed compact styles under measuring (transition:none)
			   before becoming visible again — avoids a menu-open flash. */
			root.classList.add("nav-is-compact");
			void header?.offsetWidth;
			root.classList.remove("nav-is-measuring");
		}
	}
}

function syncNavCompactMode() {
	if (!header || !nav || !brand || !headerEnd) return;

	if (!isNavCompact()) {
		const { fitWidth, collides } = readExpandedFitMetrics();
		navExpandedFitWidth = fitWidth;

		if (collides || header.offsetWidth < fitWidth) {
			setNavCompact(true);
		}

		return;
	}

	if (navExpandedFitWidth <= 0) {
		navExpandedFitWidth = withExpandedNavMetrics(
			() => readExpandedFitMetrics().fitWidth,
		);
	}

	if (header.offsetWidth >= navExpandedFitWidth + NAV_EXPAND_HYSTERESIS) {
		setNavCompact(false);
		requestAnimationFrame(() => {
			const { fitWidth, collides } = readExpandedFitMetrics();
			navExpandedFitWidth = fitWidth;

			if (collides || header.offsetWidth < fitWidth) {
				setNavCompact(true);
			}
		});
	}
}

function queueNavCompactSync() {
	if (navFitFrame) return;

	navFitFrame = window.requestAnimationFrame(() => {
		navFitFrame = 0;
		syncNavCompactMode();
	});
}

function measureLinkMetrics() {
	if (!nav) return;

	const navRect = nav.getBoundingClientRect();
	const navStyles = getComputedStyle(nav);
	const insetX = parseFloat(navStyles.borderLeftWidth) || 0;
	const insetY = parseFloat(navStyles.borderTopWidth) || 0;
	const compact = isNavCompact();

	/* Padding-box size for the counter-shifted invert layer (excludes border). */
	nav.style.setProperty("--nav-track-w", `${nav.clientWidth.toFixed(2)}px`);
	nav.style.setProperty("--nav-track-h", `${nav.clientHeight.toFixed(2)}px`);

	const invertLabels = navInvertTrack
		? Array.from(navInvertTrack.children)
		: [];

	cachedLinkMetrics = navLinks.map((link, index) => {
		const rect = link.getBoundingClientRect();
		const metrics = {
			x: rect.left - navRect.left - insetX,
			y: rect.top - navRect.top - insetY,
			w: compact ? 3 : rect.width,
			h: rect.height,
		};

		const invertLabel = invertLabels[index];
		if (invertLabel instanceof HTMLElement) {
			invertLabel.style.width = `${rect.width.toFixed(2)}px`;
			invertLabel.style.height = `${rect.height.toFixed(2)}px`;
			invertLabel.style.padding = "0";
		}

		return metrics;
	});
}

function setIndicatorMetrics(metrics: {
	x: number;
	y: number;
	w: number;
	h: number;
}) {
	if (!nav || !navIndicator) return;

	/* Position via transform; size via CSS vars with no transition. */
	nav.style.setProperty("--nav-indicator-x", `${metrics.x.toFixed(2)}px`);
	nav.style.setProperty("--nav-indicator-y", `${metrics.y.toFixed(2)}px`);
	nav.style.setProperty("--nav-indicator-w", `${metrics.w.toFixed(2)}px`);
	nav.style.setProperty("--nav-indicator-h", `${metrics.h.toFixed(2)}px`);
	navIndicator.style.opacity = "1";
}

function lerp(start: number, end: number, amount: number) {
	return start + (end - start) * amount;
}

function scrollNavEase(amount: number) {
	if (amount <= 0) return 0;
	if (amount >= 1) return 1;

	if (amount < 0.4) {
		return (amount / 0.4) ** 2 * 0.24;
	}

	if (amount < 0.78) {
		const rush = (amount - 0.4) / 0.38;
		return 0.24 + rush ** 3 * 0.56;
	}

	const settle = (amount - 0.78) / 0.22;
	return 0.8 + (1 - (1 - settle) ** 3) * 0.2;
}

function slideIndicatorMetrics(
	from: { x: number; y: number; w: number; h: number },
	to: { x: number; y: number; w: number; h: number },
	amount: number,
) {
	return {
		x: lerp(from.x, to.x, amount),
		y: lerp(from.y, to.y, amount),
		w: lerp(from.w, to.w, amount),
		h: lerp(from.h, to.h, amount),
	};
}

function invalidateSectionMetrics() {
	sectionTopsDirty = true;
	scrollPaddingDirty = true;
}

function getSectionScrollTop(section: HTMLElement) {
	return section.getBoundingClientRect().top + window.scrollY;
}

function ensureSectionTops(
	navSections: Array<{ link: HTMLAnchorElement; section: HTMLElement }>,
) {
	if (!sectionTopsDirty && cachedSectionTops.length === navSections.length) {
		return;
	}

	const scrollY = window.scrollY;
	cachedSectionTops = navSections.map(
		({ section }) => section.getBoundingClientRect().top + scrollY,
	);
	sectionTopsDirty = false;
}

function getScrollPaddingTop() {
	if (!scrollPaddingDirty) return cachedScrollPaddingTop;
	cachedScrollPaddingTop =
		parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) ||
		0;
	scrollPaddingDirty = false;
	return cachedScrollPaddingTop;
}

function getScrollAnchor() {
	return window.scrollY + getScrollPaddingTop() + 1;
}

function getNavSections() {
	return navLinks
		.map((link) => {
			const section = document.getElementById(link.hash.slice(1));
			return section ? { link, section } : null;
		})
		.filter(
			(entry): entry is { link: HTMLAnchorElement; section: HTMLElement } =>
				entry !== null,
		);
}

function getActiveSectionIndex(
	navSections: Array<{ link: HTMLAnchorElement; section: HTMLElement }>,
	anchor: number,
) {
	ensureSectionTops(navSections);
	let activeIndex = 0;

	for (let index = 0; index < cachedSectionTops.length; index += 1) {
		if (anchor >= cachedSectionTops[index] - 2) {
			activeIndex = index;
		}
	}

	return activeIndex;
}

function snapIndicatorToIndex(index: number) {
	if (!nav || index < 0 || index >= cachedLinkMetrics.length) return;

	wasNavTransitioning = false;
	nav.classList.remove("is-scroll-tracking");
	nav.classList.add("is-nav-settling");
	measureLinkMetrics();
	setIndicatorMetrics(cachedLinkMetrics[index]);

	navLinks.forEach((link, linkIndex) => {
		if (linkIndex === index) {
			link.setAttribute("aria-current", "page");
		} else {
			link.removeAttribute("aria-current");
		}
	});
}

function updateNavIndicatorFromScroll() {
	if (!nav || !navIndicator || !cachedLinkMetrics.length) return;

	if (reducedMotion.matches) return;

	const navSections = getNavSections();
	if (!navSections.length) return;

	const anchor = getScrollAnchor();
	const activeIndex = getActiveSectionIndex(navSections, anchor);
	let fromIndex = activeIndex;
	let rawProgress = 0;

	if (activeIndex < navSections.length - 1) {
		const currentSection = navSections[activeIndex].section;
		const nextTop = cachedSectionTops[activeIndex + 1];
		const leaveCurrent =
			cachedSectionTops[activeIndex] + currentSection.offsetHeight * 0.58;

		if (anchor >= leaveCurrent && anchor < nextTop) {
			fromIndex = activeIndex;
			rawProgress = (anchor - leaveCurrent) / (nextTop - leaveCurrent);
		}
	}

	const easedProgress = scrollNavEase(Math.min(1, Math.max(0, rawProgress)));
	const fromMetrics = cachedLinkMetrics[fromIndex];
	const toMetrics =
		cachedLinkMetrics[Math.min(fromIndex + 1, cachedLinkMetrics.length - 1)];

	if (!fromMetrics || !toMetrics) return;

	const isTransitioning =
		fromIndex < cachedLinkMetrics.length - 1 &&
		rawProgress > 0 &&
		rawProgress < 1;

	if (isTransitioning) {
		nav.classList.add("is-scroll-tracking");
		nav.classList.remove("is-nav-settling");
		setIndicatorMetrics(
			slideIndicatorMetrics(fromMetrics, toMetrics, easedProgress),
		);
	} else if (wasNavTransitioning) {
		nav.classList.remove("is-scroll-tracking");
		nav.classList.add("is-nav-settling");
		setIndicatorMetrics(cachedLinkMetrics[activeIndex]);
	} else {
		nav.classList.remove("is-scroll-tracking", "is-nav-settling");
		setIndicatorMetrics(cachedLinkMetrics[activeIndex]);
	}

	wasNavTransitioning = isTransitioning;

	const highlightIndex =
		isTransitioning && rawProgress >= 0.55 ? fromIndex + 1 : activeIndex;

	navLinks.forEach((link, index) => {
		if (index === highlightIndex) {
			link.setAttribute("aria-current", "page");
		} else {
			link.removeAttribute("aria-current");
		}
	});
}

function updateNavIndicator(activeLink?: HTMLAnchorElement) {
	if (!nav || !navIndicator) return;

	if (!cachedLinkMetrics.length) measureLinkMetrics();

	if (!reducedMotion.matches) {
		updateNavIndicatorFromScroll();
		return;
	}

	const current =
		activeLink ??
		navLinks.find((link) => link.getAttribute("aria-current") === "page");

	if (!current) {
		navIndicator.style.opacity = "0";
		return;
	}

	const metrics = cachedLinkMetrics[navLinks.indexOf(current)];
	if (!metrics) return;

	setIndicatorMetrics(metrics);
}

function queueNavIndicatorUpdate(activeLink?: HTMLAnchorElement) {
	if (!navIndicatorFrame) {
		navIndicatorFrame = window.requestAnimationFrame(() => {
			updateNavIndicator(activeLink);
			navIndicatorFrame = 0;
		});
	}
}

function shouldHideHeaderForContact() {
	const contact = document.getElementById("contact");
	if (!contact || !header) return false;

	const headerTop = parseFloat(getComputedStyle(header).top) || 0;
	const headerBand = headerTop + header.offsetHeight;

	return contact.getBoundingClientRect().top <= headerBand;
}

function updateHeaderVisibility() {
	if (!header) return;

	const hidden = shouldHideHeaderForContact();
	const wasHidden = header.classList.contains("site-header--hidden");

	header.classList.toggle("site-header--hidden", hidden);
	header.toggleAttribute("inert", hidden);

	if (hidden) {
		header.setAttribute("aria-hidden", "true");
		if (!wasHidden) {
			closeNavigation();
		}
		return;
	}

	header.removeAttribute("aria-hidden");
}

function updateScrollChrome() {
	header?.classList.toggle("site-header--scrolled", window.scrollY > 24);
	updateHeaderVisibility();
	queueNavIndicatorUpdate();
	scrollFrame = 0;
}

function queueScrollChromeUpdate() {
	if (!scrollFrame) {
		scrollFrame = window.requestAnimationFrame(updateScrollChrome);
	}
}

function isNavigationOpen() {
	return navToggle?.getAttribute("aria-expanded") === "true";
}

function isSiteOverlayOpen() {
	return Boolean(
		document.querySelector(
			"[data-video-dialog]:not([hidden]), [data-photo-dialog]:not([hidden]), [data-album-panel]:not([hidden])",
		),
	);
}

function closeNavigation(options?: { restoreFocus?: boolean }) {
	const wasOpen = isNavigationOpen();
	navFocusTrap?.deactivate();
	navToggle?.setAttribute("aria-expanded", "false");
	nav?.classList.remove("site-nav--open");
	document.body.classList.remove("nav-open");

	if (!wasOpen) {
		navTrigger = null;
		return;
	}

	const restore = navTrigger ?? navToggle;
	navTrigger = null;
	if (options?.restoreFocus) {
		restore?.focus({ preventScroll: true });
	}
}

function openNavigation() {
	if (!navToggle) return;

	document.dispatchEvent(new CustomEvent("site:close-overlays"));
	navTrigger =
		document.activeElement instanceof HTMLElement
			? document.activeElement
			: navToggle;
	navToggle.setAttribute("aria-expanded", "true");
	nav?.classList.add("site-nav--open");
	document.body.classList.add("nav-open");
	queueNavIndicatorUpdate();
	navFocusTrap?.activate(navLinks[0] ?? navToggle);
}

navToggle?.addEventListener("click", () => {
	if (isNavigationOpen()) closeNavigation({ restoreFocus: true });
	else openNavigation();
});

document.addEventListener("site:close-nav", () => {
	closeNavigation({ restoreFocus: false });
});

/** Long hash jumps outrun opacity reveals → dark empty viewport mid-scroll. */
const NAV_JUMP_REVEAL_VIEWPORTS = 1.25;
/** Safety net when scrollend never fires (interrupted / browser quirks). */
const NAV_JUMP_SETTLE_TIMEOUT_MS = 2500;

/** Invalidates stale scrollend/timeout cleanup from interrupted nav jumps. */
let navJumpGeneration = 0;
let navJumpEndTimeout = 0;
let navJumpScrollEndHandler: (() => void) | null = null;

function cancelNavJumpCleanup() {
	if (navJumpEndTimeout) {
		window.clearTimeout(navJumpEndTimeout);
		navJumpEndTimeout = 0;
	}

	if (navJumpScrollEndHandler) {
		window.removeEventListener("scrollend", navJumpScrollEndHandler);
		navJumpScrollEndHandler = null;
	}
}

function markNavigationJump() {
	cancelNavJumpCleanup();
	navJumpGeneration += 1;
	return navJumpGeneration;
}

function clearNavigationJump(generation: number) {
	finishNavScrollJump(generation);
}

/**
 * Permanently reveal `[data-reveal]` blocks along the scroll path between
 * `fromY` and `toY` (either direction). Does not reveal the whole page.
 */
function revealContentAlongPath(fromY: number, toY: number) {
	const main = document.getElementById("main-content");
	if (!main) return;

	const minY = Math.min(fromY, toY);
	const maxY = Math.max(fromY, toY);
	const pad = window.innerHeight || 0;
	const scrollY = window.scrollY;

	for (const child of Array.from(main.children)) {
		if (!(child instanceof HTMLElement)) continue;

		const top = child.getBoundingClientRect().top + scrollY;
		const bottom = top + child.offsetHeight;
		if (bottom < minY - pad || top > maxY + pad) continue;

		child
			.querySelectorAll<HTMLElement>("[data-reveal]")
			.forEach((item) => item.classList.add("is-visible"));
	}

	forceTextRevealAlongPath(fromY, toY);
}

/** Lock in any still-hidden reveals currently in view before ending the jump. */
function revealViewportForNavTeardown() {
	const vh = window.innerHeight || document.documentElement.clientHeight;

	document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((item) => {
		if (item.classList.contains("is-visible")) return;
		const rect = item.getBoundingClientRect();
		if (rect.bottom <= 0 || rect.top >= vh) return;
		item.classList.add("is-visible");
	});

	forceTextRevealInViewport();
}

function isNearNavTarget(targetY: number) {
	const expected = Math.max(0, targetY - getScrollPaddingTop());
	const tolerance = Math.max(64, window.innerHeight * 0.2);
	return Math.abs(window.scrollY - expected) <= tolerance;
}

function finishNavScrollJump(generation: number) {
	if (generation !== navJumpGeneration) return;

	cancelNavJumpCleanup();
	revealViewportForNavTeardown();
	document.documentElement.classList.remove("is-nav-scrolling");
}

function beginNavScrollJump(section: HTMLElement) {
	const fromY = window.scrollY;
	const toY = getSectionScrollTop(section);
	const distance = Math.abs(toY - fromY);
	const root = document.documentElement;
	const wasNavScrolling = root.classList.contains("is-nav-scrolling");
	const generation = markNavigationJump();

	const isShortJump =
		reducedMotion.matches ||
		distance < window.innerHeight * NAV_JUMP_REVEAL_VIEWPORTS;

	/*
	 * Short jumps normally skip the override. If they interrupt an active long
	 * jump, keep is-nav-scrolling until this scroll settles — never let the
	 * previous jump's teardown (or an immediate short-path clear) expose
	 * unrevealed content mid-flight.
	 */
	if (isShortJump && !wasNavScrolling) return;

	root.classList.add("is-nav-scrolling");
	revealContentAlongPath(fromY, toY);

	waitForScrollToSettle(() => clearNavigationJump(generation), {
		shouldAbort: () =>
			generation !== navJumpGeneration ||
			!root.classList.contains("is-nav-scrolling"),
		/* Ignore scrollend from an interrupted prior smooth-scroll. */
		shouldIgnoreEvent: () => !isNearNavTarget(toY),
		timeoutMs: NAV_JUMP_SETTLE_TIMEOUT_MS,
		registerNativeHandler: (handler) => {
			navJumpScrollEndHandler = handler;
		},
		registerTimeout: (timeoutId) => {
			navJumpEndTimeout = timeoutId;
		},
	});
}

navLinks.forEach((link, index) => {
	link.addEventListener("click", () => {
		document.dispatchEvent(new CustomEvent("site:close-overlays"));
		closeNavigation();

		const section = document.getElementById(link.hash.slice(1));
		if (section) beginNavScrollJump(section);

		waitForScrollToSettle(() => snapIndicatorToIndex(index));
	});
});

document.addEventListener("keydown", (event) => {
	if (event.key !== "Escape") return;
	if (isSiteOverlayOpen()) return;
	if (!isNavigationOpen()) return;

	event.preventDefault();
	closeNavigation({ restoreFocus: true });
});

navIndicator?.addEventListener("transitionend", (event) => {
	if (
		event.target !== navIndicator ||
		event.propertyName !== "transform" ||
		!nav?.classList.contains("is-nav-settling")
	) {
		return;
	}

	nav.classList.remove("is-nav-settling");
});

window.addEventListener("scroll", queueScrollChromeUpdate, { passive: true });
window.addEventListener("resize", () => {
	invalidateSectionMetrics();
	queueNavCompactSync();
	queueScrollChromeUpdate();
	queueNavIndicatorUpdate();
});
syncNavCompactMode();
updateScrollChrome();
measureLinkMetrics();
queueNavIndicatorUpdate();

if (header && "ResizeObserver" in window) {
	new ResizeObserver(() => {
		invalidateSectionMetrics();
		queueNavCompactSync();
	}).observe(header);
}

if (nav && "ResizeObserver" in window) {
	new ResizeObserver(() => {
		measureLinkMetrics();
		queueNavIndicatorUpdate();
	}).observe(nav);
}

if (document.fonts?.ready) {
	document.fonts.ready.then(() => {
		navExpandedFitWidth = 0;
		invalidateSectionMetrics();
		syncNavCompactMode();
		measureLinkMetrics();
		queueNavIndicatorUpdate();
	});
}

const sectionVisibility = new Map<string, number>();
const sections = document.querySelectorAll<HTMLElement>("[data-nav-section]");

function setActiveNavigation() {
	if (!reducedMotion.matches) return;

	const active = [...sectionVisibility.entries()]
		.sort((a, b) => b[1] - a[1])
		.find(([, ratio]) => ratio > 0)?.[0];

	if (!active) return;

	let activeLink: HTMLAnchorElement | undefined;

	navLinks.forEach((link) => {
		const isCurrent = link.hash === `#${active}`;
		if (isCurrent) {
			link.setAttribute("aria-current", "page");
			activeLink = link;
		} else {
			link.removeAttribute("aria-current");
		}
	});

	queueNavIndicatorUpdate(activeLink);
}

const sectionObserver = new IntersectionObserver(
	(entries) => {
		if (!reducedMotion.matches) return;

		entries.forEach((entry) => {
			sectionVisibility.set(entry.target.id, entry.intersectionRatio);
		});
		setActiveNavigation();
	},
	{
		rootMargin: "-18% 0px -54% 0px",
		threshold: [0, 0.1, 0.25, 0.5, 0.75],
	},
);

sections.forEach((section) => sectionObserver.observe(section));

reducedMotion.addEventListener("change", () => {
	if (reducedMotion.matches) {
		wasNavTransitioning = false;
		nav?.classList.remove("is-scroll-tracking", "is-nav-settling");
		setActiveNavigation();
		return;
	}

	queueNavIndicatorUpdate();
});
