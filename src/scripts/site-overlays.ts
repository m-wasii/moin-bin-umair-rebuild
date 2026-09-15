import {
	buildResponsiveImageAttrs,
	cfImageSrc,
	RESPONSIVE_WIDTHS,
} from "../lib/responsive-image";
import {
	blurIfInside,
	createFocusTrap,
	type FocusTrap,
} from "./focus-trap";
import { prefersReducedMotion } from "./motion";
import { lockDocumentScroll, unlockDocumentScroll } from "./site-scroll-lock";

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

const photoDialog = document.querySelector<HTMLElement>("[data-photo-dialog]");
const photoPanel = document.querySelector<HTMLElement>(".photo-dialog");
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

let previousFocus: HTMLElement | null = null;
let aboutPanelOpen = true;
let albumFocus: HTMLElement | null = null;
let photoFocus: HTMLElement | null = null;
let photoGroup: AlbumPhoto[] = [];
let photoIndex = 0;

let videoScrollLocked = false;
let photoScrollLocked = false;
let albumScrollLocked = false;

let videoTrap: FocusTrap | null = videoPanel
	? createFocusTrap(videoPanel)
	: null;
let photoTrap: FocusTrap | null = photoPanel
	? createFocusTrap(photoPanel)
	: null;
let albumTrap: FocusTrap | null = null;
let albumTrapRoot: HTMLElement | null = null;

function cfImagesEnabled() {
	return document.documentElement.dataset.cfImages !== "0";
}

interface AlbumPhoto {
	src: string;
	alt: string;
}

function closeNavigationOverlay() {
	document.dispatchEvent(new CustomEvent("site:close-nav"));
}

function acquireScrollLock(flag: "video" | "photo" | "album") {
	if (flag === "video") {
		if (videoScrollLocked) return;
		lockDocumentScroll();
		videoScrollLocked = true;
		return;
	}
	if (flag === "photo") {
		if (photoScrollLocked) return;
		lockDocumentScroll();
		photoScrollLocked = true;
		return;
	}
	if (albumScrollLocked) return;
	lockDocumentScroll();
	albumScrollLocked = true;
}

function releaseScrollLock(flag: "video" | "photo" | "album") {
	if (flag === "video") {
		if (!videoScrollLocked) return;
		unlockDocumentScroll();
		videoScrollLocked = false;
		return;
	}
	if (flag === "photo") {
		if (!photoScrollLocked) return;
		unlockDocumentScroll();
		photoScrollLocked = false;
		return;
	}
	if (!albumScrollLocked) return;
	unlockDocumentScroll();
	albumScrollLocked = false;
}

function setAboutPanelOpen(open: boolean) {
	aboutPanelOpen = open;
	videoBody?.classList.toggle("video-dialog__body--about-open", open);
	aboutToggle?.setAttribute("aria-expanded", open ? "true" : "false");
	if (aboutPanel) aboutPanel.hidden = !open;
}

function isVideoOpen() {
	return Boolean(videoDialog && !videoDialog.hidden);
}

function isPhotoOpen() {
	return Boolean(photoDialog && !photoDialog.hidden);
}

function getOpenAlbumPanel() {
	return document.querySelector<HTMLElement>(
		"[data-album-panel]:not([hidden])",
	);
}

function isAlbumOpen() {
	return Boolean(getOpenAlbumPanel());
}

function getAlbumDialog(panel: HTMLElement) {
	return panel.querySelector<HTMLElement>('[role="dialog"]');
}

function activateAlbumTrap(
	panel: HTMLElement,
	initialFocus?: HTMLElement | null,
) {
	const dialog = getAlbumDialog(panel);
	if (!dialog) return;

	if (albumTrapRoot !== dialog) {
		albumTrap?.deactivate();
		albumTrap = createFocusTrap(dialog);
		albumTrapRoot = dialog;
	}
	albumTrap?.activate(initialFocus ?? null);
}

function suspendAlbumForNestedPhoto() {
	const panel = getOpenAlbumPanel();
	if (!panel) return;
	albumTrap?.deactivate();
	panel.setAttribute("inert", "");
}

function resumeAlbumAfterNestedPhoto(restoreFocus?: HTMLElement | null) {
	const panel = getOpenAlbumPanel();
	if (!panel) return;
	panel.removeAttribute("inert");
	activateAlbumTrap(panel, restoreFocus ?? null);
}

function closeVideoDialog() {
	if (!isVideoOpen()) return;

	videoTrap?.deactivate();
	blurIfInside(videoDialog);
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
	releaseScrollLock("video");
	previousFocus?.focus({ preventScroll: true });
	previousFocus = null;
}

function openVideoOverlay(initialFocus?: HTMLElement | null) {
	if (!videoDialog) return;

	closeNavigationOverlay();
	if (isPhotoOpen()) closePhotoDialog({ resumeAlbum: false });
	if (isAlbumOpen()) closeAlbum({ clearHash: true });

	videoDialog.hidden = false;
	acquireScrollLock("video");
	videoTrap?.activate(initialFocus ?? videoClose ?? null);
}

function closePhotoDialog(options?: { resumeAlbum?: boolean }) {
	if (!isPhotoOpen()) return;

	const shouldResumeAlbum = options?.resumeAlbum !== false;

	photoTrap?.deactivate();
	blurIfInside(photoDialog);
	if (photoDialog) photoDialog.hidden = true;
	if (photoImage) {
		photoImage.removeAttribute("src");
		photoImage.alt = "";
	}
	photoGroup = [];
	photoIndex = 0;
	releaseScrollLock("photo");

	const restore = photoFocus;
	photoFocus = null;

	if (shouldResumeAlbum && isAlbumOpen()) {
		resumeAlbumAfterNestedPhoto(restore);
		restore?.focus({ preventScroll: true });
		return;
	}

	restore?.focus({ preventScroll: true });
}

function closeAlbum(options?: { clearHash?: boolean }) {
	const panel = getOpenAlbumPanel();
	if (!panel) return;

	if (isPhotoOpen()) closePhotoDialog({ resumeAlbum: false });

	albumTrap?.deactivate();
	albumTrap = null;
	albumTrapRoot = null;
	blurIfInside(panel);
	panel.removeAttribute("inert");
	panel.hidden = true;
	releaseScrollLock("album");
	albumFocus?.focus({ preventScroll: true });
	albumFocus = null;

	if (options?.clearHash && location.hash.startsWith("#album-")) {
		try {
			history.replaceState(null, "", `${location.pathname}${location.search}`);
		} catch {
			/* ignore */
		}
	}
}

function closeAllOverlays() {
	if (isVideoOpen()) closeVideoDialog();
	if (isPhotoOpen()) closePhotoDialog({ resumeAlbum: false });
	if (isAlbumOpen()) closeAlbum({ clearHash: true });
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
	const fallbackTitle = videoDialog.dataset.labelProjectFilm ?? "Project film";
	const title = link.dataset.videoTitle ?? fallbackTitle;
	const description = link.dataset.videoDescription?.trim() ?? "";
	const provider =
		link.dataset.videoProvider === "youtube" ? "youtube" : "vimeo";
	if (!videoId) return;

	event.preventDefault();
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
			videoDialog.dataset.labelNoDescription ||
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
				? (videoDialog.dataset.labelOpenYoutube ?? "Open on YouTube")
				: (videoDialog.dataset.labelOpenVimeo ?? "Open on Vimeo"),
		),
	);
	if (aboutToggle) aboutToggle.hidden = !description;
	setAboutPanelOpen(Boolean(description));
	videoPlayer.replaceChildren(iframe);
	openVideoOverlay(videoClose);
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
	openVideoOverlay(videoClose);
});

videoClose?.addEventListener("click", closeVideoDialog);
videoBackdrop?.addEventListener("click", closeVideoDialog);

function lightboxSrc(src: string) {
	return cfImageSrc(src, 1600, { enabled: cfImagesEnabled() });
}

function renderPhoto() {
	const item = photoGroup[photoIndex];
	if (!item || !photoImage) return;
	photoImage.src = lightboxSrc(item.src);
	photoImage.alt = item.alt;
	photoImage.width = 1600;
	photoImage.height = 2000;
	photoImage.decoding = "async";
}

function stepPhoto(delta: number) {
	if (!isPhotoOpen() || photoGroup.length === 0) return;
	photoIndex = (photoIndex + delta + photoGroup.length) % photoGroup.length;
	renderPhoto();
}

function readAlbumPhotos(panel: HTMLElement): AlbumPhoto[] {
	const jsonEl = panel.querySelector<HTMLScriptElement>("[data-album-photos]");
	if (!jsonEl?.textContent) return [];
	try {
		const parsed = JSON.parse(jsonEl.textContent) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(item): item is AlbumPhoto =>
				Boolean(
					item &&
						typeof item === "object" &&
						typeof (item as AlbumPhoto).src === "string",
				),
		);
	} catch {
		return [];
	}
}

function albumPhotoGroup(panel: HTMLElement): AlbumPhoto[] {
	const cached = panel.dataset.albumPhotosCache;
	if (cached) {
		try {
			const parsed = JSON.parse(cached) as unknown;
			if (Array.isArray(parsed)) {
				return parsed.filter(
					(item): item is AlbumPhoto =>
						Boolean(
							item &&
								typeof item === "object" &&
								typeof (item as AlbumPhoto).src === "string",
						),
				);
			}
		} catch {
			/* rebuild */
		}
	}
	const photos = readAlbumPhotos(panel);
	try {
		panel.dataset.albumPhotosCache = JSON.stringify(photos);
	} catch {
		/* ignore quota / serialization issues */
	}
	return photos;
}

function ensureAlbumMasonry(panel: HTMLElement) {
	const list = panel.querySelector<HTMLElement>("[data-album-masonry]");
	if (!list || list.dataset.hydrated === "1") return;

	const photos = albumPhotoGroup(panel);
	const useCf = cfImagesEnabled();
	const frag = document.createDocumentFragment();

	photos.forEach((photo, index) => {
		const li = document.createElement("li");
		li.className = `album-masonry__item album-masonry__item--${(index % 5) + 1}`;

		const button = document.createElement("button");
		button.className = "photo-card";
		button.type = "button";
		button.dataset.photo = "";
		button.dataset.photoSrc = photo.src;
		button.dataset.photoAlt = photo.alt;
		button.dataset.photoIndex = String(index);
		button.setAttribute("aria-label", photo.alt || "Photo");

		const attrs = buildResponsiveImageAttrs({
			src: photo.src,
			widths: RESPONSIVE_WIDTHS.album,
			sizes: "(max-width: 760px) 90vw, 42vw",
			width: 1200,
			height: 1500,
			loading: "lazy",
			decoding: "async",
			alt: photo.alt,
			cfImages: useCf,
		});

		const img = document.createElement("img");
		img.src = attrs.src;
		if (attrs.srcset) img.srcset = attrs.srcset;
		if (attrs.sizes) img.sizes = attrs.sizes;
		img.width = attrs.width;
		img.height = attrs.height;
		img.alt = attrs.alt ?? "";
		img.loading = "lazy";
		img.decoding = "async";

		button.appendChild(img);
		li.appendChild(button);
		frag.appendChild(li);
	});

	list.replaceChildren(frag);
	list.dataset.hydrated = "1";
}

function openPhotoDialog(button: HTMLElement) {
	const src = button.dataset.photoSrc;
	if (!src || !photoDialog) return;

	const panel = button.closest<HTMLElement>("[data-album-panel]");
	let group: AlbumPhoto[] = [];

	if (panel) {
		group = albumPhotoGroup(panel);
	} else {
		const groupSrcs = (button.dataset.photoGroup ?? "")
			.split("|")
			.filter(Boolean);
		group = groupSrcs.map((itemSrc) => {
			let match: HTMLElement | null = null;
			try {
				match = document.querySelector<HTMLElement>(
					`[data-photo][data-photo-src="${CSS.escape(itemSrc)}"]`,
				);
			} catch {
				match = null;
			}
			return {
				src: itemSrc,
				alt: match?.dataset.photoAlt ?? "",
			};
		});
	}

	if (group.length === 0) return;

	closeNavigationOverlay();
	if (isVideoOpen()) closeVideoDialog();

	const nestedInAlbum = Boolean(panel && !panel.hidden);
	if (!nestedInAlbum && isAlbumOpen()) {
		closeAlbum({ clearHash: true });
	}

	photoGroup = group;
	const rawIndex = Number(button.dataset.photoIndex ?? 0);
	photoIndex =
		Number.isFinite(rawIndex) && rawIndex >= 0 && rawIndex < group.length
			? Math.floor(rawIndex)
			: Math.max(
					0,
					group.findIndex((item) => item.src === src),
				);
	photoFocus = button;

	if (nestedInAlbum) suspendAlbumForNestedPhoto();

	acquireScrollLock("photo");
	renderPhoto();
	photoDialog.hidden = false;
	photoTrap?.activate(photoClose);
}

document.addEventListener("click", (event) => {
	const target = event.target;
	if (!(target instanceof Element)) return;
	const button = target.closest<HTMLElement>("[data-photo]");
	if (!button) return;
	event.preventDefault();
	openPhotoDialog(button);
});

photoClose?.addEventListener("click", () => closePhotoDialog());
photoBackdrop?.addEventListener("click", () => closePhotoDialog());
photoPrev?.addEventListener("click", () => {
	stepPhoto(-1);
});
photoNext?.addEventListener("click", () => {
	stepPhoto(1);
});

function openAlbum(category: string, trigger?: HTMLElement | null) {
	if (!category) return;

	let panel: HTMLElement | null = null;
	try {
		panel = document.querySelector<HTMLElement>(
			`[data-album-panel="${CSS.escape(category)}"]`,
		);
	} catch {
		return;
	}
	if (!panel) return;

	closeNavigationOverlay();
	if (isVideoOpen()) closeVideoDialog();
	if (isPhotoOpen()) closePhotoDialog({ resumeAlbum: false });

	const existing = getOpenAlbumPanel();
	if (existing && existing !== panel) {
		albumTrap?.deactivate();
		albumTrap = null;
		albumTrapRoot = null;
		blurIfInside(existing);
		existing.removeAttribute("inert");
		existing.hidden = true;
		/* keep albumScrollLocked — same overlay layer */
	}

	albumFocus = trigger ?? albumFocus;
	ensureAlbumMasonry(panel);
	if (panel.hidden) {
		acquireScrollLock("album");
		panel.hidden = false;
	}

	panel
		.querySelectorAll<HTMLElement>("[data-reveal]")
		.forEach((item) => item.classList.add("is-visible"));

	const closeBtn = panel.querySelector<HTMLButtonElement>("[data-album-close]");
	activateAlbumTrap(panel, closeBtn);

	if (location.hash !== `#album-${category}`) {
		try {
			history.replaceState(
				null,
				"",
				`${location.pathname}${location.search}#album-${category}`,
			);
		} catch {
			/* ignore */
		}
	}
}

function syncAlbumFromHash() {
	const hash = location.hash;
	if (!hash.startsWith("#album-")) return;
	let category = "";
	try {
		category = decodeURIComponent(hash.slice("#album-".length));
	} catch {
		return;
	}
	if (!category) return;

	let opener: HTMLElement | null = null;
	try {
		opener = document.querySelector<HTMLElement>(
			`[data-album-open="${CSS.escape(category)}"]`,
		);
	} catch {
		opener = null;
	}
	openAlbum(category, opener);
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
				behavior: prefersReducedMotion() ? "auto" : "smooth",
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
		closeAlbum({ clearHash: true });
	}
});

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
			event.stopPropagation();
			closeVideoDialog();
			return;
		}

		if (isPhotoOpen()) {
			event.preventDefault();
			event.stopPropagation();
			closePhotoDialog();
			return;
		}

		if (isAlbumOpen()) {
			event.preventDefault();
			event.stopPropagation();
			closeAlbum({ clearHash: true });
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

syncAlbumFromHash();
window.addEventListener("hashchange", syncAlbumFromHash);
