type FileClip = {
	src: string;
	poster?: string;
	width?: number;
	height?: number;
};

const videoDialog = document.querySelector<HTMLElement>("[data-video-dialog]");
const videoPanel = document.querySelector<HTMLElement>(".video-dialog__panel");
const videoPlayer = document.querySelector<HTMLElement>("[data-video-player]");
const videoBody = document.querySelector<HTMLElement>("[data-video-body]");
const videoTitle = document.querySelector<HTMLElement>(
	"[data-video-dialog-title]",
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
const videoPlaylist = document.querySelector<HTMLElement>(
	"[data-video-playlist]",
);
const videoPrev =
	document.querySelector<HTMLButtonElement>("[data-video-prev]");
const videoNext =
	document.querySelector<HTMLButtonElement>("[data-video-next]");
const videoPlaylistCount = document.querySelector<HTMLElement>(
	"[data-video-playlist-count]",
);

let fileClips: FileClip[] = [];
let fileClipIndex = 0;

function clipOrientation(clip: FileClip) {
	if (!clip.width || !clip.height) return "square";
	if (clip.height > clip.width * 1.15) return "portrait";
	if (clip.width > clip.height * 1.15) return "landscape";
	return "square";
}

function setPanelShape(orientation: string, playlist: boolean) {
	videoPanel?.classList.toggle(
		"video-dialog__panel--portrait",
		orientation === "portrait",
	);
	videoPanel?.classList.toggle(
		"video-dialog__panel--square",
		orientation === "square",
	);
	videoPanel?.classList.toggle("video-dialog__panel--playlist", playlist);
}

function playlistLabel(current: number, total: number) {
	return (videoDialog?.dataset.labelClipOf ?? "{current} / {total}")
		.replace("{current}", String(current))
		.replace("{total}", String(total));
}

function renderFileClip() {
	const clip = fileClips[fileClipIndex];
	if (!clip || !videoPlayer) return;

	const video = document.createElement("video");
	video.controls = true;
	video.autoplay = true;
	video.playsInline = true;
	video.preload = "metadata";
	if (clip.poster) video.poster = clip.poster;
	video.src = clip.src;
	videoPlayer.replaceChildren(video);
	void video.play();
	setPanelShape(clipOrientation(clip), fileClips.length > 1);

	if (videoPlaylistCount) {
		videoPlaylistCount.textContent = playlistLabel(
			fileClipIndex + 1,
			fileClips.length,
		);
	}
}

function stepFileClip(delta: number) {
	if (fileClips.length < 2) return;
	fileClipIndex = (fileClipIndex + delta + fileClips.length) % fileClips.length;
	renderFileClip();
}

document.addEventListener(
	"click",
	(event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const link = target.closest<HTMLElement>("[data-video]");
		if (!link || link.dataset.videoProvider !== "file") return;
		if (!videoDialog || !videoPlayer) return;

		let clips: FileClip[] = [];
		try {
			clips = JSON.parse(link.dataset.videoClips || "[]") as FileClip[];
		} catch {
			clips = [];
		}
		if (clips.length === 0) return;

		event.preventDefault();
		event.stopImmediatePropagation();

		fileClips = clips;
		const start = Number(link.dataset.videoIndex ?? 0);
		fileClipIndex =
			Number.isFinite(start) && start >= 0 && start < clips.length
				? Math.floor(start)
				: 0;
		videoTitle?.replaceChildren(
			document.createTextNode(link.dataset.videoTitle || "Short"),
		);
		if (aboutToggle) aboutToggle.hidden = true;
		if (aboutPanel) aboutPanel.hidden = true;
		videoBody?.classList.remove("video-dialog__body--about-open");
		if (externalLink) externalLink.hidden = true;
		if (videoPlaylist) videoPlaylist.hidden = clips.length < 2;
		renderFileClip();
		if (videoDialog) {
			videoDialog.hidden = false;
			videoDialog.dispatchEvent(
				new CustomEvent("video-dialog:open", { detail: link }),
			);
		}
	},
	true,
);

videoPrev?.addEventListener("click", (event) => {
	event.stopPropagation();
	stepFileClip(-1);
});
videoNext?.addEventListener("click", (event) => {
	event.stopPropagation();
	stepFileClip(1);
});

document.addEventListener("keydown", (event) => {
	if (!videoDialog || videoDialog.hidden || fileClips.length < 2) return;
	if (event.key === "ArrowRight") {
		event.preventDefault();
		stepFileClip(1);
	}
	if (event.key === "ArrowLeft") {
		event.preventDefault();
		stepFileClip(-1);
	}
});
