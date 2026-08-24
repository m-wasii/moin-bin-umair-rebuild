const header = document.querySelector<HTMLElement>("[data-header]");
const progress = document.querySelector<HTMLElement>("[data-scroll-progress]");
const nav = document.querySelector<HTMLElement>("[data-nav]");
const navToggle =
	document.querySelector<HTMLButtonElement>("[data-nav-toggle]");
const navLinks = Array.from(
	document.querySelectorAll<HTMLAnchorElement>("[data-nav-link]"),
);

let scrollFrame = 0;

function updateScrollChrome() {
	const scrollable = document.documentElement.scrollHeight - window.innerHeight;
	const ratio = scrollable > 0 ? Math.min(window.scrollY / scrollable, 1) : 0;

	header?.classList.toggle("site-header--scrolled", window.scrollY > 24);
	progress?.style.setProperty("--scroll-progress", ratio.toString());
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
window.addEventListener("resize", queueScrollChromeUpdate);
updateScrollChrome();

const sectionVisibility = new Map<string, number>();
const sections = document.querySelectorAll<HTMLElement>("[data-nav-section]");

function setActiveNavigation() {
	const active = [...sectionVisibility.entries()]
		.sort((a, b) => b[1] - a[1])
		.find(([, ratio]) => ratio > 0)?.[0];

	if (!active) return;

	navLinks.forEach((link) => {
		const isCurrent = link.hash === `#${active}`;
		if (isCurrent) {
			link.setAttribute("aria-current", "page");
		} else {
			link.removeAttribute("aria-current");
		}
	});
}

const sectionObserver = new IntersectionObserver(
	(entries) => {
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

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
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
