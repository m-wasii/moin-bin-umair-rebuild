const header = document.querySelector<HTMLElement>("[data-header]");
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

let scrollFrame = 0;
let navIndicatorFrame = 0;
let wasNavTransitioning = false;
let cachedLinkMetrics: Array<{
	x: number;
	y: number;
	w: number;
	h: number;
}> = [];

function measureLinkMetrics() {
	if (!nav) return;

	const navRect = nav.getBoundingClientRect();
	const navStyles = getComputedStyle(nav);
	const insetX = parseFloat(navStyles.borderLeftWidth) || 0;
	const insetY = parseFloat(navStyles.borderTopWidth) || 0;
	const isMobile = window.matchMedia("(max-width: 760px)").matches;

	cachedLinkMetrics = navLinks.map((link) => {
		const rect = link.getBoundingClientRect();

		return {
			x: rect.left - navRect.left - insetX,
			y: rect.top - navRect.top - insetY,
			w: isMobile ? 3 : rect.width,
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

const heroVideo = document.querySelector<HTMLVideoElement>("[data-hero-video]");
const heroMedia = document.querySelector<HTMLElement>("[data-hero-media]");
const heroSection = document.getElementById("home");
const HERO_DIM_STEPS = 24;

let lastHeroDimStep = -1;

function smoothstep(amount: number) {
	const t = Math.min(Math.max(amount, 0), 1);
	return t * t * (3 - 2 * t);
}

function updateHeroBackdrop() {
	if (!heroMedia || !heroSection) return;

	if (reducedMotion.matches) {
		if (lastHeroDimStep !== 0) {
			heroMedia.style.setProperty("--hero-dim", "0");
			lastHeroDimStep = 0;
		}
		return;
	}

	const heroHeight = Math.max(heroSection.offsetHeight, 1);
	const progress = smoothstep(window.scrollY / heroHeight);
	const step = Math.round(progress * HERO_DIM_STEPS);

	if (step === lastHeroDimStep) return;

	lastHeroDimStep = step;
	heroMedia.style.setProperty(
		"--hero-dim",
		(step / HERO_DIM_STEPS).toFixed(3),
	);

	if (!heroVideo) return;

	if (progress >= 0.85) {
		if (!heroVideo.paused) heroVideo.pause();
	} else if (heroVideo.paused && !document.hidden) {
		void heroVideo.play().catch(() => {});
	}
}

function updateScrollChrome() {
	header?.classList.toggle("site-header--scrolled", window.scrollY > 24);
	updateHeaderVisibility();
	queueNavIndicatorUpdate();
	updateHeroBackdrop();
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

navLinks.forEach((link, index) => {
	link.addEventListener("click", () => {
		closeNavigation();

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

	if (isVideoOpen()) {
		event.preventDefault();
		closeVideoDialog();
		return;
	}

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
	queueScrollChromeUpdate();
	queueNavIndicatorUpdate();
});
updateScrollChrome();
measureLinkMetrics();
queueNavIndicatorUpdate();

if (nav && "ResizeObserver" in window) {
	new ResizeObserver(() => {
		measureLinkMetrics();
		queueNavIndicatorUpdate();
	}).observe(nav);
}

if (document.fonts?.ready) {
	document.fonts.ready.then(() => {
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
	syncHeroPlayback();
	updateHeroBackdrop();

	if (reducedMotion.matches) {
		wasNavTransitioning = false;
		nav?.classList.remove("is-scroll-tracking", "is-nav-settling");
		setActiveNavigation();
		return;
	}

	queueNavIndicatorUpdate();
});

const revealItems = document.querySelectorAll<HTMLElement>("[data-reveal]");

if (reducedMotion.matches || !("IntersectionObserver" in window)) {
	revealItems.forEach((item) => item.classList.add("is-visible"));
} else {
	const revealObserver = new IntersectionObserver(
		(entries, observer) => {
			entries.forEach((entry) => {
				if (!entry.isIntersecting) return;
				entry.target.classList.add("is-visible");
				observer.unobserve(entry.target);
			});
		},
		{ rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
	);

	revealItems.forEach((item) => revealObserver.observe(item));
}

function syncHeroPlayback() {
	if (!heroVideo) return;

	if (reducedMotion.matches || document.hidden) {
		heroVideo.pause();
		return;
	}

	void heroVideo.play().catch(() => {
		// The poster remains visible if autoplay is unavailable.
	});
}

document.addEventListener("visibilitychange", syncHeroPlayback);
syncHeroPlayback();

const videoDialog = document.querySelector<HTMLElement>("[data-video-dialog]");
const videoPanel = document.querySelector<HTMLElement>(".video-dialog__panel");
const videoBackdrop = document.querySelector<HTMLElement>("[data-video-backdrop]");
const videoClose = document.querySelector<HTMLButtonElement>("[data-video-close]");
const videoPlayer = document.querySelector<HTMLElement>("[data-video-player]");
const videoBody = document.querySelector<HTMLElement>("[data-video-body]");
const videoTitle = document.querySelector<HTMLElement>(
	"[data-video-dialog-title]",
);
const videoDescription = document.querySelector<HTMLElement>(
	"[data-video-dialog-description]",
);
const aboutToggle = document.querySelector<HTMLButtonElement>(
	"[data-video-about-toggle]",
);
const aboutPanel = document.querySelector<HTMLElement>(
	"[data-video-about-panel]",
);
const externalLink = document.querySelector<HTMLAnchorElement>(
	"[data-video-external]",
);
const externalLinkLabel = document.querySelector<HTMLElement>(
	"[data-video-external-label]",
);
let previousFocus: HTMLElement | null = null;
let lockedScrollY = 0;
let aboutPanelOpen = true;

function setAboutPanelOpen(open: boolean) {
	aboutPanelOpen = open;
	videoBody?.classList.toggle("video-dialog__body--about-open", open);
	aboutToggle?.setAttribute("aria-expanded", open ? "true" : "false");
	if (aboutPanel) aboutPanel.hidden = !open;
}

function lockDocumentScroll() {
	lockedScrollY = window.scrollY;
	document.documentElement.classList.add("video-open");
	document.body.style.position = "fixed";
	document.body.style.top = `-${lockedScrollY}px`;
	document.body.style.left = "0";
	document.body.style.right = "0";
	document.body.style.width = "100%";
}

function unlockDocumentScroll() {
	const scrollY = lockedScrollY;
	document.documentElement.classList.remove("video-open");
	document.body.style.position = "";
	document.body.style.top = "";
	document.body.style.left = "";
	document.body.style.right = "";
	document.body.style.width = "";

	const { scrollBehavior } = document.documentElement.style;
	document.documentElement.style.scrollBehavior = "auto";
	window.scrollTo(0, scrollY);
	document.documentElement.style.scrollBehavior = scrollBehavior;
}

function isVideoOpen() {
	return Boolean(videoDialog && !videoDialog.hidden);
}

function closeVideoDialog() {
	if (!isVideoOpen()) return;

	videoPlayer?.replaceChildren();
	if (videoDescription) videoDescription.textContent = "";
	videoPanel?.classList.remove("video-dialog__panel--portrait");
	if (videoDialog) videoDialog.hidden = true;
	unlockDocumentScroll();
	previousFocus?.focus({ preventScroll: true });
	previousFocus = null;
}

function openVideoOverlay() {
	if (!videoDialog) return;

	videoDialog.hidden = false;
	videoClose?.focus({ preventScroll: true });
}

document.addEventListener("click", (event) => {
	if (
		event.defaultPrevented ||
		event.button !== 0 ||
		event.metaKey ||
		event.ctrlKey ||
		event.shiftKey ||
		event.altKey
	) {
		return;
	}

	const target = event.target;
	if (!(target instanceof Element)) return;

	const link = target.closest<HTMLAnchorElement>("[data-video]");
	if (!link || !videoDialog || !videoPlayer) {
		return;
	}

	const videoId = link.dataset.videoId;
	const title = link.dataset.videoTitle ?? "Project film";
	const description = link.dataset.videoDescription?.trim() ?? "";
	const provider = link.dataset.videoProvider === "youtube" ? "youtube" : "vimeo";
	if (!videoId) return;

	event.preventDefault();
	lockDocumentScroll();
	previousFocus = link;

	const iframe = document.createElement("iframe");
	iframe.src =
		provider === "youtube"
			? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`
			: `https://player.vimeo.com/video/${videoId}?autoplay=1&title=0&byline=0&portrait=0&dnt=1`;
	iframe.title = title;
	iframe.allow =
		provider === "youtube"
			? "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
			: "autoplay; fullscreen; picture-in-picture";
	iframe.allowFullscreen = true;
	iframe.referrerPolicy = "strict-origin-when-cross-origin";

	const isPortrait = link.dataset.videoOrientation === "portrait";
	videoPanel?.classList.toggle("video-dialog__panel--portrait", isPortrait);

	videoTitle?.replaceChildren(document.createTextNode(title));
	if (videoDescription) {
		videoDescription.textContent =
			description || "No description available for this film yet.";
	}
	if (externalLink) {
		externalLink.href =
			provider === "youtube"
				? `https://www.youtube.com/watch?v=${videoId}`
				: `https://vimeo.com/${videoId}`;
	}
	externalLinkLabel?.replaceChildren(
		document.createTextNode(
			provider === "youtube" ? "Open on YouTube" : "Open on Vimeo",
		),
	);
	if (aboutToggle) aboutToggle.hidden = !description;
	setAboutPanelOpen(Boolean(description));
	videoPlayer.replaceChildren(iframe);
	openVideoOverlay();
});

aboutToggle?.addEventListener("click", (event) => {
	event.stopPropagation();
	setAboutPanelOpen(!aboutPanelOpen);
});

videoClose?.addEventListener("click", closeVideoDialog);
videoBackdrop?.addEventListener("click", closeVideoDialog);
