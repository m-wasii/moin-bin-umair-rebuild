/**
 * Hero workspace — singleton live preview + safe loop/poster replacement.
 * Depends on DashToast, DashOverlays, DashRevisions (Phase 3A).
 */
(function () {
	const ROOT = document.querySelector("[data-hero-workspace]");
	if (!ROOT) return;

	/** @type {{ writable: boolean, version: string, catalogVersion: string | null, loop: any, poster: any }} */
	let state = {
		writable: false,
		version: "",
		catalogVersion: null,
		loop: null,
		poster: null,
	};

	const els = {
		form: ROOT.querySelector("[data-hero-form]"),
		loopInput: ROOT.querySelector("[data-hero-loop-input]"),
		posterInput: ROOT.querySelector("[data-hero-poster-input]"),
		pending: ROOT.querySelector("[data-hero-pending]"),
		pendingDetail: ROOT.querySelector("[data-hero-pending-detail]"),
		pendingPreview: ROOT.querySelector("[data-hero-pending-preview]"),
		status: ROOT.querySelector("[data-hero-status]"),
		apply: ROOT.querySelector("[data-hero-apply]"),
		clear: ROOT.querySelector("[data-hero-clear]"),
		version: ROOT.querySelector("[data-hero-version]"),
		posterImg: ROOT.querySelector("[data-hero-poster-img]"),
		posterMeta: ROOT.querySelector("[data-hero-poster-meta]"),
		loopVideo: ROOT.querySelector("[data-hero-loop-video]"),
		loopSource: ROOT.querySelector("[data-hero-loop-source]"),
		loopMeta: ROOT.querySelector("[data-hero-loop-meta]"),
		live: ROOT.querySelector("[data-hero-live]"),
	};

	/** @type {string | null} */
	let pendingPosterUrl = null;

	function escapeHtml(value) {
		return String(value)
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;")
			.replaceAll(">", "&gt;")
			.replaceAll('"', "&quot;");
	}

	function announce(message) {
		if (!els.live) return;
		els.live.textContent = "";
		requestAnimationFrame(() => {
			if (els.live) els.live.textContent = message;
		});
	}

	function formatBytes(size) {
		if (size == null || !Number.isFinite(size)) return "unknown size";
		if (size < 1024) return `${size} B`;
		if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
		return `${(size / (1024 * 1024)).toFixed(1)} MB`;
	}

	function readBootstrap() {
		const node = document.getElementById("dash-hero-bootstrap");
		if (!node?.textContent) return;
		try {
			const data = JSON.parse(node.textContent);
			state = {
				writable: Boolean(data.writable),
				version: data.version ?? "",
				catalogVersion: data.catalogVersion ?? null,
				loop: data.loop ?? null,
				poster: data.poster ?? null,
			};
		} catch {
			/* keep defaults */
		}
	}

	function revPayload() {
		return window.DashRevisions?.payload("hero") ?? { rev: 0 };
	}

	function setRevision(rev) {
		window.DashRevisions?.set("hero", {
			rev,
			found: true,
		});
	}

	function reportPublish(publish) {
		const { message } = window.DashPublish.report(publish);
		announce(message);
	}

	async function readJson(response) {
		try {
			return await response.json();
		} catch {
			return {};
		}
	}

	function setStatus(message, isError) {
		if (!els.status) return;
		els.status.hidden = !message;
		els.status.textContent = message ?? "";
		els.status.style.color = isError ? "var(--dash-danger, #f87171)" : "";
	}

	function selectedFiles() {
		const loop =
			els.loopInput instanceof HTMLInputElement
				? els.loopInput.files?.[0] ?? null
				: null;
		const poster =
			els.posterInput instanceof HTMLInputElement
				? els.posterInput.files?.[0] ?? null
				: null;
		return { loop, poster };
	}

	function clearPendingPreview() {
		if (pendingPosterUrl) {
			URL.revokeObjectURL(pendingPosterUrl);
			pendingPosterUrl = null;
		}
		if (els.pendingPreview) els.pendingPreview.innerHTML = "";
	}

	function updatePending() {
		const { loop, poster } = selectedFiles();
		clearPendingPreview();
		if (!loop && !poster) {
			if (els.pending) els.pending.hidden = true;
			return;
		}
		if (els.pending) els.pending.hidden = false;
		const parts = [];
		if (loop) parts.push(`Loop: ${loop.name} (${formatBytes(loop.size)})`);
		if (poster) parts.push(`Poster: ${poster.name} (${formatBytes(poster.size)})`);
		if (els.pendingDetail) {
			els.pendingDetail.textContent = `${parts.join(" · ")}. Live assets stay unchanged until Apply succeeds.`;
		}
		if (poster && els.pendingPreview) {
			pendingPosterUrl = URL.createObjectURL(poster);
			els.pendingPreview.innerHTML = `<img src="${pendingPosterUrl}" alt="Pending poster preview" width="480" height="270" />`;
		}
	}

	async function toWebp(file) {
		const type = file.type || "";
		if (
			![
				"image/jpeg",
				"image/png",
				"image/webp",
				"image/gif",
				"image/bmp",
			].includes(type) &&
			!/\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name)
		) {
			throw new Error("Poster must be JPEG, PNG, WebP, GIF, or BMP.");
		}
		const bitmap = await createImageBitmap(file);
		const max = 1920;
		const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
		const width = Math.max(1, Math.round(bitmap.width * scale));
		const height = Math.max(1, Math.round(bitmap.height * scale));
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Could not convert this image.");
		context.drawImage(bitmap, 0, 0, width, height);
		bitmap.close();
		const blob = await new Promise((resolve) => {
			canvas.toBlob(resolve, "image/webp", 0.85);
		});
		if (!blob) {
			throw new Error(
				"This browser could not encode WebP. Try a current Chrome or Firefox.",
			);
		}
		return new File([blob], "hero-poster.webp", { type: "image/webp" });
	}

	function applyLiveState(payload) {
		if (typeof payload.version === "string") state.version = payload.version;
		if ("catalogVersion" in payload) {
			state.catalogVersion = payload.catalogVersion ?? null;
		}
		if ("loop" in payload) state.loop = payload.loop;
		if ("poster" in payload) state.poster = payload.poster;

		if (els.version) {
			els.version.textContent = `Live version ${state.version}`;
		}
		if (state.poster?.src) {
			if (els.posterImg instanceof HTMLImageElement) {
				els.posterImg.src = state.poster.src;
				els.posterImg.hidden = false;
			}
			if (els.posterMeta) {
				els.posterMeta.textContent = `hero-poster.webp · ${formatBytes(state.poster.size)}`;
			}
		}
		if (state.loop?.src) {
			if (els.loopSource instanceof HTMLSourceElement) {
				els.loopSource.src = state.loop.src;
			}
			if (els.loopVideo instanceof HTMLVideoElement) {
				if (state.poster?.src) els.loopVideo.poster = state.poster.src;
				els.loopVideo.load();
			}
			if (els.loopMeta) {
				els.loopMeta.textContent = `hero-loop.mp4 · ${formatBytes(state.loop.size)}`;
			}
		}
	}

	function showConflict(message) {
		window.DashOverlays?.dialog({
			title: "Revision conflict",
			body: `<div class="dash-videos-conflict">
				<p class="dash-videos-conflict__title">Conflict</p>
				<p class="dash-videos-conflict__detail">${escapeHtml(message)}</p>
				<p class="dash-videos-conflict__detail">Reload the latest hero state before replacing again.</p>
			</div>`,
			actions: [
				{ label: "Dismiss", variant: "secondary", role: "close" },
				{
					label: "Reload",
					variant: "primary",
					onClick() {
						void reloadLatest();
					},
				},
			],
		});
	}

	async function reloadLatest() {
		try {
			const response = await fetch("/api/hero");
			const result = await readJson(response);
			if (!response.ok) {
				window.DashToast?.show({
					message: result.error ?? "Could not reload hero.",
					tone: "danger",
				});
				return;
			}
			if (typeof result.rev === "number") setRevision(result.rev);
			if (typeof result.writable === "boolean") state.writable = result.writable;
			applyLiveState(result);
			window.DashToast?.show({
				message: "Loaded latest hero state",
				tone: "info",
			});
		} catch {
			window.DashToast?.show({
				message: "Network error while reloading.",
				tone: "danger",
			});
		}
	}

	async function onSubmit(event) {
		event.preventDefault();
		if (!state.writable) return;
		const { loop, poster } = selectedFiles();
		if (!loop && !poster) {
			setStatus("Choose a loop and/or poster file to replace.", true);
			return;
		}

		setStatus("Preparing…", false);
		if (els.apply instanceof HTMLButtonElement) els.apply.disabled = true;

		try {
			const body = new FormData();
			body.set("rev", String(revPayload().rev ?? 0));
			if (loop) body.set("loop", loop, "hero-loop.mp4");
			if (poster) {
				const posterWebp = await toWebp(poster);
				body.set("poster", posterWebp, "hero-poster.webp");
			}

			setStatus("Uploading…", false);
			const response = await fetch("/api/hero", {
				method: "POST",
				headers: { "If-Match": String(revPayload().rev ?? 0) },
				body,
			});
			const result = await readJson(response);

			if (response.status === 409) {
				setStatus("", false);
				showConflict(
					result.error ?? "The hero catalog changed since you loaded this page.",
				);
				return;
			}
			if (!response.ok) {
				setStatus(result.error ?? "Could not replace hero media.", true);
				return;
			}

			if (typeof result.rev === "number") setRevision(result.rev);
			applyLiveState(result);
			reportPublish(result.publish);
			clearSelection();
			setStatus("Replacement applied.", false);
		} catch (error) {
			setStatus(
				error instanceof Error ? error.message : "Replacement failed.",
				true,
			);
		} finally {
			if (els.apply instanceof HTMLButtonElement) {
				els.apply.disabled = !state.writable;
			}
		}
	}

	function clearSelection() {
		if (els.form instanceof HTMLFormElement) els.form.reset();
		clearPendingPreview();
		if (els.pending) els.pending.hidden = true;
		setStatus("", false);
	}

	function bind() {
		els.form?.addEventListener("submit", onSubmit);
		els.clear?.addEventListener("click", clearSelection);
		els.loopInput?.addEventListener("change", updatePending);
		els.posterInput?.addEventListener("change", updatePending);
	}

	readBootstrap();
	bind();
})();
