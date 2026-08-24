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

function boltEase(amount: number) {
	if (amount <= 0) return 0;
	if (amount >= 1) return 1;

	if (amount < 0.45) {
		return amount * amount * 0.35;
	}

	const rush = (amount - 0.45) / 0.55;
	return 0.071 + rush * rush * rush * 0.929;
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

function updateNavIndicatorFromScroll() {
	if (!nav || !navIndicator || !cachedLinkMetrics.length) return;

	if (reducedMotion.matches) return;

	const navSections = navLinks
		.map((link) => {
			const section = document.getElementById(link.hash.slice(1));
			return section ? { link, section } : null;
		})
		.filter(
			(entry): entry is { link: HTMLAnchorElement; section: HTMLElement } =>
				entry !== null,
		);

	if (!navSections.length) return;

	nav.classList.add("is-scroll-tracking");

	const scrollFocus = window.scrollY + window.innerHeight * 0.34;
	let fromIndex = navSections.length - 1;
	let rawProgress = 0;

	for (let index = 0; index < navSections.length - 1; index += 1) {
		const currentSection = navSections[index].section;
		const nextSection = navSections[index + 1].section;
		const zoneStart =
			getSectionScrollTop(currentSection) + currentSection.offsetHeight * 0.5;
		const zoneEnd =
			getSectionScrollTop(nextSection) + nextSection.offsetHeight * 0.12;

		if (scrollFocus < zoneStart) {
			fromIndex = index;
			rawProgress = 0;
			break;
		}

		if (scrollFocus >= zoneStart && scrollFocus < zoneEnd) {
			fromIndex = index;
			rawProgress = (scrollFocus - zoneStart) / (zoneEnd - zoneStart);
			break;
		}

		if (index === navSections.length - 2 && scrollFocus >= zoneEnd) {
			fromIndex = index + 1;
			rawProgress = 0;
		}
	}

	const easedProgress = boltEase(Math.min(1, Math.max(0, rawProgress)));
	const fromMetrics = cachedLinkMetrics[fromIndex];
	const toMetrics =
		cachedLinkMetrics[Math.min(fromIndex + 1, cachedLinkMetrics.length - 1)];

	if (!fromMetrics || !toMetrics) return;

	const isTransitioning =
		fromIndex < cachedLinkMetrics.length - 1 &&
		rawProgress > 0 &&
		rawProgress < 1;

	if (isTransitioning) {
		setIndicatorMetrics(
			slideIndicatorMetrics(fromMetrics, toMetrics, easedProgress),
		);
	} else {
		setIndicatorMetrics(fromMetrics);
	}

	const activeIndex =
		isTransitioning && rawProgress >= 0.68 ? fromIndex + 1 : fromIndex;

	navLinks.forEach((link, index) => {
		if (index === activeIndex) {
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

function updateScrollChrome() {
	header?.classList.toggle("site-header--scrolled", window.scrollY > 24);
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

navLinks.forEach((link) => link.addEventListener("click", closeNavigation));

document.addEventListener("keydown", (event) => {
	if (
		event.key === "Escape" &&
		navToggle?.getAttribute("aria-expanded") === "true"
	) {
		closeNavigation();
		navToggle.focus();
	}
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
		nav?.classList.remove("is-scroll-tracking");
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
let heroInView = true;

function syncHeroPlayback() {
	if (!heroVideo) return;

	if (reducedMotion.matches || document.hidden || !heroInView) {
		heroVideo.pause();
		return;
	}

	void heroVideo.play().catch(() => {
		// The poster remains visible if autoplay is unavailable.
	});
}

if (heroVideo && "IntersectionObserver" in window) {
	const heroMedia = heroVideo.closest(".hero__media") ?? heroVideo;

	new IntersectionObserver(
		([entry]) => {
			heroInView = entry?.isIntersecting ?? false;
			syncHeroPlayback();
		},
		{ threshold: 0.2 },
	).observe(heroMedia);
}

reducedMotion.addEventListener("change", syncHeroPlayback);
document.addEventListener("visibilitychange", syncHeroPlayback);
syncHeroPlayback();

const videoDialog = document.querySelector<HTMLDialogElement>(
	"[data-video-dialog]",
);
const videoPlayer = document.querySelector<HTMLElement>("[data-video-player]");
const videoTitle = document.querySelector<HTMLElement>(
	"[data-video-dialog-title]",
);
const externalLink = document.querySelector<HTMLAnchorElement>(
	"[data-video-external]",
);
let previousFocus: HTMLElement | null = null;

function unloadVideo() {
	videoPlayer?.replaceChildren();
	previousFocus?.focus();
	previousFocus = null;
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
	if (
		!link ||
		!videoDialog ||
		!videoPlayer ||
		typeof videoDialog.showModal !== "function"
	) {
		return;
	}

	const videoId = link.dataset.videoId;
	const title = link.dataset.videoTitle ?? "Project film";
	if (!videoId) return;

	event.preventDefault();
	previousFocus = link;

	const iframe = document.createElement("iframe");
	iframe.src = `https://player.vimeo.com/video/${videoId}?autoplay=1&title=0&byline=0&portrait=0&dnt=1`;
	iframe.title = title;
	iframe.allow = "autoplay; fullscreen; picture-in-picture";
	iframe.allowFullscreen = true;

	videoTitle?.replaceChildren(document.createTextNode(title));
	if (externalLink) externalLink.href = `https://vimeo.com/${videoId}`;
	videoPlayer.replaceChildren(iframe);
	videoDialog.showModal();
});

videoDialog?.addEventListener("click", (event) => {
	if (event.target === videoDialog) videoDialog.close();
});

videoDialog?.addEventListener("close", unloadVideo);
