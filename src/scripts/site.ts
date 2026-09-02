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

navLinks.forEach((link, index) => {
	link.addEventListener("click", () => {
		if (isPhotoOpen()) closePhotoDialog();
		if (isAlbumOpen()) closeAlbum();
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

	if (isPhotoOpen()) {
		event.preventDefault();
		closePhotoDialog();
		return;
	}

	if (isAlbumOpen()) {
		event.preventDefault();
		closeAlbum();
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

const heroVideo = document.querySelector<HTMLVideoElement>("[data-hero-video]");

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

reducedMotion.addEventListener("change", syncHeroPlayback);
document.addEventListener("visibilitychange", syncHeroPlayback);
syncHeroPlayback();

const videoDialog = document.querySelector<HTMLElement>("[data-video-dialog]");
const videoPanel = document.querySelector<HTMLElement>(".video-dialog__panel");
const videoBackdrop = document.querySelector<HTMLElement>(
	"[data-video-backdrop]",
);
const videoClose =
	document.querySelector<HTMLButtonElement>("[data-video-close]");
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
let scrollLockCount = 0;
let aboutPanelOpen = true;
let albumFocus: HTMLElement | null = null;

function setAboutPanelOpen(open: boolean) {
	aboutPanelOpen = open;
	videoBody?.classList.toggle("video-dialog__body--about-open", open);
	aboutToggle?.setAttribute("aria-expanded", open ? "true" : "false");
	if (aboutPanel) aboutPanel.hidden = !open;
}

function lockDocumentScroll() {
	if (scrollLockCount === 0) {
		lockedScrollY = window.scrollY;
		document.documentElement.classList.add("video-open");
		document.body.style.position = "fixed";
		document.body.style.top = `-${lockedScrollY}px`;
		document.body.style.left = "0";
		document.body.style.right = "0";
		document.body.style.width = "100%";
	}
	scrollLockCount += 1;
}

function unlockDocumentScroll() {
	scrollLockCount = Math.max(0, scrollLockCount - 1);
	if (scrollLockCount > 0) return;

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
	const fallbackTitle = videoDialog?.dataset.labelProjectFilm ?? "Project film";
	const title = link.dataset.videoTitle ?? fallbackTitle;
	const description = link.dataset.videoDescription?.trim() ?? "";
	const provider =
		link.dataset.videoProvider === "youtube" ? "youtube" : "vimeo";
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
			description ||
			videoDialog?.dataset.labelNoDescription ||
			"No description available for this film yet.";
	}
	if (externalLink) {
		externalLink.href =
			provider === "youtube"
				? `https://www.youtube.com/watch?v=${videoId}`
				: `https://vimeo.com/${videoId}`;
	}
	externalLinkLabel?.replaceChildren(
		document.createTextNode(
			provider === "youtube"
				? (videoDialog?.dataset.labelOpenYoutube ?? "Open on YouTube")
				: (videoDialog?.dataset.labelOpenVimeo ?? "Open on Vimeo"),
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

const photoDialog = document.querySelector<HTMLElement>("[data-photo-dialog]");
const photoBackdrop = document.querySelector<HTMLElement>(
	"[data-photo-backdrop]",
);
const photoClose =
	document.querySelector<HTMLButtonElement>("[data-photo-close]");
const photoImage = document.querySelector<HTMLImageElement>(
	"[data-photo-dialog-image]",
);
const photoTitle = document.querySelector<HTMLElement>(
	"[data-photo-dialog-title]",
);
const photoPrev =
	document.querySelector<HTMLButtonElement>("[data-photo-prev]");
const photoNext =
	document.querySelector<HTMLButtonElement>("[data-photo-next]");
let photoGroup: Array<{ src: string; alt: string; title: string }> = [];
let photoIndex = 0;
let photoFocus: HTMLElement | null = null;

function isPhotoOpen() {
	return Boolean(photoDialog && !photoDialog.hidden);
}

function renderPhoto() {
	const item = photoGroup[photoIndex];
	if (!item || !photoImage) return;
	photoImage.src = item.src;
	photoImage.alt = item.alt;
	photoTitle?.replaceChildren(document.createTextNode(item.title));
}

function closePhotoDialog() {
	if (!isPhotoOpen()) return;
	if (photoDialog) photoDialog.hidden = true;
	if (photoImage) photoImage.src = "";
	unlockDocumentScroll();
	photoFocus?.focus({ preventScroll: true });
	photoFocus = null;
}

function openPhotoDialog(button: HTMLElement) {
	const src = button.dataset.photoSrc;
	const group = (button.dataset.photoGroup ?? "")
		.split("|")
		.filter(Boolean)
		.map((itemSrc) => {
			const match = document.querySelector<HTMLElement>(
				`[data-photo][data-photo-src="${CSS.escape(itemSrc)}"]`,
			);
			return {
				src: itemSrc,
				alt: match?.dataset.photoAlt ?? "",
				title: match?.dataset.photoTitle ?? "",
			};
		});
	if (!src || !photoDialog || group.length === 0) return;

	photoGroup = group;
	photoIndex = Number(button.dataset.photoIndex ?? 0) || 0;
	photoFocus = button;
	lockDocumentScroll();
	renderPhoto();
	photoDialog.hidden = false;
	photoClose?.focus({ preventScroll: true });
}

document.addEventListener("click", (event) => {
	const target = event.target;
	if (!(target instanceof Element)) return;
	const button = target.closest<HTMLElement>("[data-photo]");
	if (!button) return;
	event.preventDefault();
	openPhotoDialog(button);
});

photoClose?.addEventListener("click", closePhotoDialog);
photoBackdrop?.addEventListener("click", closePhotoDialog);
photoPrev?.addEventListener("click", () => {
	if (photoGroup.length === 0) return;
	photoIndex = (photoIndex - 1 + photoGroup.length) % photoGroup.length;
	renderPhoto();
});
photoNext?.addEventListener("click", () => {
	if (photoGroup.length === 0) return;
	photoIndex = (photoIndex + 1) % photoGroup.length;
	renderPhoto();
});

function isAlbumOpen() {
	return Boolean(document.querySelector("[data-album-panel]:not([hidden])"));
}

function closeAlbum() {
	const panel = document.querySelector<HTMLElement>(
		"[data-album-panel]:not([hidden])",
	);
	if (!panel) return;
	panel.hidden = true;
	document.documentElement.classList.remove("album-open");
	unlockDocumentScroll();
	albumFocus?.focus({ preventScroll: true });
	albumFocus = null;
}

function openAlbum(category: string, trigger?: HTMLElement | null) {
	const panel = document.querySelector<HTMLElement>(
		`[data-album-panel="${CSS.escape(category)}"]`,
	);
	if (!panel) return;

	if (isAlbumOpen() && panel.hidden) {
		closeAlbum();
	}

	albumFocus = trigger ?? albumFocus;
	if (panel.hidden) {
		lockDocumentScroll();
		document.documentElement.classList.add("album-open");
		panel.hidden = false;
	}
	panel
		.querySelectorAll<HTMLElement>("[data-reveal]")
		.forEach((item) => item.classList.add("is-visible"));
	panel
		.querySelector<HTMLButtonElement>("[data-album-close]")
		?.focus({ preventScroll: true });
}

document.addEventListener("click", (event) => {
	const target = event.target;
	if (!(target instanceof Element)) return;

	const opener = target.closest<HTMLElement>("[data-album-open]");
	if (opener) {
		event.preventDefault();
		openAlbum(opener.dataset.albumOpen ?? "", opener);
		return;
	}

	if (target.closest("[data-album-close], [data-album-backdrop]")) {
		event.preventDefault();
		closeAlbum();
	}
});
