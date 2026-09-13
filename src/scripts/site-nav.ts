import { forceTextRevealThrough } from "./text-reveal";

const header = document.querySelector<HTMLElement>("[data-header]");
const brand = document.querySelector<HTMLElement>(".site-brand");
const headerEnd = document.querySelector<HTMLElement>(".site-header__end");
const nav = document.querySelector<HTMLElement>("[data-nav]");
const navIndicator = document.querySelector<HTMLElement>(
	"[data-nav-indicator]",
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

function isNavCompact() {
	return document.documentElement.classList.contains("nav-is-compact");
}

function setNavCompact(compact: boolean) {
	const root = document.documentElement;
	const wasCompact = root.classList.contains("nav-is-compact");

	if (wasCompact === compact) return;

	root.classList.toggle("nav-is-compact", compact);

	if (wasCompact !== compact) {
		closeNavigation();
	}

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
	const fitWidth = side * 2 + navRect.width + gap * 2 + padX + NAV_FIT_CLEARANCE;

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
			root.classList.add("nav-is-compact");
			root.classList.remove("nav-is-measuring");
			void header?.offsetWidth;
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

	cachedLinkMetrics = navLinks.map((link) => {
		const rect = link.getBoundingClientRect();

		return {
			x: rect.left - navRect.left - insetX,
			y: rect.top - navRect.top - insetY,
			w: compact ? 3 : rect.width,
			h: rect.height,
		};
	});
}

function setIndicatorMetrics(metrics: {
	x: number;
	y: number;
	w: number;
	h: number;
}) {
	if (!nav || !navIndicator) return;

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

function getSectionScrollTop(section: HTMLElement) {
	return section.getBoundingClientRect().top + window.scrollY;
}

function getScrollAnchor() {
	const paddingTop =
		parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) ||
		0;

	return window.scrollY + paddingTop + 1;
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
	let activeIndex = 0;

	for (let index = 0; index < navSections.length; index += 1) {
		if (anchor >= getSectionScrollTop(navSections[index].section) - 2) {
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
		const nextSection = navSections[activeIndex + 1].section;
		const nextTop = getSectionScrollTop(nextSection);
		const leaveCurrent =
			getSectionScrollTop(currentSection) + currentSection.offsetHeight * 0.58;

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

	measureLinkMetrics();

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

function closeNavigation() {
	navToggle?.setAttribute("aria-expanded", "false");
	nav?.classList.remove("site-nav--open");
	document.body.classList.remove("nav-open");
}

navToggle?.addEventListener("click", () => {
	const shouldOpen = navToggle.getAttribute("aria-expanded") !== "true";

	navToggle.setAttribute("aria-expanded", shouldOpen.toString());
	nav?.classList.toggle("site-nav--open", shouldOpen);
	document.body.classList.toggle("nav-open", shouldOpen);

	if (shouldOpen) {
		queueNavIndicatorUpdate();
	}
});

/** Long hash jumps outrun opacity reveals â†’ dark empty viewport mid-scroll. */
const NAV_JUMP_REVEAL_VIEWPORTS = 1.25;

function revealContentThrough(section: HTMLElement) {
	const limit =
		getSectionScrollTop(section) + section.offsetHeight + window.innerHeight;

	document.querySelectorAll<HTMLElement>("[data-reveal]").forEach((item) => {
		const top = item.getBoundingClientRect().top + window.scrollY;
		if (top <= limit) item.classList.add("is-visible");
	});

	forceTextRevealThrough(limit);
}

function beginNavScrollJump(section: HTMLElement) {
	const distance = Math.abs(getSectionScrollTop(section) - window.scrollY);
	if (reducedMotion.matches || distance < window.innerHeight * NAV_JUMP_REVEAL_VIEWPORTS) {
		return;
	}

	const root = document.documentElement;
	root.classList.add("is-nav-scrolling");
	revealContentThrough(section);

	const endJump = () => {
		root.classList.remove("is-nav-scrolling");
	};

	if ("onscrollend" in window) {
		window.addEventListener("scrollend", endJump, { once: true });
		window.setTimeout(endJump, 2500);
		return;
	}

	let lastY = window.scrollY;
	let stableFrames = 0;
	const waitForScrollEnd = () => {
		if (!root.classList.contains("is-nav-scrolling")) return;

		if (Math.abs(window.scrollY - lastY) < 1) {
			stableFrames += 1;
			if (stableFrames >= 4) {
				endJump();
				return;
			}
		} else {
			stableFrames = 0;
			lastY = window.scrollY;
		}

		requestAnimationFrame(waitForScrollEnd);
	};

	requestAnimationFrame(waitForScrollEnd);
	window.setTimeout(endJump, 2500);
}

navLinks.forEach((link, index) => {
	link.addEventListener("click", () => {
		document.dispatchEvent(new CustomEvent("site:close-overlays"));
		closeNavigation();

		const section = document.getElementById(link.hash.slice(1));
		if (section) beginNavScrollJump(section);

		const finalizeSnap = () => snapIndicatorToIndex(index);

		const supportsScrollEnd = "onscrollend" in window;

		if (supportsScrollEnd) {
			window.addEventListener("scrollend", finalizeSnap, { once: true });
			return;
		}

		let lastY = window.scrollY;
		let stableFrames = 0;

		const waitForScrollEnd = () => {
			if (Math.abs(window.scrollY - lastY) < 1) {
				stableFrames += 1;
				if (stableFrames >= 4) {
					finalizeSnap();
					return;
				}
			} else {
				stableFrames = 0;
				lastY = window.scrollY;
			}

			requestAnimationFrame(waitForScrollEnd);
		};

		requestAnimationFrame(waitForScrollEnd);
	});
});

document.addEventListener("keydown", (event) => {
	if (event.key !== "Escape") return;

	if (navToggle?.getAttribute("aria-expanded") === "true") {
		closeNavigation();
		navToggle.focus();
	}
});

navIndicator?.addEventListener("transitionend", (event) => {
	if (
		event.target !== navIndicator ||
		event.propertyName !== "left" ||
		!nav?.classList.contains("is-nav-settling")
	) {
		return;
	}

	nav.classList.remove("is-nav-settling");
});

window.addEventListener("scroll", queueScrollChromeUpdate, { passive: true });
window.addEventListener("resize", () => {
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
