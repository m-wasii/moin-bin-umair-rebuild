const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const heroMedia = document.querySelector<HTMLElement>("[data-hero-media]");
const heroVideo = document.querySelector<HTMLVideoElement>("[data-hero-video]");
let heroSourceAttached = false;

function attachHeroSource() {
	if (!heroVideo || heroSourceAttached) return;
	const src = heroVideo.dataset.heroSrc;
	if (!src) return;
	const source = document.createElement("source");
	source.src = src;
	source.type = "video/mp4";
	heroVideo.appendChild(source);
	heroVideo.load();
	heroSourceAttached = true;
}

function syncHeroPlayback() {
	if (!heroVideo) return;

	if (reducedMotion.matches || document.hidden) {
		heroVideo.pause();
		return;
	}

	attachHeroSource();
	void heroVideo.play().then(() => {
		heroMedia?.classList.add("is-playing");
	}).catch(() => {
		// The poster remains visible if autoplay is unavailable.
	});
}

function scheduleHeroPlayback() {
	if (!heroVideo || reducedMotion.matches) return;

	const start = () => syncHeroPlayback();
	const ric = window.requestIdleCallback?.bind(window);
	if (ric) {
		ric(start, { timeout: 2000 });
	} else {
		window.setTimeout(start, 600);
	}
}

reducedMotion.addEventListener("change", syncHeroPlayback);
document.addEventListener("visibilitychange", syncHeroPlayback);
scheduleHeroPlayback();
