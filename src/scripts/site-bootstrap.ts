import "./site-nav.ts";

let overlaysPromise: Promise<unknown> | null = null;

function loadOverlays() {
	if (!overlaysPromise) {
		overlaysPromise = import("./site-overlays.ts");
	}
	return overlaysPromise;
}

const schedule =
	window.requestIdleCallback?.bind(window) ??
	((fn: () => void, opts?: { timeout?: number }) =>
		window.setTimeout(fn, opts?.timeout ?? 1));

schedule(() => void import("./site-reveal.ts"), { timeout: 400 });
schedule(() => void import("./site-hero.ts"), { timeout: 800 });

const hasOverlays = Boolean(
	document.querySelector(
		"[data-video-dialog], [data-photo-dialog], [data-album-panel]",
	),
);

if (hasOverlays) {
	schedule(() => loadOverlays(), { timeout: 1500 });

	document.addEventListener(
		"click",
		(event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			if (
				target.closest(
					"[data-photo], [data-video]:not([data-video-provider='file']), [data-album-open], [data-work-expand]",
				)
			) {
				void loadOverlays();
			}
		},
		{ capture: true, passive: true },
	);
}
