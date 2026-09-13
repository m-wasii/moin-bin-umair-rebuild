import { lockDocumentScroll, unlockDocumentScroll } from "./site-scroll-lock";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

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
let aboutPanelOpen = true;
let albumFocus: HTMLElement | null = null;

function setAboutPanelOpen(open: boolean) {
	aboutPanelOpen = open;
	videoBody?.classList.toggle("video-dialog__body--about-open", open);
	aboutToggle?.setAttribute("aria-expanded", open ? "true" : "false");
	if (aboutPanel) aboutPanel.hidden = !open;
}

function isVideoOpen() {
	return Boolean(videoDialog && !videoDialog.hidden);
}

function closeVideoDialog() {
	if (!isVideoOpen()) return;

	videoPlayer?.replaceChildren();
	if (videoDescription) videoDescription.textContent = "";
	videoPanel?.classList.remove(
		"video-dialog__panel--portrait",
		"video-dialog__panel--square",
		"video-dialog__panel--playlist",
	);
	const playlist = document.querySelector<HTMLElement>("[data-video-playlist]");
	if (playlist) playlist.hidden = true;
	if (aboutToggle) aboutToggle.hidden = false;
	if (externalLink) externalLink.hidden = false;
	setAboutPanelOpen(true);
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

	const link = target.closest<HTMLElement>("[data-video]");
	if (!link || !videoDialog || !videoPlayer) {
		return;
	}

	if (link.dataset.videoProvider === "file") return;

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

videoDialog?.addEventListener("video-dialog:open", (event) => {
	const source =
		event instanceof CustomEvent && event.detail instanceof HTMLElement
			? event.detail
			: null;
	previousFocus = source;
	lockDocumentScroll();
	videoClose?.focus({ preventScroll: true });
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
const photoPrev =
	document.querySelector<HTMLButtonElement>("[data-photo-prev]");
const photoNext =
	document.querySelector<HTMLButtonElement>("[data-photo-next]");
let photoGroup: Array<{ src: string; alt: string }> = [];
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
}

function stepPhoto(delta: number) {
	if (!isPhotoOpen() || photoGroup.length === 0) return;
	photoIndex = (photoIndex + delta + photoGroup.length) % photoGroup.length;
	renderPhoto();
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
	stepPhoto(-1);
});
photoNext?.addEventListener("click", () => {
	stepPhoto(1);
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

	const expandToggle = target.closest<HTMLButtonElement>("[data-work-expand]");
	if (expandToggle) {
		const section = expandToggle.closest<HTMLElement>("[data-work-expandable]");
		if (!section) return;

		const expanded = expandToggle.getAttribute("aria-expanded") !== "true";
		const overflowCards = section.querySelectorAll<HTMLElement>(
			"[data-work-overflow]",
		);
		const label = expandToggle.querySelector<HTMLElement>(
			"[data-work-expand-label]",
		);

		overflowCards.forEach((card) => {
			card.hidden = !expanded;
			if (expanded) card.classList.add("is-visible");
		});

		expandToggle.setAttribute("aria-expanded", expanded.toString());
		if (label) {
			label.textContent = expanded
				? (expandToggle.dataset.labelLess ?? label.textContent)
				: (expandToggle.dataset.labelMore ?? label.textContent);
		}

		if (!expanded) {
			const heading = section.querySelector<HTMLElement>(".section-heading");
			const scrollTarget = heading ?? expandToggle;
			scrollTarget.scrollIntoView({
				block: "nearest",
				behavior: reducedMotion.matches ? "auto" : "smooth",
			});
		}

		return;
	}

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

function closeAllOverlays() {
	if (isVideoOpen()) closeVideoDialog();
	if (isPhotoOpen()) closePhotoDialog();
	if (isAlbumOpen()) closeAlbum();
}

document.addEventListener("site:close-overlays", closeAllOverlays);

function isEditableKeyboardTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	const tag = target.tagName;
	return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

document.addEventListener("keydown", (event) => {
	if (event.key === "Escape") {
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
		}
		return;
	}

	if (isEditableKeyboardTarget(event.target)) return;

	if (
		isPhotoOpen() &&
		(event.key === "ArrowLeft" || event.key === "ArrowRight")
	) {
		event.preventDefault();
		stepPhoto(event.key === "ArrowLeft" ? -1 : 1);
	}
});
