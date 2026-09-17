/**
 * Shorts workspace — visual cards, drawer editor, clip media, CAS, reorder.
 * Depends on DashToast, DashOverlays, DashRevisions (Phase 3A).
 */
(function () {
	const ROOT = document.querySelector("[data-shorts-workspace]");
	if (!ROOT) return;

	const SEARCH_DEBOUNCE_MS = 280;

	/** @type {{ shorts: any[], writable: boolean }} */
	let state = { shorts: [], writable: false };
	/** @type {{ q: string, kind: string, sort: string }} */
	let query = { q: "", kind: "all", sort: "order" };
	/** @type {ReturnType<typeof setTimeout> | null} */
	let searchTimer = null;
	/** @type {HTMLElement | null} */
	let dragEl = null;
	let reorderBusy = false;
	/** @type {{ mode: "create" | "edit", slug?: string } | null} */
	let drawerContext = null;

	const els = {
		search: ROOT.querySelector("[data-shorts-search]"),
		kind: ROOT.querySelector("[data-shorts-kind]"),
		sort: ROOT.querySelector("[data-shorts-sort]"),
		count: ROOT.querySelector("[data-shorts-count]"),
		reorderHint: ROOT.querySelector("[data-shorts-reorder-hint]"),
		content: ROOT.querySelector("[data-shorts-content]"),
		live: ROOT.querySelector("[data-shorts-live]"),
		newBtn: ROOT.querySelector("[data-shorts-new]"),
	};

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

	function formatDuration(seconds) {
		const total = Math.max(0, Math.round(Number(seconds) || 0));
		const minutes = Math.floor(total / 60);
		const rem = total % 60;
		return `${minutes}:${String(rem).padStart(2, "0")}`;
	}

	function isCampaign(entry) {
		return (entry.clips?.length ?? 0) > 1;
	}

	function shortDuration(entry) {
		return (entry.clips ?? []).reduce(
			(sum, clip) => sum + (Number(clip.duration) || 0),
			0,
		);
	}

	function normalizeQuery(q) {
		return String(q ?? "")
			.trim()
			.toLowerCase();
	}

	function shortMatchesSearch(entry, q) {
		const needle = normalizeQuery(q);
		if (!needle) return true;
		const haystack = [entry.title, entry.slug, String(entry.year)]
			.join("\n")
			.toLowerCase();
		return haystack.includes(needle);
	}

	function compareOrder(a, b) {
		const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
		const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
		if (ao !== bo) return ao - bo;
		return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
	}

	function sortShorts(list, sort) {
		const copy = list.slice();
		switch (sort) {
			case "title":
				return copy.sort((a, b) =>
					a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
				);
			case "year":
				return copy.sort((a, b) => {
					if (a.year !== b.year) return b.year - a.year;
					return compareOrder(a, b);
				});
			case "order":
			default:
				return copy.sort(compareOrder);
		}
	}

	function filterShorts(list, q) {
		let next = list.slice();
		if (normalizeQuery(q.q)) {
			next = next.filter((entry) => shortMatchesSearch(entry, q.q));
		}
		if (q.kind === "campaign") next = next.filter(isCampaign);
		else if (q.kind === "single") next = next.filter((entry) => !isCampaign(entry));
		return sortShorts(next, q.sort);
	}

	function reorderAllowed() {
		if (query.sort !== "order") return false;
		if (query.kind !== "all") return false;
		if (normalizeQuery(query.q)) return false;
		return true;
	}

	function readBootstrap() {
		const node = document.getElementById("dash-shorts-bootstrap");
		if (!node?.textContent) return;
		try {
			const data = JSON.parse(node.textContent);
			state.shorts = sortShorts(data.shorts ?? [], "order");
			state.writable = Boolean(data.writable);
		} catch {
			state.shorts = [];
		}
	}

	function readUrlQuery() {
		const params = new URLSearchParams(window.location.search);
		query = {
			q: params.get("q") ?? "",
			kind: params.get("kind") === "campaign" || params.get("kind") === "single"
				? params.get("kind")
				: "all",
			sort:
				params.get("sort") === "title" || params.get("sort") === "year"
					? params.get("sort")
					: "order",
		};
		if (els.search instanceof HTMLInputElement) els.search.value = query.q;
		if (els.kind instanceof HTMLSelectElement) els.kind.value = query.kind;
		if (els.sort instanceof HTMLSelectElement) els.sort.value = query.sort;
	}

	function writeUrlQuery() {
		const params = new URLSearchParams();
		if (normalizeQuery(query.q)) params.set("q", query.q.trim());
		if (query.kind !== "all") params.set("kind", query.kind);
		if (query.sort !== "order") params.set("sort", query.sort);
		const next = params.toString();
		const url = next
			? `${window.location.pathname}?${next}`
			: window.location.pathname;
		window.history.replaceState({}, "", url);
	}

	function revPayload() {
		return window.DashRevisions?.payload("shorts") ?? { rev: 0 };
	}

	function setRevision(rev) {
		window.DashRevisions?.set("shorts", {
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

	function findShort(slug) {
		return state.shorts.find((entry) => entry.slug === slug) ?? null;
	}

	function upsertShort(entry) {
		const index = state.shorts.findIndex((item) => item.slug === entry.slug);
		if (index === -1) state.shorts.push(entry);
		else state.shorts[index] = entry;
		state.shorts = sortShorts(state.shorts, "order");
	}

	function removeShort(slug) {
		state.shorts = state.shorts.filter((entry) => entry.slug !== slug);
	}

	function renderList() {
		const visible = filterShorts(state.shorts, query);
		const canReorder = reorderAllowed() && state.writable;
		if (els.count) {
			els.count.textContent =
				visible.length === state.shorts.length
					? `${visible.length} shown`
					: `${visible.length} of ${state.shorts.length}`;
		}
		if (els.reorderHint) {
			if (!canReorder && state.shorts.length > 0) {
				els.reorderHint.hidden = false;
				els.reorderHint.textContent =
					"Reorder is available when viewing the full catalog in catalog order (clear search and filters).";
			} else {
				els.reorderHint.hidden = true;
				els.reorderHint.textContent = "";
			}
		}
		if (!els.content) return;

		if (visible.length === 0) {
			const emptyTitle =
				normalizeQuery(query.q) || query.kind !== "all"
					? "No matching shorts"
					: "No shorts yet";
			const emptyDetail =
				normalizeQuery(query.q) || query.kind !== "all"
					? "Try a different search or clear the kind filter."
					: state.writable
						? "Create a short with a prepared MP4 clip and WebP poster."
						: "Bind MEDIA to start managing shorts.";
			els.content.innerHTML = `<div class="dash-empty"><h2 class="dash-empty__title">${escapeHtml(emptyTitle)}</h2><p class="dash-empty__detail">${escapeHtml(emptyDetail)}</p></div>`;
			return;
		}

		els.content.innerHTML = `<ul class="dash-shorts-grid" data-shorts-grid>${visible
			.map((entry, index) => {
				const cover = entry.clips?.[0];
				const campaign = isCampaign(entry);
				const duration = shortDuration(entry);
				return `<li class="dash-shorts-card" data-shorts-card data-slug="${escapeHtml(entry.slug)}"${canReorder ? ' draggable="true"' : ""}>
					<button type="button" class="dash-shorts-card__hit" data-shorts-open="${escapeHtml(entry.slug)}">
						<span class="dash-shorts-card__media">${
							cover
								? `<img src="${escapeHtml(cover.poster)}" alt="" width="${cover.width || 540}" height="${cover.height || 540}" loading="lazy" decoding="async" />`
								: `<span class="dash-shorts-card__missing">No poster</span>`
						}</span>
						<span class="dash-shorts-card__meta">
							<span class="dash-shorts-card__title">${escapeHtml(entry.title)}</span>
							<span class="dash-shorts-card__sub">${entry.year} · ${
								campaign
									? `${entry.clips.length} clips`
									: formatDuration(duration)
							} · ${campaign ? "Campaign" : "Single"}</span>
						</span>
					</button>
					${
						canReorder
							? `<div class="dash-shorts-card__reorder">
							<button type="button" class="dash-btn dash-btn--ghost" data-shorts-move="up" data-slug="${escapeHtml(entry.slug)}" ${index === 0 ? "disabled" : ""} aria-label="Move ${escapeHtml(entry.title)} up">↑</button>
							<button type="button" class="dash-btn dash-btn--ghost" data-shorts-move="down" data-slug="${escapeHtml(entry.slug)}" ${index === visible.length - 1 ? "disabled" : ""} aria-label="Move ${escapeHtml(entry.title)} down">↓</button>
						</div>`
							: ""
					}
				</li>`;
			})
			.join("")}</ul>`;

		bindGridEvents();
	}

	function bindGridEvents() {
		els.content?.querySelectorAll("[data-shorts-open]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const slug = btn.getAttribute("data-shorts-open");
				const entry = slug ? findShort(slug) : null;
				if (entry) openEditor(entry);
			});
		});
		els.content?.querySelectorAll("[data-shorts-move]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const slug = btn.getAttribute("data-slug");
				const dir = btn.getAttribute("data-shorts-move");
				if (slug && dir) void moveShort(slug, dir === "up" ? -1 : 1);
			});
		});
		els.content?.querySelectorAll("[data-shorts-card]").forEach((card) => {
			if (!(card instanceof HTMLElement) || !card.draggable) return;
			card.addEventListener("dragstart", (event) => {
				dragEl = card;
				card.dataset.dragging = "true";
				event.dataTransfer?.setData("text/plain", card.dataset.slug ?? "");
				if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
			});
			card.addEventListener("dragend", () => {
				card.dataset.dragging = "false";
				dragEl = null;
			});
			card.addEventListener("dragover", (event) => {
				event.preventDefault();
				if (!dragEl || dragEl === card) return;
				const grid = card.parentElement;
				if (!grid) return;
				const rect = card.getBoundingClientRect();
				const before = event.clientY < rect.top + rect.height / 2;
				grid.insertBefore(dragEl, before ? card : card.nextSibling);
			});
			card.addEventListener("drop", (event) => {
				event.preventDefault();
				void commitGridOrder();
			});
		});
	}

	async function commitGridOrder() {
		if (!reorderAllowed() || reorderBusy || !state.writable) return;
		const cards = [
			...(els.content?.querySelectorAll("[data-shorts-card]") ?? []),
		];
		const slugs = cards
			.map((card) => card.getAttribute("data-slug"))
			.filter(Boolean);
		if (slugs.length !== state.shorts.length) return;
		const same = state.shorts.every((entry, i) => entry.slug === slugs[i]);
		if (same) return;
		await persistOrder(slugs);
	}

	async function moveShort(slug, delta) {
		if (!reorderAllowed() || reorderBusy || !state.writable) return;
		const list = sortShorts(state.shorts, "order");
		const index = list.findIndex((entry) => entry.slug === slug);
		const next = index + delta;
		if (index < 0 || next < 0 || next >= list.length) return;
		const copy = list.slice();
		const [item] = copy.splice(index, 1);
		copy.splice(next, 0, item);
		await persistOrder(copy.map((entry) => entry.slug));
	}

	async function persistOrder(slugs) {
		reorderBusy = true;
		try {
			const response = await fetch("/api/shorts", {
				method: "PATCH",
				headers: {
					"content-type": "application/json",
					"If-Match": String(revPayload().rev ?? 0),
				},
				body: JSON.stringify({ action: "reorder", slugs, ...revPayload() }),
			});
			const result = await readJson(response);
			if (response.status === 409) {
				showConflict({
					message:
						result.error ??
						"The catalog changed since you loaded this page.",
				});
				return;
			}
			if (!response.ok) {
				window.DashToast?.show({
					message: result.error ?? "Could not reorder.",
					tone: "danger",
				});
				await reloadLatest();
				return;
			}
			if (typeof result.rev === "number") setRevision(result.rev);
			state.shorts = slugs
				.map((slug, index) => {
					const entry = findShort(slug);
					return entry ? { ...entry, sortOrder: (index + 1) * 10 } : null;
				})
				.filter(Boolean);
			reportPublish(result.publish);
			renderList();
		} catch {
			window.DashToast?.show({
				message: "Network error while reordering.",
				tone: "danger",
			});
			await reloadLatest();
		} finally {
			reorderBusy = false;
		}
	}

	function showConflict({ message, pendingSlug, reopenMode }) {
		window.DashOverlays?.dialog({
			title: "Revision conflict",
			body: `<div class="dash-videos-conflict">
				<p class="dash-videos-conflict__title">Conflict</p>
				<p class="dash-videos-conflict__detail">${escapeHtml(message)}</p>
				<p class="dash-videos-conflict__detail">Reload the latest catalog before saving again. Your unsaved edits will not be applied automatically.</p>
			</div>`,
			actions: [
				{
					label: "Discard",
					variant: "secondary",
					onClick() {
						drawerContext = null;
					},
				},
				{
					label: "Reload",
					variant: "primary",
					onClick() {
						void reloadLatest(reopenMode, pendingSlug);
					},
				},
			],
		});
	}

	async function reloadLatest(reopenMode, pendingSlug) {
		try {
			const response = await fetch("/api/shorts");
			const result = await readJson(response);
			if (!response.ok) {
				window.DashToast?.show({
					message: result.error ?? "Could not reload catalog.",
					tone: "danger",
				});
				return;
			}
			state.shorts = sortShorts(result.shorts ?? [], "order");
			if (typeof result.rev === "number") setRevision(result.rev);
			if (typeof result.writable === "boolean") state.writable = result.writable;
			renderList();
			window.DashToast?.show({
				message: "Loaded latest catalog",
				tone: "info",
			});
			if (reopenMode === "edit" && pendingSlug) {
				const fresh = findShort(pendingSlug);
				if (fresh) openEditor(fresh);
				else {
					window.DashToast?.show({
						message: "That short is no longer in the catalog.",
						tone: "warning",
					});
				}
			} else if (reopenMode === "create") {
				openEditor(null);
			}
		} catch {
			window.DashToast?.show({
				message: "Network error while reloading.",
				tone: "danger",
			});
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
			throw new Error(
				"Poster must be JPEG, PNG, WebP, GIF, or BMP.",
			);
		}
		const bitmap = await createImageBitmap(file);
		const max = 1600;
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
			canvas.toBlob(resolve, "image/webp", 0.82);
		});
		if (!blob) {
			throw new Error(
				"This browser could not encode WebP. Try a current Chrome or Firefox.",
			);
		}
		return new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), {
			type: "image/webp",
		});
	}

	function probeVideo(file) {
		return new Promise((resolve, reject) => {
			const url = URL.createObjectURL(file);
			const video = document.createElement("video");
			video.preload = "metadata";
			video.onloadedmetadata = () => {
				const duration = Math.max(1, Math.round(video.duration || 1));
				const width = video.videoWidth || 0;
				const height = video.videoHeight || 0;
				URL.revokeObjectURL(url);
				if (!width || !height) {
					reject(new Error("Could not read video dimensions."));
					return;
				}
				resolve({ duration, width, height });
			};
			video.onerror = () => {
				URL.revokeObjectURL(url);
				reject(new Error("Could not read video metadata."));
			};
			video.src = url;
		});
	}

	function drawerFormHtml(entry) {
		const year = entry?.year ?? new Date().getFullYear();
		if (!entry) {
			return `<form class="dash-shorts-form" data-shorts-drawer-form>
				<p class="dash-muted">Upload a prepared MP4 clip and a poster image. Additional clips can be added after create.</p>
				<label class="dash-field"><span>Title</span><input name="title" required maxlength="500" /></label>
				<label class="dash-field"><span>Year</span><input name="year" type="number" min="1900" max="2100" value="${year}" required /></label>
				<label class="dash-field"><span>Slug (optional)</span><input name="slug" maxlength="80" placeholder="auto from title" /></label>
				<label class="dash-field"><span>Clip (MP4)</span><input name="video" type="file" accept="video/mp4,.mp4" required /></label>
				<label class="dash-field"><span>Poster</span><input name="poster" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/bmp" required /></label>
				<p class="dash-inline-error" data-drawer-status hidden></p>
			</form>`;
		}

		const clips = (entry.clips ?? [])
			.map(
				(clip, index) => `<li class="dash-shorts-clip" data-clip-slug="${escapeHtml(clip.slug)}" draggable="${state.writable ? "true" : "false"}">
					<img src="${escapeHtml(clip.poster)}" alt="" width="72" height="72" loading="lazy" decoding="async" />
					<div class="dash-shorts-clip__meta">
						<strong>${escapeHtml(clip.slug)}</strong>
						<span>${clip.width}×${clip.height} · ${formatDuration(clip.duration)}</span>
					</div>
					<div class="dash-shorts-clip__actions">
						<button type="button" class="dash-btn dash-btn--ghost" data-clip-preview="${escapeHtml(clip.slug)}">Preview</button>
						<button type="button" class="dash-btn dash-btn--ghost" data-clip-replace="${escapeHtml(clip.slug)}" ${state.writable ? "" : "disabled"}>Replace</button>
						<button type="button" class="dash-btn dash-btn--ghost" data-clip-remove="${escapeHtml(clip.slug)}" ${!state.writable || entry.clips.length <= 1 ? "disabled" : ""}>Remove</button>
						<button type="button" class="dash-btn dash-btn--ghost" data-clip-move="up" data-clip-slug="${escapeHtml(clip.slug)}" ${index === 0 || !state.writable ? "disabled" : ""} aria-label="Move clip up">↑</button>
						<button type="button" class="dash-btn dash-btn--ghost" data-clip-move="down" data-clip-slug="${escapeHtml(clip.slug)}" ${index === entry.clips.length - 1 || !state.writable ? "disabled" : ""} aria-label="Move clip down">↓</button>
					</div>
				</li>`,
			)
			.join("");

		return `<form class="dash-shorts-form" data-shorts-drawer-form data-slug="${escapeHtml(entry.slug)}">
			<label class="dash-field"><span>Title</span><input name="title" required maxlength="500" value="${escapeHtml(entry.title)}" /></label>
			<label class="dash-field"><span>Year</span><input name="year" type="number" min="1900" max="2100" value="${entry.year}" required /></label>
			<p class="dash-muted">Slug <code>${escapeHtml(entry.slug)}</code> · ${isCampaign(entry) ? "Campaign" : "Single"}</p>
			<div class="dash-shorts-preview" data-shorts-preview hidden>
				<video controls playsinline preload="metadata"></video>
				<button type="button" class="dash-btn dash-btn--ghost" data-preview-close>Close preview</button>
			</div>
			<h3 class="dash-shorts-form__section">Clips</h3>
			<ul class="dash-shorts-clips" data-shorts-clips>${clips}</ul>
			${
				state.writable
					? `<div class="dash-shorts-add-clip">
				<label class="dash-field"><span>Add clip (MP4)</span><input name="addVideo" type="file" accept="video/mp4,.mp4" /></label>
				<label class="dash-field"><span>Poster</span><input name="addPoster" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/bmp" /></label>
				<button type="button" class="dash-btn dash-btn--secondary" data-shorts-add-clip>Upload clip</button>
			</div>`
					: ""
			}
			<p class="dash-inline-error" data-drawer-status hidden></p>
		</form>`;
	}

	function setDrawerStatus(form, message, isError) {
		const status = form.querySelector("[data-drawer-status]");
		if (!status) return;
		status.hidden = !message;
		status.textContent = message ?? "";
		status.style.color = isError ? "var(--dash-danger, #f87171)" : "";
	}

	function openEditor(entry) {
		drawerContext = entry
			? { mode: "edit", slug: entry.slug }
			: { mode: "create" };
		const layer = window.DashOverlays.drawer({
			title: entry ? entry.title : "New short",
			body: drawerFormHtml(entry),
			side: "right",
			actions: entry
				? [
						{
							label: "Delete",
							variant: "danger",
							onClick() {
								layer.close();
								void confirmDelete(entry.slug);
								return false;
							},
						},
						{ label: "Cancel", variant: "secondary", role: "close" },
						{
							label: "Save",
							variant: "primary",
							onClick() {
								const form = layer.panel.querySelector(
									"[data-shorts-drawer-form]",
								);
								if (!(form instanceof HTMLFormElement)) return false;
								void saveMetadata(form, layer);
								return false;
							},
						},
					]
				: [
						{ label: "Cancel", variant: "secondary", role: "close" },
						{
							label: "Create",
							variant: "primary",
							onClick() {
								const form = layer.panel.querySelector(
									"[data-shorts-drawer-form]",
								);
								if (!(form instanceof HTMLFormElement)) return false;
								void createShort(form, layer);
								return false;
							},
						},
					],
		});

		if (entry) bindClipActions(layer, entry.slug);
	}

	function bindClipActions(layer, slug) {
		const form = layer.panel.querySelector("[data-shorts-drawer-form]");
		if (!(form instanceof HTMLFormElement)) return;

		form.querySelector("[data-shorts-add-clip]")?.addEventListener("click", () => {
			void addClip(form, slug, layer);
		});

		form.querySelectorAll("[data-clip-preview]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const clipSlug = btn.getAttribute("data-clip-preview");
				const entry = findShort(slug);
				const clip = entry?.clips?.find((item) => item.slug === clipSlug);
				const preview = form.querySelector("[data-shorts-preview]");
				const video = preview?.querySelector("video");
				if (!clip || !preview || !(video instanceof HTMLVideoElement)) return;
				video.poster = clip.poster;
				video.src = clip.src;
				preview.hidden = false;
				void video.play().catch(() => undefined);
			});
		});

		form.querySelector("[data-preview-close]")?.addEventListener("click", () => {
			const preview = form.querySelector("[data-shorts-preview]");
			const video = preview?.querySelector("video");
			if (video instanceof HTMLVideoElement) {
				video.pause();
				video.removeAttribute("src");
				video.load();
			}
			if (preview) preview.hidden = true;
		});

		form.querySelectorAll("[data-clip-replace]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const clipSlug = btn.getAttribute("data-clip-replace");
				if (clipSlug) void replaceClip(form, slug, clipSlug, layer);
			});
		});

		form.querySelectorAll("[data-clip-remove]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const clipSlug = btn.getAttribute("data-clip-remove");
				if (clipSlug) void removeClip(slug, clipSlug, layer);
			});
		});

		form.querySelectorAll("[data-clip-move]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const clipSlug = btn.getAttribute("data-clip-slug");
				const dir = btn.getAttribute("data-clip-move");
				if (clipSlug && dir) void moveClip(slug, clipSlug, dir === "up" ? -1 : 1, layer);
			});
		});
	}

	async function createShort(form, layer) {
		const title = String(new FormData(form).get("title") ?? "").trim();
		const year = Number(new FormData(form).get("year"));
		const slug = String(new FormData(form).get("slug") ?? "").trim();
		const videoInput = form.querySelector('input[name="video"]');
		const posterInput = form.querySelector('input[name="poster"]');
		const video =
			videoInput instanceof HTMLInputElement ? videoInput.files?.[0] : null;
		const poster =
			posterInput instanceof HTMLInputElement ? posterInput.files?.[0] : null;
		if (!title) {
			setDrawerStatus(form, "Title is required.", true);
			return;
		}
		if (!video || !poster) {
			setDrawerStatus(form, "MP4 clip and poster are required.", true);
			return;
		}

		setDrawerStatus(form, "Preparing upload…", false);
		try {
			const metrics = await probeVideo(video);
			const posterWebp = await toWebp(poster);
			const body = new FormData();
			body.set("intent", "create");
			body.set("title", title);
			body.set("year", String(year));
			if (slug) body.set("slug", slug);
			body.set("video", video);
			body.set("poster", posterWebp);
			body.set("duration", String(metrics.duration));
			body.set("width", String(metrics.width));
			body.set("height", String(metrics.height));
			body.set("rev", String(revPayload().rev ?? 0));

			setDrawerStatus(form, "Uploading…", false);
			const response = await fetch("/api/shorts", {
				method: "POST",
				headers: { "If-Match": String(revPayload().rev ?? 0) },
				body,
			});
			const result = await readJson(response);
			if (response.status === 409) {
				layer.close();
				showConflict({
					message: result.error ?? "Conflict while creating.",
					reopenMode: "create",
				});
				return;
			}
			if (!response.ok) {
				setDrawerStatus(form, result.error ?? "Could not create.", true);
				return;
			}
			if (typeof result.rev === "number") setRevision(result.rev);
			if (result.short) upsertShort(result.short);
			reportPublish(result.publish);
			layer.close();
			renderList();
		} catch (error) {
			setDrawerStatus(
				form,
				error instanceof Error ? error.message : "Upload failed.",
				true,
			);
		}
	}

	async function saveMetadata(form, layer) {
		const slug = drawerContext?.slug;
		if (!slug) return;
		const data = new FormData(form);
		const title = String(data.get("title") ?? "").trim();
		const year = Number(data.get("year"));
		if (!title) {
			setDrawerStatus(form, "Title is required.", true);
			return;
		}
		setDrawerStatus(form, "Saving…", false);
		try {
			const response = await fetch("/api/shorts", {
				method: "PATCH",
				headers: {
					"content-type": "application/json",
					"If-Match": String(revPayload().rev ?? 0),
				},
				body: JSON.stringify({
					slug,
					title,
					year,
					...revPayload(),
				}),
			});
			const result = await readJson(response);
			if (response.status === 409) {
				layer.close();
				showConflict({
					message: result.error ?? "Conflict while saving.",
					pendingSlug: slug,
					reopenMode: "edit",
				});
				return;
			}
			if (!response.ok) {
				setDrawerStatus(form, result.error ?? "Could not save.", true);
				return;
			}
			if (typeof result.rev === "number") setRevision(result.rev);
			if (result.short) upsertShort(result.short);
			reportPublish(result.publish);
			layer.close();
			renderList();
		} catch {
			setDrawerStatus(form, "Network error while saving.", true);
		}
	}

	async function addClip(form, slug, layer) {
		const videoInput = form.querySelector('input[name="addVideo"]');
		const posterInput = form.querySelector('input[name="addPoster"]');
		const video =
			videoInput instanceof HTMLInputElement ? videoInput.files?.[0] : null;
		const poster =
			posterInput instanceof HTMLInputElement ? posterInput.files?.[0] : null;
		if (!video || !poster) {
			setDrawerStatus(form, "Choose an MP4 and poster to add a clip.", true);
			return;
		}
		setDrawerStatus(form, "Uploading clip…", false);
		try {
			const metrics = await probeVideo(video);
			const posterWebp = await toWebp(poster);
			const body = new FormData();
			body.set("intent", "add-clip");
			body.set("slug", slug);
			body.set("video", video);
			body.set("poster", posterWebp);
			body.set("duration", String(metrics.duration));
			body.set("width", String(metrics.width));
			body.set("height", String(metrics.height));
			body.set("rev", String(revPayload().rev ?? 0));
			const response = await fetch("/api/shorts", {
				method: "POST",
				headers: { "If-Match": String(revPayload().rev ?? 0) },
				body,
			});
			const result = await readJson(response);
			if (response.status === 409) {
				layer.close();
				showConflict({
					message: result.error ?? "Conflict while adding clip.",
					pendingSlug: slug,
					reopenMode: "edit",
				});
				return;
			}
			if (!response.ok) {
				setDrawerStatus(form, result.error ?? "Could not add clip.", true);
				return;
			}
			if (typeof result.rev === "number") setRevision(result.rev);
			if (result.short) upsertShort(result.short);
			reportPublish(result.publish);
			layer.close();
			openEditor(result.short);
			renderList();
		} catch (error) {
			setDrawerStatus(
				form,
				error instanceof Error ? error.message : "Upload failed.",
				true,
			);
		}
	}

	async function replaceClip(form, slug, clipSlug, layer) {
		const videoInput = document.createElement("input");
		videoInput.type = "file";
		videoInput.accept = "video/mp4,.mp4";
		const posterInput = document.createElement("input");
		posterInput.type = "file";
		posterInput.accept = "image/jpeg,image/png,image/webp,image/gif,image/bmp";

		const video = await new Promise((resolve) => {
			videoInput.onchange = () => resolve(videoInput.files?.[0] ?? null);
			videoInput.click();
		});
		if (!video) return;
		const poster = await new Promise((resolve) => {
			posterInput.onchange = () => resolve(posterInput.files?.[0] ?? null);
			posterInput.click();
		});
		if (!poster) {
			setDrawerStatus(form, "Poster is required to replace a clip.", true);
			return;
		}

		setDrawerStatus(form, "Replacing clip…", false);
		try {
			const metrics = await probeVideo(video);
			const posterWebp = await toWebp(poster);
			const body = new FormData();
			body.set("intent", "replace-clip");
			body.set("slug", slug);
			body.set("clipSlug", clipSlug);
			body.set("video", video);
			body.set("poster", posterWebp);
			body.set("duration", String(metrics.duration));
			body.set("width", String(metrics.width));
			body.set("height", String(metrics.height));
			body.set("rev", String(revPayload().rev ?? 0));
			const response = await fetch("/api/shorts", {
				method: "POST",
				headers: { "If-Match": String(revPayload().rev ?? 0) },
				body,
			});
			const result = await readJson(response);
			if (response.status === 409) {
				layer.close();
				showConflict({
					message: result.error ?? "Conflict while replacing clip.",
					pendingSlug: slug,
					reopenMode: "edit",
				});
				return;
			}
			if (!response.ok) {
				setDrawerStatus(form, result.error ?? "Could not replace clip.", true);
				return;
			}
			if (typeof result.rev === "number") setRevision(result.rev);
			if (result.short) upsertShort(result.short);
			reportPublish(result.publish);
			layer.close();
			openEditor(result.short);
			renderList();
		} catch (error) {
			setDrawerStatus(
				form,
				error instanceof Error ? error.message : "Replace failed.",
				true,
			);
		}
	}

	async function removeClip(slug, clipSlug, layer) {
		const confirmed = await window.DashOverlays?.confirm({
			title: "Remove clip?",
			message: `Remove clip “${clipSlug}” from this short? Media will be deleted.`,
			confirmLabel: "Remove clip",
			cancelLabel: "Cancel",
			destructive: true,
		});
		if (!confirmed) return;

		const response = await fetch("/api/shorts", {
			method: "PATCH",
			headers: {
				"content-type": "application/json",
				"If-Match": String(revPayload().rev ?? 0),
			},
			body: JSON.stringify({
				action: "remove-clip",
				slug,
				clipSlug,
				...revPayload(),
			}),
		});
		const result = await readJson(response);
		if (response.status === 409) {
			layer.close();
			showConflict({
				message: result.error ?? "Conflict while removing clip.",
				pendingSlug: slug,
				reopenMode: "edit",
			});
			return;
		}
		if (!response.ok) {
			window.DashToast?.show({
				message: result.error ?? "Could not remove clip.",
				tone: "danger",
			});
			return;
		}
		if (typeof result.rev === "number") setRevision(result.rev);
		if (result.short) upsertShort(result.short);
		reportPublish(result.publish);
		layer.close();
		openEditor(result.short);
		renderList();
	}

	async function moveClip(slug, clipSlug, delta, layer) {
		const entry = findShort(slug);
		if (!entry) return;
		const clips = entry.clips.slice();
		const index = clips.findIndex((clip) => clip.slug === clipSlug);
		const next = index + delta;
		if (index < 0 || next < 0 || next >= clips.length) return;
		const copy = clips.slice();
		const [item] = copy.splice(index, 1);
		copy.splice(next, 0, item);
		const response = await fetch("/api/shorts", {
			method: "PATCH",
			headers: {
				"content-type": "application/json",
				"If-Match": String(revPayload().rev ?? 0),
			},
			body: JSON.stringify({
				action: "reorder-clips",
				slug,
				clipSlugs: copy.map((clip) => clip.slug),
				...revPayload(),
			}),
		});
		const result = await readJson(response);
		if (response.status === 409) {
			layer.close();
			showConflict({
				message: result.error ?? "Conflict while reordering clips.",
				pendingSlug: slug,
				reopenMode: "edit",
			});
			return;
		}
		if (!response.ok) {
			window.DashToast?.show({
				message: result.error ?? "Could not reorder clips.",
				tone: "danger",
			});
			return;
		}
		if (typeof result.rev === "number") setRevision(result.rev);
		if (result.short) upsertShort(result.short);
		reportPublish(result.publish);
		layer.close();
		openEditor(result.short);
		renderList();
	}

	async function confirmDelete(slug) {
		const entry = findShort(slug);
		if (!entry) return;
		const confirmed = await window.DashOverlays?.confirm({
			title: "Delete short?",
			message: `Delete “${entry.title}” and its ${entry.clips.length} clip${entry.clips.length === 1 ? "" : "s"}? This cannot be undone.`,
			confirmLabel: "Delete short",
			cancelLabel: "Cancel",
			destructive: true,
		});
		if (!confirmed) return;

		const response = await fetch(
			`/api/shorts?slug=${encodeURIComponent(slug)}`,
			{
				method: "DELETE",
				headers: { "If-Match": String(revPayload().rev ?? 0) },
			},
		);
		const result = await readJson(response);
		if (response.status === 409) {
			showConflict({
				message: result.error ?? "Conflict while deleting.",
				pendingSlug: slug,
				reopenMode: "edit",
			});
			return;
		}
		if (!response.ok) {
			window.DashToast?.show({
				message: result.error ?? "Could not delete.",
				tone: "danger",
			});
			return;
		}
		if (typeof result.rev === "number") setRevision(result.rev);
		removeShort(slug);
		reportPublish(result.publish);
		renderList();
	}

	function bindToolbar() {
		els.search?.addEventListener("input", () => {
			if (searchTimer) clearTimeout(searchTimer);
			searchTimer = setTimeout(() => {
				query.q =
					els.search instanceof HTMLInputElement ? els.search.value : "";
				writeUrlQuery();
				renderList();
			}, SEARCH_DEBOUNCE_MS);
		});
		els.kind?.addEventListener("change", () => {
			query.kind =
				els.kind instanceof HTMLSelectElement ? els.kind.value : "all";
			writeUrlQuery();
			renderList();
		});
		els.sort?.addEventListener("change", () => {
			query.sort =
				els.sort instanceof HTMLSelectElement ? els.sort.value : "order";
			writeUrlQuery();
			renderList();
		});
		els.newBtn?.addEventListener("click", () => openEditor(null));
		window.addEventListener("popstate", () => {
			readUrlQuery();
			renderList();
		});
	}

	readBootstrap();
	readUrlQuery();
	bindToolbar();
	renderList();
})();
