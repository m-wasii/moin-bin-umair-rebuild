/**
 * Photography workspace — album rail, grid, inspector, upload, CAS, reorder.
 * Depends on DashToast, DashOverlays, DashRevisions (Phase 3A).
 */
(function () {
	const ROOT = document.querySelector("[data-photo-workspace]");
	if (!ROOT) return;

	const SEARCH_DEBOUNCE_MS = 280;
	const UPLOAD_CONCURRENCY = 2;
	const GRID_THUMB_W = 400;
	const GRID_THUMB_W2 = 600;
	const PREVIEW_W = 1200;

	/** @type {{ photos: any[], categories: any[], writable: boolean }} */
	let state = { photos: [], categories: [], writable: false };
	/** @type {{ album: string, q: string, sort: string }} */
	let query = { album: "all", q: "", sort: "order" };
	/** @type {{ category: string, slug: string } | null} */
	let selected = null;
	/** @type {ReturnType<typeof setTimeout> | null} */
	let searchTimer = null;
	/** @type {HTMLElement | null} */
	let dragEl = null;
	let photoReorderBusy = false;
	let albumReorderBusy = false;
	let inspectorBusy = false;
	let uploadBusy = false;
	/** Serializes catalog POSTs so concurrent converts still share one rev pipeline. */
	let uploadGate = Promise.resolve();
	/** @type {{ close: () => void, panel: HTMLElement } | null} */
	let lightboxLayer = null;

	const els = {
		search: ROOT.querySelector("[data-photo-search]"),
		sort: ROOT.querySelector("[data-photo-sort]"),
		count: ROOT.querySelector("[data-photo-count]"),
		content: ROOT.querySelector("[data-photo-content]"),
		albumList: ROOT.querySelector("[data-album-list]"),
		albumSelect: ROOT.querySelector("[data-photo-album-select]"),
		albumActions: ROOT.querySelector("[data-album-actions]"),
		reorderHint: ROOT.querySelector("[data-photo-reorder-hint]"),
		inspectorEmpty: ROOT.querySelector("[data-inspector-empty]"),
		inspectorBody: ROOT.querySelector("[data-inspector-body]"),
		live: ROOT.querySelector("[data-photo-live]"),
	};

	function escapeHtml(value) {
		return String(value)
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;")
			.replaceAll(">", "&gt;")
			.replaceAll('"', "&quot;");
	}

	function normalizeQuery(q) {
		return String(q ?? "")
			.trim()
			.toLowerCase();
	}

	function photoKey(photo) {
		return `${photo.category}/${photo.slug}`;
	}

	function hostImageSrc(src, width) {
		if (!String(src).startsWith("/media/photos/")) return src;
		const qIndex = src.indexOf("?");
		const path = qIndex === -1 ? src : src.slice(0, qIndex);
		const params = new URLSearchParams(
			qIndex === -1 ? "" : src.slice(qIndex + 1),
		);
		params.set("w", String(width));
		return `${path}?${params.toString()}`;
	}

	function thumbAttrs(photo) {
		const src400 = hostImageSrc(photo.src, GRID_THUMB_W);
		const src600 = hostImageSrc(photo.src, GRID_THUMB_W2);
		return {
			src: src400,
			srcset: `${src400} 400w, ${src600} 600w`,
			sizes: "(max-width: 767px) 42vw, 160px",
		};
	}

	function photoMatchesSearch(photo, q) {
		const needle = normalizeQuery(q);
		if (!needle) return true;
		const haystack = [photo.title, photo.alt, photo.slug, photo.category]
			.join("\n")
			.toLowerCase();
		return haystack.includes(needle);
	}

	function visiblePhotos() {
		let list = state.photos.slice();
		if (query.album !== "all") {
			list = list.filter((photo) => photo.category === query.album);
		}
		if (normalizeQuery(query.q)) {
			list = list.filter((photo) => photoMatchesSearch(photo, query.q));
		}
		if (query.sort === "title") {
			list.sort((a, b) =>
				a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
			);
		}
		return list;
	}

	function photosReorderAllowed() {
		if (query.album === "all") return false;
		if (query.sort !== "order") return false;
		if (normalizeQuery(query.q)) return false;
		return true;
	}

	function albumLabel(slug) {
		return (
			state.categories.find((entry) => entry.slug === slug)?.label ?? slug
		);
	}

	function albumCount(slug) {
		return state.photos.filter((photo) => photo.category === slug).length;
	}

	function announce(message) {
		if (!els.live) return;
		els.live.textContent = "";
		window.requestAnimationFrame(() => {
			if (els.live) els.live.textContent = message;
		});
	}

	function photosRev() {
		return window.DashRevisions?.payload?.("photos") ?? { rev: 0 };
	}

	function categoriesRev() {
		return window.DashRevisions?.payload?.("photoCategories") ?? { rev: 0 };
	}

	function setPhotosRev(rev) {
		window.DashRevisions?.set?.("photos", { rev, found: true });
	}

	function setCategoriesRev(rev) {
		window.DashRevisions?.set?.("photoCategories", { rev, found: true });
	}

	async function readJson(response) {
		const text = await response.text();
		if (!text) return {};
		try {
			return JSON.parse(text);
		} catch {
			return { error: text };
		}
	}

	function reportPublish(publish) {
		const { message } = window.DashPublish.report(publish);
		announce(message);
	}

	function parseUrlQuery() {
		const params = new URLSearchParams(window.location.search);
		const album = params.get("album");
		const sort = params.get("sort");
		const known = new Set(state.categories.map((entry) => entry.slug));
		return {
			q: params.get("q") ?? "",
			album: album && album !== "all" && known.has(album) ? album : "all",
			sort: sort === "title" ? "title" : "order",
		};
	}

	function syncUrl(replace = true) {
		const params = new URLSearchParams();
		if (query.album !== "all") params.set("album", query.album);
		if (normalizeQuery(query.q)) params.set("q", query.q.trim());
		if (query.sort !== "order") params.set("sort", query.sort);
		const next = params.toString();
		const url = next
			? `${window.location.pathname}?${next}`
			: window.location.pathname;
		if (replace) history.replaceState(null, "", url);
		else history.pushState(null, "", url);
	}

	function syncControlsFromQuery() {
		if (els.search && document.activeElement !== els.search) {
			els.search.value = query.q;
		}
		if (els.sort) els.sort.value = query.sort;
		if (els.albumSelect) els.albumSelect.value = query.album;
		ROOT.querySelectorAll("[data-album]").forEach((btn) => {
			const active = btn.getAttribute("data-album") === query.album;
			btn.toggleAttribute("data-active", active);
			if (active) btn.setAttribute("aria-current", "true");
			else btn.removeAttribute("aria-current");
		});
	}

	function findPhoto(category, slug) {
		return (
			state.photos.find(
				(photo) => photo.category === category && photo.slug === slug,
			) ?? null
		);
	}

	function upsertPhoto(photo) {
		const index = state.photos.findIndex(
			(item) => item.category === photo.category && item.slug === photo.slug,
		);
		if (index === -1) {
			// After move, remove old identity if present under previous category tracking via selected.
			state.photos.push(photo);
		} else {
			state.photos[index] = photo;
		}
	}

	function removePhoto(category, slug) {
		state.photos = state.photos.filter(
			(photo) => !(photo.category === category && photo.slug === slug),
		);
	}

	function emptyHtml(title, detail, actionHtml = "") {
		return `
			<div class="dash-empty" role="status">
				<p class="dash-empty__title">${escapeHtml(title)}</p>
				<p class="dash-empty__detail">${escapeHtml(detail)}</p>
				${actionHtml ? `<div class="dash-empty__actions">${actionHtml}</div>` : ""}
			</div>`;
	}

	function renderAlbumRail() {
		if (!els.albumList) return;
		const total = state.photos.length;
		const rows = state.categories
			.map((category, index) => {
				const count = albumCount(category.slug);
				const isActive = query.album === category.slug;
				return `
				<li class="dash-photo-rail__row" data-reorder-item data-category="${escapeHtml(category.slug)}">
					<button type="button" class="dash-handle dash-photo-rail__handle" draggable="${state.writable ? "true" : "false"}" data-drag-handle data-category-handle aria-label="Reorder album ${escapeHtml(category.label)}" title="Drag to reorder album" ${state.writable ? "" : "disabled"}>⠿</button>
					<button type="button" class="dash-photo-rail__item" data-album="${escapeHtml(category.slug)}" ${isActive ? 'data-active="true" aria-current="true"' : ""}>
						<span class="dash-photo-rail__name">${escapeHtml(category.label)}</span>
						<span class="dash-photo-rail__count">${count}</span>
					</button>
					<div class="dash-photo-rail__moves">
						<button type="button" class="dash-photo-rail__move" data-album-reorder="up" ${!state.writable || albumReorderBusy || index === 0 ? "disabled" : ""} aria-label="Move ${escapeHtml(category.label)} up">↑</button>
						<button type="button" class="dash-photo-rail__move" data-album-reorder="down" ${!state.writable || albumReorderBusy || index === state.categories.length - 1 ? "disabled" : ""} aria-label="Move ${escapeHtml(category.label)} down">↓</button>
					</div>
				</li>`;
			})
			.join("");

		els.albumList.innerHTML = `
			<li>
				<button type="button" class="dash-photo-rail__item" data-album="all" ${query.album === "all" ? 'data-active="true" aria-current="true"' : ""}>
					<span class="dash-photo-rail__name">All photos</span>
					<span class="dash-photo-rail__count">${total}</span>
				</button>
			</li>
			${rows}`;

		if (els.albumSelect) {
			els.albumSelect.innerHTML = `
				<option value="all">All photos (${total})</option>
				${state.categories
					.map(
						(category) =>
							`<option value="${escapeHtml(category.slug)}">${escapeHtml(category.label)} (${albumCount(category.slug)})</option>`,
					)
					.join("")}`;
			els.albumSelect.value = query.album;
		}
	}

	function renderGrid() {
		if (!els.content) return;
		const list = visiblePhotos();
		const canReorder = photosReorderAllowed() && state.writable;
		const hasSearch = Boolean(normalizeQuery(query.q));
		const albumScope =
			query.album === "all" ? state.photos.length : albumCount(query.album);

		if (els.count) {
			els.count.textContent =
				hasSearch || query.album !== "all"
					? `${list.length} of ${albumScope}`
					: `${list.length} photo${list.length === 1 ? "" : "s"}`;
		}
		if (els.reorderHint) {
			els.reorderHint.hidden = canReorder;
		}
		if (els.albumActions) {
			const showAlbumActions =
				state.writable && query.album !== "all";
			els.albumActions.hidden = !showAlbumActions;
		}

		if (state.categories.length === 0) {
			els.content.innerHTML = emptyHtml(
				"No albums yet",
				"Create an album before uploading photos.",
				`<button type="button" class="dash-btn dash-btn--primary" data-photo-new-album ${state.writable ? "" : "disabled"}>New album</button>`,
			);
			return;
		}
		if (state.photos.length === 0) {
			els.content.innerHTML = emptyHtml(
				"No photos yet",
				"Upload stills into an album. JPEG, PNG, GIF, BMP, or WebP convert to WebP automatically.",
				`<button type="button" class="dash-btn dash-btn--primary" data-photo-upload ${state.writable ? "" : "disabled"}>Upload photos</button>`,
			);
			return;
		}
		if (list.length === 0 && hasSearch) {
			els.content.innerHTML = emptyHtml(
				"Nothing found",
				"No photos match this search. Clear search to see the album again.",
				`<button type="button" class="dash-btn dash-btn--ghost" data-photo-clear-search>Clear search</button>`,
			);
			return;
		}
		if (list.length === 0 && query.album !== "all") {
			els.content.innerHTML = emptyHtml(
				"Empty album",
				`${albumLabel(query.album)} has no photos yet.`,
				`<button type="button" class="dash-btn dash-btn--primary" data-photo-upload ${state.writable ? "" : "disabled"}>Upload to this album</button>`,
			);
			return;
		}

		els.content.innerHTML = `
			<ul class="dash-photo-grid" data-photo-grid role="list" aria-label="Photo grid">
				${list
					.map((photo, index) => {
						const thumb = thumbAttrs(photo);
						const active =
							selected &&
							selected.category === photo.category &&
							selected.slug === photo.slug;
						return `
					<li class="dash-photo-tile${active ? " is-selected" : ""}" ${canReorder ? 'data-reorder-item=""' : ""} data-slug="${escapeHtml(photo.slug)}" data-category="${escapeHtml(photo.category)}" data-photo-key="${escapeHtml(photoKey(photo))}">
						<button type="button" class="dash-photo-tile__hit" data-photo-open aria-label="Inspect ${escapeHtml(photo.title)}" aria-pressed="${active ? "true" : "false"}">
							<img src="${escapeHtml(thumb.src)}" srcset="${escapeHtml(thumb.srcset)}" sizes="${escapeHtml(thumb.sizes)}" alt="${escapeHtml(photo.alt)}" width="400" height="400" loading="${index < 12 ? "eager" : "lazy"}" decoding="async" />
						</button>
						<div class="dash-photo-tile__meta">
							<span class="dash-photo-tile__title">${escapeHtml(photo.title)}</span>
							${
								canReorder
									? `<div class="dash-photo-tile__reorder">
								<button type="button" class="dash-handle dash-photo-tile__handle" draggable="true" data-drag-handle aria-label="Reorder ${escapeHtml(photo.title)}" title="Drag to reorder">⠿</button>
								<button type="button" class="dash-photo-tile__move" data-photo-reorder="up" ${index === 0 || photoReorderBusy ? "disabled" : ""} aria-label="Move ${escapeHtml(photo.title)} earlier">↑</button>
								<button type="button" class="dash-photo-tile__move" data-photo-reorder="down" ${index === list.length - 1 || photoReorderBusy ? "disabled" : ""} aria-label="Move ${escapeHtml(photo.title)} later">↓</button>
							</div>`
									: ""
							}
						</div>
					</li>`;
					})
					.join("")}
			</ul>`;
	}

	function renderInspector() {
		if (!els.inspectorEmpty || !els.inspectorBody) return;
		if (!selected) {
			els.inspectorEmpty.hidden = false;
			els.inspectorBody.hidden = true;
			els.inspectorBody.innerHTML = "";
			ROOT.classList.remove("has-inspector");
			return;
		}
		const photo = findPhoto(selected.category, selected.slug);
		if (!photo) {
			selected = null;
			els.inspectorEmpty.hidden = false;
			els.inspectorBody.hidden = true;
			els.inspectorBody.innerHTML = "";
			ROOT.classList.remove("has-inspector");
			return;
		}

		ROOT.classList.add("has-inspector");
		els.inspectorEmpty.hidden = true;
		els.inspectorBody.hidden = false;
		const preview = hostImageSrc(photo.src, PREVIEW_W);
		const albumOptions = state.categories
			.map(
				(entry) =>
					`<option value="${escapeHtml(entry.slug)}" ${entry.slug === photo.category ? "selected" : ""}>${escapeHtml(entry.label)}</option>`,
			)
			.join("");

		els.inspectorBody.innerHTML = `
			<div class="dash-photo-inspector__panel">
				<div class="dash-photo-inspector__preview">
					<button type="button" class="dash-photo-inspector__preview-btn" data-photo-preview aria-label="Open larger preview">
						<img src="${escapeHtml(preview)}" alt="${escapeHtml(photo.alt)}" loading="lazy" decoding="async" />
					</button>
				</div>
				<form class="dash-photo-inspector__form" data-inspector-form>
					<p class="dash-photo-inspector__identity">${escapeHtml(photo.category)} / ${escapeHtml(photo.slug)}</p>
					<label>
						<span>Title</span>
						<input name="title" type="text" required maxlength="500" value="${escapeHtml(photo.title)}" ${state.writable ? "" : "readonly"} />
					</label>
					<label>
						<span>Alt text</span>
						<input name="alt" type="text" required maxlength="500" value="${escapeHtml(photo.alt)}" ${state.writable ? "" : "readonly"} />
					</label>
					<label>
						<span>Album</span>
						<select name="nextCategory" ${state.writable ? "" : "disabled"}>
							${albumOptions}
						</select>
					</label>
					<p class="dash-photo-inspector__status" data-inspector-status hidden></p>
					<div class="dash-photo-inspector__actions">
						<button type="submit" class="dash-btn dash-btn--primary" ${state.writable && !inspectorBusy ? "" : "disabled"}>Save</button>
						<button type="button" class="dash-btn dash-btn--ghost" data-photo-preview>Preview</button>
						<button type="button" class="dash-btn dash-btn--ghost" data-photo-replace ${state.writable && !inspectorBusy ? "" : "disabled"}>Replace asset</button>
						<button type="button" class="dash-btn dash-btn--danger" data-photo-delete ${state.writable && !inspectorBusy ? "" : "disabled"}>Delete</button>
					</div>
				</form>
				${
					query.album === photo.category
						? ""
						: `<p class="dash-photo-helper">This photo belongs to ${escapeHtml(albumLabel(photo.category))}.</p>`
				}
				<div class="dash-photo-inspector__mobile-bar">
					<button type="button" class="dash-btn dash-btn--ghost" data-inspector-close>Close</button>
				</div>
			</div>`;
	}

	function renderAll() {
		renderAlbumRail();
		renderGrid();
		renderInspector();
		syncControlsFromQuery();
	}

	function selectPhoto(category, slug, { openMobile = true } = {}) {
		selected = { category, slug };
		renderGrid();
		renderInspector();
		if (openMobile && window.matchMedia("(max-width: 1023px)").matches) {
			ROOT.classList.add("inspector-open");
		}
		announce(`Selected ${findPhoto(category, slug)?.title ?? "photo"}`);
	}

	function clearSelection() {
		selected = null;
		ROOT.classList.remove("inspector-open");
		renderGrid();
		renderInspector();
	}

	function setInspectorBusy(busy) {
		inspectorBusy = busy;
		const form = els.inspectorBody?.querySelector("[data-inspector-form]");
		if (!(form instanceof HTMLFormElement)) return;
		form
			.querySelectorAll(
				'button[type="submit"], [data-photo-replace], [data-photo-delete]',
			)
			.forEach((node) => {
				if (node instanceof HTMLButtonElement) {
					node.disabled = busy || !state.writable;
				}
			});
	}

	function isBusinessConflict(message) {
		return /already exists/i.test(String(message ?? ""));
	}

	function setInspectorStatus(message, isError = false) {
		const node = els.inspectorBody?.querySelector("[data-inspector-status]");
		if (!node) return;
		node.hidden = !message;
		node.textContent = message;
		node.dataset.error = isError ? "true" : "false";
	}

	function showConflict({ message, domain = "photos", reopenPhoto = null }) {
		window.DashOverlays.dialog({
			title: "Catalog changed",
			body: `
				<div class="dash-photo-conflict">
					<p class="dash-photo-conflict__title">Conflict</p>
					<p class="dash-photo-conflict__detail">${escapeHtml(message)}</p>
					<p class="dash-photo-conflict__detail">Reload the latest catalog before saving again. Your unsaved edits will not be applied automatically.</p>
				</div>`,
			actions: [
				{ label: "Discard", variant: "secondary" },
				{
					label: "Reload latest",
					variant: "primary",
					onClick() {
						void reloadLatest({ domain, reopenPhoto });
					},
				},
			],
		});
	}

	async function reloadLatest({ domain = "photos", reopenPhoto = null } = {}) {
		try {
			if (domain === "photoCategories" || domain === "both") {
				const catRes = await fetch("/api/photo-categories");
				const catJson = await readJson(catRes);
				if (!catRes.ok) {
					window.DashToast?.show({
						message: catJson.error ?? "Could not reload albums.",
						tone: "danger",
					});
					return;
				}
				state.categories = catJson.categories ?? [];
				if (typeof catJson.rev === "number") setCategoriesRev(catJson.rev);
			}
			if (domain === "photos" || domain === "both") {
				const res = await fetch("/api/photos");
				const json = await readJson(res);
				if (!res.ok) {
					window.DashToast?.show({
						message: json.error ?? "Could not reload photos.",
						tone: "danger",
					});
					return;
				}
				state.photos = json.photos ?? [];
				if (typeof json.rev === "number") setPhotosRev(json.rev);
				if (typeof json.writable === "boolean") state.writable = json.writable;
			}
			if (query.album !== "all" && !state.categories.some((c) => c.slug === query.album)) {
				query.album = "all";
				syncUrl();
			}
			renderAll();
			announce("Loaded latest catalog");
			window.DashToast?.show({
				message: "Loaded latest catalog",
				tone: "info",
			});
			if (reopenPhoto) {
				const fresh = findPhoto(reopenPhoto.category, reopenPhoto.slug);
				if (fresh) selectPhoto(fresh.category, fresh.slug);
				else {
					clearSelection();
					window.DashToast?.show({
						message: "That photo is no longer in the catalog.",
						tone: "warning",
					});
				}
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
				"Use JPEG, PNG, WebP, GIF, or BMP. RAW and HEIC are not converted.",
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
			canvas.toBlob(resolve, "image/webp", 0.8);
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

	function openAlbumDialog() {
		const layer = window.DashOverlays.dialog({
			title: "New album",
			body: `
				<form class="dash-photo-dialog-form" data-album-create-form>
					<label>
						<span>Album name</span>
						<input name="label" type="text" required maxlength="200" placeholder="e.g. Studio portraits" />
					</label>
					<p class="dash-photo-inspector__status" data-album-create-status hidden></p>
				</form>`,
			actions: [
				{ label: "Cancel", variant: "secondary", onClick() {} },
				{
					label: "Create",
					variant: "primary",
					onClick() {
						const form = layer.panel.querySelector("[data-album-create-form]");
						if (form instanceof HTMLFormElement) void createAlbum(form, layer);
						return false;
					},
				},
			],
		});
	}

	async function createAlbum(form, layer) {
		const label = String(new FormData(form).get("label") ?? "").trim();
		const status = form.querySelector("[data-album-create-status]");
		if (!label) {
			if (status) {
				status.hidden = false;
				status.textContent = "Album name is required.";
				status.dataset.error = "true";
			}
			return;
		}
		if (status) {
			status.hidden = false;
			status.textContent = "Creating…";
			status.dataset.error = "false";
		}
		const response = await fetch("/api/photo-categories", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ label, ...categoriesRev() }),
		});
		const result = await readJson(response);
		if (response.status === 409) {
			const err = String(result.error ?? "");
			// Duplicate slug is a form error; revision conflicts need reload.
			if (/already exists/i.test(err)) {
				if (status) {
					status.textContent = err;
					status.dataset.error = "true";
				}
				return;
			}
			layer.close();
			showConflict({
				message: err || "The album catalog changed.",
				domain: "photoCategories",
			});
			return;
		}
		if (!response.ok) {
			if (status) {
				status.textContent = result.error ?? "Could not create album.";
				status.dataset.error = "true";
			}
			return;
		}
		if (typeof result.rev === "number") setCategoriesRev(result.rev);
		if (result.category) state.categories.push(result.category);
		reportPublish(result.publish);
		query.album = result.category?.slug ?? query.album;
		syncUrl();
		layer.close();
		renderAll();
		announce(`Created album ${result.category?.label ?? ""}`);
	}

	function openRenameAlbum(slug) {
		const category = state.categories.find((entry) => entry.slug === slug);
		if (!category) return;
		const layer = window.DashOverlays.dialog({
			title: "Rename album",
			body: `
				<form class="dash-photo-dialog-form" data-album-rename-form>
					<label>
						<span>Album name</span>
						<input name="label" type="text" required maxlength="200" value="${escapeHtml(category.label)}" />
					</label>
					<p class="dash-photo-helper">Slug stays <code>${escapeHtml(category.slug)}</code> so media paths remain stable.</p>
					<p class="dash-photo-inspector__status" data-album-rename-status hidden></p>
				</form>`,
			actions: [
				{ label: "Cancel", variant: "secondary" },
				{
					label: "Save",
					variant: "primary",
					onClick() {
						const form = layer.panel.querySelector("[data-album-rename-form]");
						if (form instanceof HTMLFormElement)
							void renameAlbum(slug, form, layer);
						return false;
					},
				},
			],
		});
	}

	async function renameAlbum(slug, form, layer) {
		const label = String(new FormData(form).get("label") ?? "").trim();
		const status = form.querySelector("[data-album-rename-status]");
		if (!label) {
			if (status) {
				status.hidden = false;
				status.textContent = "Album name is required.";
				status.dataset.error = "true";
			}
			return;
		}
		const response = await fetch("/api/photo-categories", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				action: "rename",
				slug,
				label,
				...categoriesRev(),
			}),
		});
		const result = await readJson(response);
		if (response.status === 409) {
			layer.close();
			showConflict({
				message: result.error ?? "The album catalog changed.",
				domain: "photoCategories",
			});
			return;
		}
		if (!response.ok) {
			if (status) {
				status.hidden = false;
				status.textContent = result.error ?? "Could not rename.";
				status.dataset.error = "true";
			}
			return;
		}
		if (typeof result.rev === "number") setCategoriesRev(result.rev);
		const index = state.categories.findIndex((entry) => entry.slug === slug);
		if (index !== -1 && result.category) state.categories[index] = result.category;
		reportPublish(result.publish);
		layer.close();
		renderAll();
		announce(`Renamed album to ${label}`);
	}

	async function deleteAlbum(slug) {
		const category = state.categories.find((entry) => entry.slug === slug);
		if (!category) return;
		const count = albumCount(slug);
		if (count > 0) {
			window.DashToast?.show({
				message: `“${category.label}” still has ${count} photo${count === 1 ? "" : "s"}. Move or delete them first.`,
				tone: "warning",
			});
			return;
		}
		const confirmed = await window.DashOverlays.confirm({
			title: "Delete album",
			message: `Remove empty album “${category.label}”? This cannot be undone.`,
			confirmLabel: "Delete album",
			cancelLabel: "Cancel",
			destructive: true,
		});
		if (!confirmed) return;
		const rev = categoriesRev();
		const response = await fetch(
			`/api/photo-categories?slug=${encodeURIComponent(slug)}`,
			{
				method: "DELETE",
				headers: { "If-Match": String(rev.rev ?? 0) },
			},
		);
		const result = await readJson(response);
		if (response.status === 409) {
			showConflict({
				message: result.error ?? "The album catalog changed.",
				domain: "photoCategories",
			});
			return;
		}
		if (!response.ok) {
			window.DashToast?.show({
				message: result.error ?? "Could not delete album.",
				tone: "danger",
			});
			return;
		}
		if (typeof result.rev === "number") setCategoriesRev(result.rev);
		state.categories = state.categories.filter((entry) => entry.slug !== slug);
		if (query.album === slug) {
			query.album = "all";
			syncUrl();
		}
		reportPublish(result.publish);
		renderAll();
		announce(`Deleted album ${category.label}`);
	}

	function openUploadDialog() {
		const defaultAlbum =
			query.album !== "all"
				? query.album
				: (state.categories[0]?.slug ?? "");
		const options = state.categories
			.map(
				(entry) =>
					`<option value="${escapeHtml(entry.slug)}" ${entry.slug === defaultAlbum ? "selected" : ""}>${escapeHtml(entry.label)}</option>`,
			)
			.join("");
		const layer = window.DashOverlays.drawer({
			title: "Upload photos",
			body: `
				<div class="dash-photo-upload" data-upload-panel>
					<label>
						<span>Album</span>
						<select name="category" data-upload-category required ${state.categories.length ? "" : "disabled"}>
							${options || `<option value="">Create an album first</option>`}
						</select>
					</label>
					<div class="dash-photo-drop" data-upload-drop tabindex="0" role="button" aria-label="Drop images here or choose files">
						<p><strong>Drop images here</strong> or choose files</p>
						<p class="dash-photo-helper">JPEG, PNG, GIF, BMP, or WebP · converted to WebP · max edge 1600px</p>
						<input type="file" data-upload-input accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.bmp" multiple hidden />
						<button type="button" class="dash-btn dash-btn--ghost" data-upload-browse>Choose files</button>
					</div>
					<ul class="dash-photo-upload__list" data-upload-list hidden></ul>
					<p class="dash-photo-inspector__status" data-upload-status hidden></p>
				</div>`,
			actions: [
				{ label: "Close", variant: "secondary" },
			],
		});

		const drop = layer.panel.querySelector("[data-upload-drop]");
		const input = layer.panel.querySelector("[data-upload-input]");
		const browse = layer.panel.querySelector("[data-upload-browse]");
		browse?.addEventListener("click", () => input?.click());
		drop?.addEventListener("click", (event) => {
			if (event.target === browse) return;
			if (!(event.target instanceof HTMLInputElement)) input?.click();
		});
		drop?.addEventListener("keydown", (event) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				input?.click();
			}
		});
		["dragenter", "dragover"].forEach((type) => {
			drop?.addEventListener(type, (event) => {
				event.preventDefault();
				drop.classList.add("is-dragover");
			});
		});
		["dragleave", "drop"].forEach((type) => {
			drop?.addEventListener(type, (event) => {
				event.preventDefault();
				drop.classList.remove("is-dragover");
			});
		});
		drop?.addEventListener("drop", (event) => {
			const files = [...(event.dataTransfer?.files ?? [])];
			if (files.length) void runUploads(files, layer);
		});
		input?.addEventListener("change", () => {
			const files = [...(input.files ?? [])];
			if (files.length) void runUploads(files, layer);
			input.value = "";
		});
	}

	async function runUploads(files, layer) {
		if (uploadBusy) return;
		uploadBusy = true;
		const categoryEl = layer.panel.querySelector("[data-upload-category]");
		const listEl = layer.panel.querySelector("[data-upload-list]");
		const statusEl = layer.panel.querySelector("[data-upload-status]");
		const category = String(categoryEl?.value ?? "");
		if (!category) {
			uploadBusy = false;
			if (statusEl) {
				statusEl.hidden = false;
				statusEl.textContent = "Pick an album first.";
				statusEl.dataset.error = "true";
			}
			return;
		}
		if (listEl) {
			listEl.hidden = false;
			listEl.innerHTML = files
				.map(
					(file, index) =>
						`<li data-upload-item="${index}"><span>${escapeHtml(file.name)}</span><span data-upload-item-status>Waiting…</span></li>`,
				)
				.join("");
		}

		let cursor = 0;
		let success = 0;
		let failed = 0;
		let stoppedForConflict = false;

		async function enqueueUpload(task) {
			const run = uploadGate.then(task, task);
			uploadGate = run.catch(() => undefined);
			return run;
		}

		async function worker() {
			while (cursor < files.length) {
				if (stoppedForConflict) return;
				const index = cursor++;
				const file = files[index];
				const row = listEl?.querySelector(`[data-upload-item="${index}"]`);
				const rowStatus = row?.querySelector("[data-upload-item-status]");
				try {
					if (rowStatus) rowStatus.textContent = "Converting…";
					const webp = await toWebp(file);
					if (stoppedForConflict) return;
					if (rowStatus) rowStatus.textContent = "Uploading…";
					await enqueueUpload(async () => {
						if (stoppedForConflict) return;
						const payload = new FormData();
						payload.set("file", webp);
						payload.set("category", category);
						payload.set("title", file.name.replace(/\.[^.]+$/, ""));
						payload.set("rev", String(photosRev().rev ?? 0));
						const response = await fetch("/api/photos", {
							method: "POST",
							body: payload,
						});
						const result = await readJson(response);
						if (response.status === 409) {
							if (rowStatus) rowStatus.textContent = "Conflict";
							failed += 1;
							stoppedForConflict = true;
							showConflict({
								message:
									result.error ??
									"The photo catalog changed during upload.",
								domain: "photos",
							});
							return;
						}
						if (!response.ok) {
							if (rowStatus)
								rowStatus.textContent = result.error ?? "Failed";
							failed += 1;
							return;
						}
						if (typeof result.rev === "number") setPhotosRev(result.rev);
						if (result.photo) upsertPhoto(result.photo);
						if (rowStatus) rowStatus.textContent = "Done";
						success += 1;
						reportPublish(result.publish);
					});
				} catch (error) {
					if (rowStatus)
						rowStatus.textContent =
							error instanceof Error ? error.message : "Failed";
					failed += 1;
				}
			}
		}

		try {
			const workers = Array.from(
				{ length: Math.min(UPLOAD_CONCURRENCY, files.length) },
				() => worker(),
			);
			await Promise.all(workers);
			renderAll();
			if (statusEl) {
				statusEl.hidden = false;
				statusEl.dataset.error = failed ? "true" : "false";
				statusEl.textContent =
					failed === 0
						? `Uploaded ${success} photo${success === 1 ? "" : "s"}.`
						: `Uploaded ${success}, failed ${failed}. Successful files were kept.`;
			}
			announce(
				failed === 0
					? `Uploaded ${success} photos`
					: `Uploaded ${success}, failed ${failed}`,
			);
		} finally {
			uploadBusy = false;
		}
	}

	async function saveInspector(form) {
		if (!selected || inspectorBusy) return;
		const photo = findPhoto(selected.category, selected.slug);
		if (!photo) return;
		const data = new FormData(form);
		const title = String(data.get("title") ?? "").trim();
		const alt = String(data.get("alt") ?? "").trim();
		const nextCategory = String(data.get("nextCategory") ?? photo.category);
		if (!title || !alt) {
			setInspectorStatus("Title and alt text are required.", true);
			return;
		}
		setInspectorBusy(true);
		setInspectorStatus("Saving…", false);
		try {
			const response = await fetch("/api/photos", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					action: "update",
					slug: photo.slug,
					category: photo.category,
					title,
					alt,
					nextCategory,
					...photosRev(),
				}),
			});
			const result = await readJson(response);
			if (response.status === 409) {
				if (isBusinessConflict(result.error)) {
					setInspectorStatus(result.error, true);
					return;
				}
				setInspectorStatus("", false);
				showConflict({
					message: result.error ?? "The photo catalog changed.",
					domain: "photos",
					reopenPhoto: { category: photo.category, slug: photo.slug },
				});
				return;
			}
			if (!response.ok) {
				setInspectorStatus(result.error ?? "Could not save.", true);
				return;
			}
			if (typeof result.rev === "number") setPhotosRev(result.rev);
			if (result.photo) {
				if (
					result.photo.category !== photo.category ||
					result.photo.slug !== photo.slug
				) {
					removePhoto(photo.category, photo.slug);
				}
				upsertPhoto(result.photo);
				selected = {
					category: result.photo.category,
					slug: result.photo.slug,
				};
			}
			reportPublish(result.publish);
			setInspectorStatus("Saved.", false);
			renderAll();
			announce(`Updated ${result.photo?.title ?? photo.title}`);
		} finally {
			setInspectorBusy(false);
		}
	}

	function openReplacePicker() {
		if (!selected || !state.writable || inspectorBusy) return;
		const input = document.createElement("input");
		input.type = "file";
		input.accept =
			"image/jpeg,image/png,image/webp,image/gif,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.bmp";
		input.addEventListener("change", () => {
			const file = input.files?.[0];
			if (file) void replaceAsset(file);
		});
		input.click();
	}

	async function replaceAsset(file) {
		if (!selected || inspectorBusy) return;
		const photo = findPhoto(selected.category, selected.slug);
		if (!photo) return;
		setInspectorBusy(true);
		setInspectorStatus("Converting…", false);
		try {
			const webp = await toWebp(file);
			setInspectorStatus("Replacing…", false);
			const payload = new FormData();
			payload.set("intent", "replace");
			payload.set("file", webp);
			payload.set("category", photo.category);
			payload.set("slug", photo.slug);
			payload.set("title", photo.title);
			payload.set("alt", photo.alt);
			payload.set("rev", String(photosRev().rev ?? 0));
			const response = await fetch("/api/photos", {
				method: "POST",
				body: payload,
			});
			const result = await readJson(response);
			if (response.status === 409) {
				setInspectorStatus("", false);
				showConflict({
					message: result.error ?? "The photo catalog changed.",
					domain: "photos",
					reopenPhoto: selected,
				});
				return;
			}
			if (!response.ok) {
				setInspectorStatus(result.error ?? "Replace failed.", true);
				return;
			}
			if (typeof result.rev === "number") setPhotosRev(result.rev);
			if (result.photo) upsertPhoto(result.photo);
			reportPublish(result.publish);
			setInspectorStatus("Asset replaced.", false);
			renderAll();
			announce(`Replaced ${photo.title}`);
		} catch (error) {
			setInspectorStatus(
				error instanceof Error ? error.message : "Could not convert image.",
				true,
			);
		} finally {
			setInspectorBusy(false);
		}
	}

	async function deleteSelectedPhoto() {
		if (!selected) return;
		const photo = findPhoto(selected.category, selected.slug);
		if (!photo) return;
		const confirmed = await window.DashOverlays.confirm({
			title: "Delete photo",
			message: `Remove “${photo.title}” from ${albumLabel(photo.category)}? The image file is deleted permanently.`,
			confirmLabel: "Delete",
			cancelLabel: "Cancel",
			destructive: true,
		});
		if (!confirmed) return;
		const rev = photosRev();
		const response = await fetch(
			`/api/photos?slug=${encodeURIComponent(photo.slug)}&category=${encodeURIComponent(photo.category)}`,
			{
				method: "DELETE",
				headers: { "If-Match": String(rev.rev ?? 0) },
			},
		);
		const result = await readJson(response);
		if (response.status === 409) {
			showConflict({
				message: result.error ?? "The photo catalog changed.",
				domain: "photos",
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
		if (typeof result.rev === "number") setPhotosRev(result.rev);
		removePhoto(photo.category, photo.slug);
		clearSelection();
		reportPublish(result.publish);
		renderAll();
		announce(`Deleted ${photo.title}`);
	}

	function openLightbox(startPhoto) {
		const list = visiblePhotos();
		let index = list.findIndex(
			(photo) =>
				photo.category === startPhoto.category &&
				photo.slug === startPhoto.slug,
		);
		if (index < 0) index = 0;

		function renderFrame() {
			const photo = list[index];
			if (!photo || !lightboxLayer) return;
			const src = hostImageSrc(photo.src, PREVIEW_W);
			const body = lightboxLayer.panel.querySelector("[data-lightbox-body]");
			if (!body) return;
			body.innerHTML = `
				<img src="${escapeHtml(src)}" alt="${escapeHtml(photo.alt)}" />
				<div class="dash-photo-lightbox__meta">
					<strong>${escapeHtml(photo.title)}</strong>
					<span>${index + 1} / ${list.length}</span>
				</div>`;
		}

		lightboxLayer = window.DashOverlays.dialog({
			title: startPhoto.title,
			body: `<div class="dash-photo-lightbox" data-lightbox-body></div>`,
			actions: [
				{
					label: "Previous",
					variant: "secondary",
					onClick() {
						index = (index - 1 + list.length) % list.length;
						renderFrame();
						return false;
					},
				},
				{
					label: "Next",
					variant: "secondary",
					onClick() {
						index = (index + 1) % list.length;
						renderFrame();
						return false;
					},
				},
				{ label: "Close", variant: "primary" },
			],
		});
		renderFrame();

		function onKey(event) {
			if (!lightboxLayer) return;
			if (event.key === "ArrowLeft") {
				index = (index - 1 + list.length) % list.length;
				renderFrame();
			} else if (event.key === "ArrowRight") {
				index = (index + 1) % list.length;
				renderFrame();
			}
		}
		document.addEventListener("keydown", onKey);
		const originalClose = lightboxLayer.close.bind(lightboxLayer);
		lightboxLayer.close = () => {
			document.removeEventListener("keydown", onKey);
			lightboxLayer = null;
			originalClose();
		};
	}

	async function persistPhotoReorder(slugs, announcement) {
		if (!photosReorderAllowed() || photoReorderBusy || !state.writable) return;
		const category = query.album;
		photoReorderBusy = true;
		renderGrid();
		try {
			const response = await fetch("/api/photos", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					action: "reorder",
					category,
					slugs,
					...photosRev(),
				}),
			});
			const result = await readJson(response);
			if (response.status === 409) {
				photoReorderBusy = false;
				renderGrid();
				showConflict({
					message: result.error ?? "The photo catalog changed.",
					domain: "photos",
				});
				return;
			}
			if (!response.ok) {
				window.DashToast?.show({
					message: result.error ?? "Could not reorder.",
					tone: "danger",
				});
				await reloadLatest({ domain: "photos" });
				photoReorderBusy = false;
				return;
			}
			if (typeof result.rev === "number") setPhotosRev(result.rev);
			const bySlug = new Map(
				state.photos
					.filter((photo) => photo.category === category)
					.map((photo) => [photo.slug, photo]),
			);
			const reordered = slugs
				.map((slug) => bySlug.get(slug))
				.filter(Boolean);
			const rebuilt = [];
			let inserted = false;
			for (const photo of state.photos) {
				if (photo.category === category) {
					if (!inserted) {
						rebuilt.push(...reordered);
						inserted = true;
					}
					continue;
				}
				rebuilt.push(photo);
			}
			if (!inserted) rebuilt.push(...reordered);
			state.photos = rebuilt;
			reportPublish(result.publish);
			if (announcement) announce(announcement);
		} catch {
			window.DashToast?.show({
				message: "Network error while reordering.",
				tone: "danger",
			});
			await reloadLatest({ domain: "photos" });
		} finally {
			photoReorderBusy = false;
			renderGrid();
		}
	}

	async function persistAlbumReorder(slugs, announcement) {
		if (albumReorderBusy || !state.writable) return;
		albumReorderBusy = true;
		try {
			const response = await fetch("/api/photo-categories", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					action: "reorder",
					slugs,
					...categoriesRev(),
				}),
			});
			const result = await readJson(response);
			if (response.status === 409) {
				showConflict({
					message: result.error ?? "The album catalog changed.",
					domain: "photoCategories",
				});
				return;
			}
			if (!response.ok) {
				window.DashToast?.show({
					message: result.error ?? "Could not reorder albums.",
					tone: "danger",
				});
				await reloadLatest({ domain: "photoCategories" });
				return;
			}
			if (typeof result.rev === "number") setCategoriesRev(result.rev);
			const bySlug = new Map(
				state.categories.map((entry) => [entry.slug, entry]),
			);
			state.categories = slugs
				.map((slug) => bySlug.get(slug))
				.filter(Boolean);
			reportPublish(result.publish);
			if (announcement) announce(announcement);
			renderAlbumRail();
		} catch {
			window.DashToast?.show({
				message: "Network error while reordering albums.",
				tone: "danger",
			});
			await reloadLatest({ domain: "photoCategories" });
		} finally {
			albumReorderBusy = false;
		}
	}

	function setupListReorder(list, options) {
		list.addEventListener("dragstart", (event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			const handle = target.closest(options.handleSelector);
			if (!handle || !list.contains(handle)) return;
			const item = handle.closest("[data-reorder-item]");
			if (!(item instanceof HTMLElement) || item.parentElement !== list)
				return;
			dragEl = item;
			item.classList.add("is-dragging");
			event.dataTransfer?.setData("text/plain", options.slugFrom(item) ?? "");
			if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
		});
		list.addEventListener("dragend", () => {
			dragEl?.classList.remove("is-dragging");
			list
				.querySelectorAll(".is-drop-target")
				.forEach((el) => el.classList.remove("is-drop-target"));
			dragEl = null;
		});
		list.addEventListener("dragover", (event) => {
			if (!dragEl) return;
			event.preventDefault();
			const target = event.target;
			if (!(target instanceof Element)) return;
			const over = target.closest("[data-reorder-item]");
			if (
				!(over instanceof HTMLElement) ||
				over === dragEl ||
				over.parentElement !== list
			)
				return;
			list
				.querySelectorAll(".is-drop-target")
				.forEach((el) => el.classList.remove("is-drop-target"));
			over.classList.add("is-drop-target");
			const rect = over.getBoundingClientRect();
			const before =
				options.axis === "xy"
					? event.clientX < rect.left + rect.width / 2
					: event.clientY < rect.top + rect.height / 2;
			if (before) list.insertBefore(dragEl, over);
			else list.insertBefore(dragEl, over.nextSibling);
		});
		list.addEventListener("drop", async (event) => {
			event.preventDefault();
			if (!dragEl) return;
			list
				.querySelectorAll(".is-drop-target")
				.forEach((el) => el.classList.remove("is-drop-target"));
			const slugs = [...list.children]
				.filter((el) => el instanceof HTMLElement && el.hasAttribute("data-reorder-item"))
				.map((el) => options.slugFrom(el))
				.filter(Boolean);
			await options.persist(slugs);
		});
	}

	function movePhoto(slug, direction) {
		if (!photosReorderAllowed()) return;
		const list = visiblePhotos().map((photo) => photo.slug);
		const index = list.indexOf(slug);
		if (index < 0) return;
		const next = list.slice();
		const target =
			direction === "up"
				? index - 1
				: direction === "down"
					? index + 1
					: direction === "top"
						? 0
						: next.length - 1;
		if (target < 0 || target >= next.length || target === index) return;
		next.splice(index, 1);
		next.splice(target, 0, slug);
		void persistPhotoReorder(
			next,
			`Moved photo ${direction === "up" ? "earlier" : "later"}`,
		);
	}

	function moveAlbum(slug, direction) {
		const list = state.categories.map((entry) => entry.slug);
		const index = list.indexOf(slug);
		if (index < 0) return;
		const target = direction === "up" ? index - 1 : index + 1;
		if (target < 0 || target >= list.length) return;
		const next = list.slice();
		next.splice(index, 1);
		next.splice(target, 0, slug);
		void persistAlbumReorder(next, `Moved album ${direction}`);
	}

	ROOT.addEventListener("click", (event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;

		if (target.closest("[data-photo-new-album]")) {
			openAlbumDialog();
			return;
		}
		if (target.closest("[data-album-rename]")) {
			if (query.album !== "all") openRenameAlbum(query.album);
			return;
		}
		if (target.closest("[data-album-delete]")) {
			if (query.album !== "all") void deleteAlbum(query.album);
			return;
		}
		if (target.closest("[data-photo-upload]")) {
			openUploadDialog();
			return;
		}
		if (target.closest("[data-photo-clear-search]")) {
			query.q = "";
			syncUrl();
			renderAll();
			return;
		}
		const albumBtn = target.closest("[data-album]");
		if (albumBtn instanceof HTMLElement && albumBtn.dataset.album) {
			query.album = albumBtn.dataset.album;
			syncUrl();
			renderAll();
			return;
		}
		const albumMove = target.closest("[data-album-reorder]");
		if (albumMove instanceof HTMLElement) {
			const row = albumMove.closest("[data-category]");
			const slug = row instanceof HTMLElement ? row.dataset.category : null;
			const dir = albumMove.getAttribute("data-album-reorder");
			if (slug && (dir === "up" || dir === "down")) moveAlbum(slug, dir);
			return;
		}
		const openBtn = target.closest("[data-photo-open]");
		if (openBtn) {
			const tile = openBtn.closest("[data-photo-key]");
			if (tile instanceof HTMLElement) {
				selectPhoto(tile.dataset.category ?? "", tile.dataset.slug ?? "");
			}
			return;
		}
		const photoMove = target.closest("[data-photo-reorder]");
		if (photoMove instanceof HTMLElement) {
			const tile = photoMove.closest("[data-slug]");
			const slug = tile instanceof HTMLElement ? tile.dataset.slug : null;
			const dir = photoMove.getAttribute("data-photo-reorder");
			if (slug && (dir === "up" || dir === "down")) movePhoto(slug, dir);
			return;
		}
		if (target.closest("[data-inspector-close]")) {
			clearSelection();
			return;
		}
		if (target.closest("[data-photo-preview]")) {
			if (selected) {
				const photo = findPhoto(selected.category, selected.slug);
				if (photo) openLightbox(photo);
			}
			return;
		}
		if (target.closest("[data-photo-replace]")) {
			openReplacePicker();
			return;
		}
		if (target.closest("[data-photo-delete]")) {
			void deleteSelectedPhoto();
			return;
		}
	});

	ROOT.addEventListener("contextmenu", (event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const row = target.closest(".dash-photo-rail__row[data-category]");
		if (!(row instanceof HTMLElement) || !state.writable) return;
		event.preventDefault();
		const slug = row.dataset.category;
		if (!slug) return;
		window.DashOverlays.dialog({
			title: albumLabel(slug),
			body: `<p class="dash-photo-helper">Album actions</p>`,
			actions: [
				{
					label: "Rename",
					variant: "secondary",
					onClick() {
						openRenameAlbum(slug);
					},
				},
				{
					label: "Delete",
					variant: "danger",
					onClick() {
						void deleteAlbum(slug);
					},
				},
				{ label: "Cancel", variant: "ghost" },
			],
		});
	});

	ROOT.addEventListener("submit", (event) => {
		const form = event.target;
		if (!(form instanceof HTMLFormElement)) return;
		if (form.matches("[data-inspector-form]")) {
			event.preventDefault();
			void saveInspector(form);
		}
	});

	els.search?.addEventListener("input", () => {
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			query.q = els.search?.value ?? "";
			syncUrl();
			renderGrid();
			if (els.reorderHint) els.reorderHint.hidden = photosReorderAllowed();
		}, SEARCH_DEBOUNCE_MS);
	});

	els.sort?.addEventListener("change", () => {
		query.sort = els.sort?.value === "title" ? "title" : "order";
		syncUrl();
		renderGrid();
	});

	els.albumSelect?.addEventListener("change", () => {
		query.album = els.albumSelect?.value || "all";
		syncUrl();
		renderAll();
	});

	window.addEventListener("popstate", () => {
		query = parseUrlQuery();
		renderAll();
	});

	ROOT.addEventListener("keydown", (event) => {
		if (!(event.target instanceof Element)) return;
		if (!event.target.closest("[data-photo-grid]")) return;
		const tile = event.target.closest(".dash-photo-tile");
		if (!(tile instanceof HTMLElement)) return;
		const list = [...(els.content?.querySelectorAll(".dash-photo-tile") ?? [])];
		const index = list.indexOf(tile);
		if (index < 0) return;
		let next = -1;
		if (event.key === "ArrowRight") next = Math.min(list.length - 1, index + 1);
		if (event.key === "ArrowLeft") next = Math.max(0, index - 1);
		if (event.key === "ArrowDown") next = Math.min(list.length - 1, index + 4);
		if (event.key === "ArrowUp") next = Math.max(0, index - 4);
		if (next >= 0 && next !== index) {
			event.preventDefault();
			const hit = list[next]?.querySelector("[data-photo-open]");
			if (hit instanceof HTMLElement) hit.focus();
		}
		if (event.key === "Enter" || event.key === " ") {
			const open = tile.querySelector("[data-photo-open]");
			if (open instanceof HTMLElement && event.target === open) return;
		}
	});

	// Observe grid for drag reorder after renders
	const mo = new MutationObserver(() => {
		const grid = els.content?.querySelector("[data-photo-grid]");
		if (grid instanceof HTMLElement && !grid.dataset.reorderBound) {
			grid.dataset.reorderBound = "1";
			setupListReorder(grid, {
				handleSelector: "[data-drag-handle]",
				slugFrom: (el) => el.dataset.slug,
				axis: "xy",
				persist: (slugs) =>
					persistPhotoReorder(slugs, "Saved photo order"),
			});
		}
	});
	if (els.content) mo.observe(els.content, { childList: true, subtree: true });

	if (els.albumList) {
		setupListReorder(els.albumList, {
			handleSelector: "[data-category-handle]",
			slugFrom: (el) => el.dataset.category,
			axis: "y",
			persist: (slugs) => persistAlbumReorder(slugs, "Saved album order"),
		});
	}

	// Bootstrap
	const bootNode = document.getElementById("dash-photo-bootstrap");
	try {
		const boot = bootNode?.textContent
			? JSON.parse(bootNode.textContent)
			: null;
		state.photos = boot?.photos ?? [];
		state.categories = boot?.categories ?? [];
		state.writable = Boolean(boot?.writable);
	} catch {
		state = { photos: [], categories: [], writable: false };
	}
	query = parseUrlQuery();
	syncControlsFromQuery();
	if (els.reorderHint) els.reorderHint.hidden = photosReorderAllowed();

	// Bind initial grid reorder if SSR rendered it
	const initialGrid = els.content?.querySelector("[data-photo-grid]");
	if (initialGrid instanceof HTMLElement) {
		initialGrid.dataset.reorderBound = "1";
		setupListReorder(initialGrid, {
			handleSelector: "[data-drag-handle]",
			slugFrom: (el) => el.dataset.slug,
			axis: "xy",
			persist: (slugs) => persistPhotoReorder(slugs, "Saved photo order"),
		});
	}

	// Expose album manage via long-press alternative: double-click title
	ROOT.addEventListener("dblclick", (event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const item = target.closest(".dash-photo-rail__item[data-album]");
		if (!(item instanceof HTMLElement)) return;
		const slug = item.dataset.album;
		if (!slug || slug === "all" || !state.writable) return;
		openRenameAlbum(slug);
	});
})();
