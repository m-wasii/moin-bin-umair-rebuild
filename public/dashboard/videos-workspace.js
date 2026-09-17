/**
 * Videos workspace — search/filter/sort, drawer CRUD, CAS, reorder, publish UI.
 * Depends on DashToast, DashOverlays, DashRevisions (Phase 3A).
 */
(function () {
	const ROOT = document.querySelector("[data-videos-workspace]");
	if (!ROOT) return;

	const CATEGORY_LABELS = {
		indie: "Indie / Art",
		local: "Local",
		bts: "BTS",
	};

	const SEARCH_DEBOUNCE_MS = 280;

	/** @type {{ videos: any[], writable: boolean }} */
	let state = { videos: [], writable: false };
	/** @type {{ q: string, category: string, featured: string, provider: string, sort: string }} */
	let query = {
		q: "",
		category: "all",
		featured: "all",
		provider: "all",
		sort: "order",
	};
	/** @type {ReturnType<typeof setTimeout> | null} */
	let searchTimer = null;
	/** @type {HTMLElement | null} */
	let dragEl = null;
	let reorderBusy = false;
	/** @type {{ mode: "create" | "edit", slug?: string } | null} */
	let drawerContext = null;

	const els = {
		search: ROOT.querySelector("[data-videos-search]"),
		sort: ROOT.querySelector("[data-videos-sort]"),
		featured: ROOT.querySelector("[data-videos-featured]"),
		provider: ROOT.querySelector("[data-videos-provider]"),
		count: ROOT.querySelector("[data-videos-count]"),
		chips: ROOT.querySelector("[data-videos-chips]"),
		reorderHint: ROOT.querySelector("[data-videos-reorder-hint]"),
		content: ROOT.querySelector("[data-videos-content]"),
		live: ROOT.querySelector("[data-videos-live]"),
	};

	function escapeHtml(value) {
		return String(value)
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;")
			.replaceAll(">", "&gt;")
			.replaceAll('"', "&quot;");
	}

	function categoryLabel(category) {
		return CATEGORY_LABELS[category] ?? category;
	}

	function providerLabel(provider) {
		return provider === "youtube" ? "YouTube" : "Vimeo";
	}

	function formatDuration(duration) {
		const minutes = Math.floor(Number(duration) / 60);
		const seconds = Number(duration) % 60;
		return `${minutes}:${String(seconds).padStart(2, "0")}`;
	}

	function normalizeQuery(q) {
		return String(q ?? "")
			.trim()
			.toLowerCase();
	}

	function videoMatchesSearch(video, q) {
		const needle = normalizeQuery(q);
		if (!needle) return true;
		const haystack = [
			video.title,
			video.description ?? "",
			video.slug,
			video.id,
			video.url,
			video.category,
			categoryLabel(video.category),
		]
			.join("\n")
			.toLowerCase();
		return haystack.includes(needle);
	}

	function filterVideos(videos, q) {
		let list = videos.slice();
		if (normalizeQuery(q.q)) {
			list = list.filter((video) => videoMatchesSearch(video, q.q));
		}
		if (q.category !== "all") {
			list = list.filter((video) => video.category === q.category);
		}
		if (q.featured === "featured") {
			list = list.filter((video) => video.featured === true);
		} else if (q.featured === "not-featured") {
			list = list.filter((video) => !video.featured);
		}
		if (q.provider !== "all") {
			list = list.filter((video) => video.provider === q.provider);
		}
		return sortVideos(list, q.sort);
	}

	function compareOrder(a, b) {
		const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
		const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
		if (ao !== bo) return ao - bo;
		return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
	}

	function sortVideos(videos, sort) {
		const copy = videos.slice();
		switch (sort) {
			case "title":
				return copy.sort((a, b) =>
					a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
				);
			case "category":
				return copy.sort((a, b) => {
					const byCat = a.category.localeCompare(b.category);
					if (byCat !== 0) return byCat;
					return compareOrder(a, b);
				});
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

	function reorderAllowed() {
		if (query.sort !== "order") return false;
		if (normalizeQuery(query.q)) return false;
		if (query.category !== "all") return false;
		if (query.featured !== "all") return false;
		if (query.provider !== "all") return false;
		return true;
	}

	function announce(message) {
		if (!els.live) return;
		els.live.textContent = "";
		window.requestAnimationFrame(() => {
			if (els.live) els.live.textContent = message;
		});
	}

	function parseUrlQuery() {
		const params = new URLSearchParams(window.location.search);
		const category = params.get("category");
		const featured = params.get("featured");
		const provider = params.get("provider");
		const sort = params.get("sort");
		return {
			q: params.get("q") ?? "",
			category:
				category === "indie" || category === "local" || category === "bts"
					? category
					: "all",
			featured:
				featured === "featured" || featured === "not-featured"
					? featured
					: "all",
			provider:
				provider === "youtube" || provider === "vimeo" ? provider : "all",
			sort:
				sort === "title" || sort === "category" || sort === "year"
					? sort
					: "order",
		};
	}

	function syncUrl(replace = true) {
		const params = new URLSearchParams();
		if (normalizeQuery(query.q)) params.set("q", query.q.trim());
		if (query.category !== "all") params.set("category", query.category);
		if (query.featured !== "all") params.set("featured", query.featured);
		if (query.provider !== "all") params.set("provider", query.provider);
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
		if (els.featured) els.featured.value = query.featured;
		if (els.provider) els.provider.value = query.provider;

		ROOT.querySelectorAll("[data-videos-category]").forEach((btn) => {
			const value = btn.getAttribute("data-videos-category");
			const selected = value === query.category;
			btn.setAttribute("aria-selected", selected ? "true" : "false");
			btn.dataset.active = selected ? "true" : "false";
		});
	}

	function chipLabel(key, value) {
		if (key === "category") return `Category: ${categoryLabel(value)}`;
		if (key === "featured") {
			return value === "featured" ? "Featured" : "Not featured";
		}
		if (key === "provider") return providerLabel(value);
		return value;
	}

	function renderChips() {
		if (!els.chips) return;
		const chips = [];
		if (query.category !== "all") {
			chips.push({ key: "category", value: query.category });
		}
		if (query.featured !== "all") {
			chips.push({ key: "featured", value: query.featured });
		}
		if (query.provider !== "all") {
			chips.push({ key: "provider", value: query.provider });
		}
		if (chips.length === 0) {
			els.chips.hidden = true;
			els.chips.innerHTML = "";
			return;
		}
		els.chips.hidden = false;
		els.chips.innerHTML = `${chips
			.map(
				(chip) => `
			<span class="dash-videos-chip" data-chip-key="${escapeHtml(chip.key)}">
				${escapeHtml(chipLabel(chip.key, chip.value))}
				<button
					type="button"
					class="dash-videos-chip__remove"
					data-videos-chip-remove="${escapeHtml(chip.key)}"
					aria-label="Remove ${escapeHtml(chipLabel(chip.key, chip.value))} filter"
				>×</button>
			</span>`,
			)
			.join("")}
			<button type="button" class="dash-videos-chips__clear" data-videos-clear-filters>
				Clear filters
			</button>`;
	}

	function updateCount(visibleLen) {
		if (els.count) {
			const total = state.videos.length;
			els.count.textContent =
				total === 0 ? "No videos" : `Showing ${visibleLen} of ${total}`;
		}
		const pageDesc = document.querySelector(
			".dash-videos .dash-page-header__desc",
		);
		if (pageDesc) {
			const total = state.videos.length;
			pageDesc.textContent = `${total} video${total === 1 ? "" : "s"} in the catalog. Search, filter, and edit without leaving this page.`;
		}
	}

	function updateReorderHint() {
		if (!els.reorderHint) return;
		els.reorderHint.hidden = reorderAllowed();
	}

	function emptyStateHtml({ title, detail, action }) {
		return `
			<div class="dash-empty" role="status">
				<p class="dash-empty__title">${escapeHtml(title)}</p>
				${detail ? `<p class="dash-empty__detail">${escapeHtml(detail)}</p>` : ""}
				${
					action
						? `<div class="dash-empty__actions">
					<button type="button" class="dash-btn dash-btn--${action.variant ?? "secondary"}" data-empty-action="${escapeHtml(action.id)}">
						${escapeHtml(action.label)}
					</button>
				</div>`
						: ""
				}
			</div>`;
	}

	function thumbHtml(video, className) {
		if (video.thumbnail) {
			return `<img class="${className}" src="${escapeHtml(video.thumbnail)}" alt="" width="52" height="30" loading="lazy" decoding="async" />`;
		}
		return `<span class="${className}" aria-hidden="true"></span>`;
	}

	function reorderControlsHtml(video, index, total, canReorder) {
		const disabled = !canReorder || !state.writable || reorderBusy;
		const atStart = index === 0;
		const atEnd = index === total - 1;
		return `
			<div class="dash-videos-reorder" data-disabled="${canReorder ? "false" : "true"}">
				<button
					type="button"
					class="dash-videos-reorder__handle"
					draggable="${canReorder && state.writable && !reorderBusy}"
					data-drag-handle
					${disabled || !canReorder ? "disabled" : ""}
					aria-label="Reorder ${escapeHtml(video.title)}"
					title="${canReorder ? "Drag to reorder" : "Reorder disabled while filtered or sorted"}"
				>⠿</button>
				<div class="dash-videos-reorder__controls">
					<button type="button" class="dash-videos-reorder__btn" data-reorder="up" ${disabled || atStart ? "disabled" : ""} aria-label="Move ${escapeHtml(video.title)} up">↑</button>
					<button type="button" class="dash-videos-reorder__btn" data-reorder="down" ${disabled || atEnd ? "disabled" : ""} aria-label="Move ${escapeHtml(video.title)} down">↓</button>
					<button type="button" class="dash-videos-reorder__btn" data-reorder="top" ${disabled || atStart ? "disabled" : ""} aria-label="Move ${escapeHtml(video.title)} to top">⤒</button>
					<button type="button" class="dash-videos-reorder__btn" data-reorder="bottom" ${disabled || atEnd ? "disabled" : ""} aria-label="Move ${escapeHtml(video.title)} to bottom">⤓</button>
				</div>
			</div>`;
	}

	function rowHtml(video, index, total, canReorder) {
		const writeDisabled = !state.writable ? "disabled" : "";
		return `
			<tr data-slug="${escapeHtml(video.slug)}" ${canReorder ? 'data-reorder-item=""' : ""}>
				<td class="dash-videos-col--order">${reorderControlsHtml(video, index, total, canReorder)}</td>
				<td class="dash-videos-table__thumb-cell">${thumbHtml(video, "dash-videos-table__thumb")}</td>
				<td>
					<div class="dash-videos-table__title">
						<p class="dash-videos-table__title-text">${escapeHtml(video.title)}</p>
						<p class="dash-videos-table__provider">${escapeHtml(providerLabel(video.provider))}</p>
					</div>
				</td>
				<td>${escapeHtml(categoryLabel(video.category))}</td>
				<td class="dash-videos-col--year">${escapeHtml(String(video.year))}</td>
				<td class="dash-videos-col--duration">${escapeHtml(formatDuration(video.duration))}</td>
				<td>${video.featured ? "Yes" : "—"}</td>
				<td class="dash-videos-col--order">${escapeHtml(String(video.sortOrder ?? index + 1))}</td>
				<td>
					<div class="dash-videos-table__actions">
						<button type="button" class="dash-videos-table__action" data-videos-edit="${escapeHtml(video.slug)}" ${writeDisabled}>Edit</button>
						<button type="button" class="dash-videos-table__action dash-videos-table__action--danger" data-videos-delete="${escapeHtml(video.slug)}" ${writeDisabled}>Delete</button>
					</div>
				</td>
			</tr>`;
	}

	function cardHtml(video, index, total, canReorder) {
		const writeDisabled = !state.writable ? "disabled" : "";
		const mobileReorder =
			canReorder && state.writable
				? `
			<button type="button" class="dash-videos-reorder__btn" data-reorder="up" ${index === 0 || reorderBusy ? "disabled" : ""} aria-label="Move ${escapeHtml(video.title)} up">↑</button>
			<button type="button" class="dash-videos-reorder__btn" data-reorder="down" ${index === total - 1 || reorderBusy ? "disabled" : ""} aria-label="Move ${escapeHtml(video.title)} down">↓</button>`
				: "";
		return `
			<article class="dash-videos-card" data-slug="${escapeHtml(video.slug)}" ${canReorder ? 'data-reorder-item=""' : ""}>
				${thumbHtml(video, "dash-videos-card__thumb")}
				<div class="dash-videos-card__body">
					<p class="dash-videos-card__title">${escapeHtml(video.title)}</p>
					<p class="dash-videos-card__meta">
						${escapeHtml(categoryLabel(video.category))} · ${escapeHtml(String(video.year))} · ${escapeHtml(formatDuration(video.duration))}${video.featured ? " · Featured" : ""} · ${escapeHtml(providerLabel(video.provider))}
					</p>
					<div class="dash-videos-card__actions">
						<button type="button" class="dash-videos-table__action" data-videos-edit="${escapeHtml(video.slug)}" ${writeDisabled}>Edit</button>
						<button type="button" class="dash-videos-table__action dash-videos-table__action--danger" data-videos-delete="${escapeHtml(video.slug)}" ${writeDisabled}>Delete</button>
						${mobileReorder}
					</div>
				</div>
			</article>`;
	}

	function renderList() {
		if (!els.content) return;
		const visible = filterVideos(state.videos, query);
		const canReorder = reorderAllowed();
		updateCount(visible.length);
		updateReorderHint();
		renderChips();
		syncControlsFromQuery();

		const total = state.videos.length;
		const hasSearch = Boolean(normalizeQuery(query.q));
		const hasFilters =
			query.category !== "all" ||
			query.featured !== "all" ||
			query.provider !== "all";

		if (total === 0) {
			els.content.innerHTML = emptyStateHtml({
				title: "No videos yet",
				detail: "Add a YouTube or Vimeo link to start the catalog.",
				action: state.writable
					? { id: "add", label: "Add video", variant: "primary" }
					: null,
			});
			return;
		}

		if (visible.length === 0 && hasSearch) {
			els.content.innerHTML = emptyStateHtml({
				title: "No videos match your search",
				detail: "Try a different title, slug, or URL fragment.",
				action: { id: "clear-search", label: "Clear search" },
			});
			return;
		}

		if (visible.length === 0 && hasFilters) {
			els.content.innerHTML = emptyStateHtml({
				title: "No videos match these filters",
				detail: "Clear a filter chip or switch category tabs to widen results.",
				action: { id: "clear-filters", label: "Clear filters" },
			});
			return;
		}

		els.content.innerHTML = `
			<div class="dash-videos-table-wrap">
				<table class="dash-videos-table">
					<thead>
						<tr>
							<th class="dash-videos-col--order" scope="col"><span class="visually-hidden">Order</span></th>
							<th class="dash-videos-table__thumb-cell" scope="col"><span class="visually-hidden">Thumbnail</span></th>
							<th scope="col">Title</th>
							<th scope="col">Category</th>
							<th class="dash-videos-col--year" scope="col">Year</th>
							<th class="dash-videos-col--duration" scope="col">Duration</th>
							<th scope="col">Featured</th>
							<th class="dash-videos-col--order" scope="col">#</th>
							<th scope="col"><span class="visually-hidden">Actions</span></th>
						</tr>
					</thead>
					<tbody data-videos-rows>
						${visible.map((video, index) => rowHtml(video, index, visible.length, canReorder)).join("")}
					</tbody>
				</table>
			</div>
			<div class="dash-videos-cards" data-videos-cards>
				${visible.map((video, index) => cardHtml(video, index, visible.length, canReorder)).join("")}
			</div>`;

		setupDragReorder();
	}

	function renderError(message) {
		if (!els.content) return;
		els.content.innerHTML = emptyStateHtml({
			title: "Could not load videos",
			detail: message || "Something went wrong.",
			action: { id: "retry", label: "Retry", variant: "primary" },
		});
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

	function revPayload() {
		return window.DashRevisions?.payload("videos") ?? { rev: 0 };
	}

	function setRevision(rev) {
		const current = window.DashRevisions?.get("videos") ?? {};
		window.DashRevisions?.set("videos", {
			...current,
			rev,
			found: true,
		});
	}

	function reportPublish(publish) {
		const { message } = window.DashPublish.report(publish);
		announce(message);
	}

	function findVideo(slug) {
		return state.videos.find((video) => video.slug === slug) ?? null;
	}

	function upsertVideo(video) {
		const index = state.videos.findIndex((item) => item.slug === video.slug);
		if (index === -1) state.videos.push(video);
		else state.videos[index] = video;
		state.videos = sortVideos(state.videos, "order");
	}

	function removeVideo(slug) {
		state.videos = state.videos.filter((video) => video.slug !== slug);
	}

	function applyCatalogOrder(slugs) {
		const bySlug = new Map(state.videos.map((video) => [video.slug, video]));
		state.videos = slugs.map((slug, index) => ({
			...bySlug.get(slug),
			sortOrder: (index + 1) * 10,
		}));
	}

	function drawerFormHtml(video) {
		const isEdit = Boolean(video);
		const url = video?.url ?? "";
		const category = video?.category ?? "indie";
		const title = video?.title ?? "";
		const year = video?.year ?? "";
		const duration = video?.duration ?? "";
		const featured = Boolean(video?.featured);
		const description = video?.description ?? "";
		return `
			<form class="dash-videos-drawer-form" data-videos-drawer-form novalidate>
				<label>
					<span>Video URL</span>
					<input name="url" type="url" required value="${escapeHtml(url)}" placeholder="https://vimeo.com/… or YouTube" ${isEdit ? "" : ""} />
				</label>
				<label>
					<span>Category</span>
					<select name="category" required>
						<option value="indie" ${category === "indie" ? "selected" : ""}>Indie / Art</option>
						<option value="local" ${category === "local" ? "selected" : ""}>Local Films</option>
						<option value="bts" ${category === "bts" ? "selected" : ""}>BTS &amp; trailers</option>
					</select>
					<span class="dash-videos-drawer-form__hint">Shorts are managed separately.</span>
				</label>
				<label>
					<span>Title${isEdit ? "" : " (optional override)"}</span>
					<input name="title" type="text" value="${escapeHtml(title)}" placeholder="${isEdit ? "" : "Optional — uses provider title when empty"}" ${isEdit ? "required" : ""} />
				</label>
				<label>
					<span>Year${isEdit ? "" : " (required for YouTube)"}</span>
					<input name="year" type="number" min="1900" max="2100" value="${escapeHtml(String(year))}" />
				</label>
				<label>
					<span>Duration seconds${isEdit ? "" : " (required for YouTube)"}</span>
					<input name="duration" type="number" min="1" value="${escapeHtml(String(duration))}" />
				</label>
				<label class="dash-videos-drawer-form__check">
					<input name="featured" type="checkbox" ${featured ? "checked" : ""} />
					<span>Featured</span>
				</label>
				<label>
					<span>Description</span>
					<textarea name="description" rows="4">${escapeHtml(description)}</textarea>
				</label>
				<p class="dash-videos-drawer-form__hint" data-drawer-status hidden></p>
			</form>`;
	}

	function readDrawerForm(form) {
		const data = new FormData(form);
		const url = String(data.get("url") ?? "").trim();
		const category = String(data.get("category") ?? "");
		const title = String(data.get("title") ?? "").trim();
		const yearRaw = String(data.get("year") ?? "").trim();
		const durationRaw = String(data.get("duration") ?? "").trim();
		const description = String(data.get("description") ?? "").trim();
		const featured = data.get("featured") === "on";
		const year = yearRaw === "" ? undefined : Number(yearRaw);
		const duration = durationRaw === "" ? undefined : Number(durationRaw);
		return { url, category, title, year, duration, description, featured };
	}

	function looksLikeYouTube(url) {
		return /youtu\.?be/i.test(url);
	}

	function validateDrawerPayload(payload, mode) {
		if (!payload.url) return "Video URL is required.";
		if (!["indie", "local", "bts"].includes(payload.category)) {
			return "Category must be indie, local, or bts.";
		}
		if (mode === "edit" && !payload.title) return "Title is required.";
		if (mode === "create" && looksLikeYouTube(payload.url)) {
			if (payload.year == null || Number.isNaN(payload.year)) {
				return "Year is required for YouTube videos.";
			}
			if (payload.duration == null || Number.isNaN(payload.duration) || payload.duration < 1) {
				return "Duration (seconds) is required for YouTube videos.";
			}
		}
		if (payload.year != null && (payload.year < 1900 || payload.year > 2100)) {
			return "Year must be between 1900 and 2100.";
		}
		if (
			payload.duration != null &&
			(Number.isNaN(payload.duration) || payload.duration < 1)
		) {
			return "Duration must be a positive number of seconds.";
		}
		return null;
	}

	function setDrawerStatus(form, message, isError) {
		const status = form.querySelector("[data-drawer-status]");
		if (!status) return;
		status.hidden = !message;
		status.textContent = message ?? "";
		status.style.color = isError ? "var(--dash-danger, #f87171)" : "";
	}

	function openEditor(video) {
		drawerContext = video
			? { mode: "edit", slug: video.slug }
			: { mode: "create" };
		const layer = window.DashOverlays.drawer({
			title: video ? "Edit video" : "Add video",
			body: drawerFormHtml(video),
			side: "right",
			actions: [
				{ label: "Cancel", variant: "secondary", role: "close" },
				{
					label: "Save",
					variant: "primary",
					onClick() {
						const form = layer.panel.querySelector(
							"[data-videos-drawer-form]",
						);
						if (!(form instanceof HTMLFormElement)) return false;
						void saveDrawer(form, layer);
						return false;
					},
				},
			],
		});
		const form = layer.panel.querySelector("[data-videos-drawer-form]");
		form?.querySelector("input[name='url']")?.focus();
	}

	async function saveDrawer(form, layer) {
		const mode = drawerContext?.mode ?? "create";
		const slug = drawerContext?.slug;
		const payload = readDrawerForm(form);
		const validationError = validateDrawerPayload(payload, mode);
		if (validationError) {
			setDrawerStatus(form, validationError, true);
			return;
		}

		const body =
			mode === "create"
				? {
						...payload,
						title: payload.title || undefined,
						description: payload.description || undefined,
						...revPayload(),
					}
				: {
						slug,
						...payload,
						title: payload.title,
						description: payload.description || undefined,
						...revPayload(),
					};

		setDrawerStatus(form, "Saving…", false);
		const saveBtn = layer.panel.querySelector(
			'[data-dash-action][class*="primary"]',
		);
		if (saveBtn instanceof HTMLButtonElement) saveBtn.disabled = true;

		try {
			const response = await fetch("/api/videos", {
				method: mode === "create" ? "POST" : "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
			const result = await readJson(response);

			if (response.status === 409) {
				setDrawerStatus(form, "", false);
				if (saveBtn instanceof HTMLButtonElement) saveBtn.disabled = false;
				layer.close();
				showConflict({
					message:
						result.error ??
						"The catalog changed since you loaded this page.",
					pendingSlug: slug,
					reopenMode: mode,
				});
				return;
			}

			if (!response.ok) {
				setDrawerStatus(
					form,
					result.error ?? "Could not save video.",
					true,
				);
				if (saveBtn instanceof HTMLButtonElement) saveBtn.disabled = false;
				return;
			}

			if (typeof result.rev === "number") setRevision(result.rev);
			if (result.video) upsertVideo(result.video);
			reportPublish(result.publish);
			layer.close();
			drawerContext = null;
			renderList();
			announce(
				mode === "create"
					? `Added ${result.video?.title ?? "video"}`
					: `Updated ${result.video?.title ?? "video"}`,
			);
		} catch {
			setDrawerStatus(form, "Network error — try again.", true);
			if (saveBtn instanceof HTMLButtonElement) saveBtn.disabled = false;
		}
	}

	function showConflict({ message, pendingSlug, reopenMode }) {
		window.DashOverlays.dialog({
			title: "Catalog changed",
			body: `
				<div class="dash-videos-conflict">
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
					label: "Reload latest",
					variant: "primary",
					onClick() {
						void reloadLatest({ pendingSlug, reopenMode });
					},
				},
			],
		});
	}

	async function reloadLatest({ pendingSlug, reopenMode } = {}) {
		try {
			const response = await fetch("/api/videos");
			const result = await readJson(response);
			if (!response.ok) {
				window.DashToast?.show({
					message: result.error ?? "Could not reload catalog.",
					tone: "danger",
				});
				return;
			}
			state.videos = sortVideos(result.videos ?? [], "order");
			if (typeof result.rev === "number") setRevision(result.rev);
			if (typeof result.writable === "boolean") {
				state.writable = result.writable;
			}
			renderList();
			announce("Loaded latest catalog");
			window.DashToast?.show({
				message: "Loaded latest catalog",
				tone: "info",
			});

			if (reopenMode === "edit" && pendingSlug) {
				const fresh = findVideo(pendingSlug);
				if (fresh) openEditor(fresh);
				else {
					window.DashToast?.show({
						message: "That video is no longer in the catalog.",
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

	async function deleteVideo(slug) {
		const video = findVideo(slug);
		if (!video) return;
		const confirmed = await window.DashOverlays.confirm({
			title: "Delete video",
			message: `Remove “${video.title}” from the site catalog? This cannot be undone from the dashboard.`,
			confirmLabel: "Delete",
			cancelLabel: "Cancel",
			destructive: true,
		});
		if (!confirmed) return;

		const rev = revPayload();
		const response = await fetch(
			`/api/videos?slug=${encodeURIComponent(slug)}`,
			{
				method: "DELETE",
				headers: {
					"If-Match": String(rev.rev ?? 0),
				},
			},
		);
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
				message: result.error ?? "Could not delete.",
				tone: "danger",
			});
			return;
		}

		if (typeof result.rev === "number") setRevision(result.rev);
		removeVideo(slug);
		reportPublish(result.publish);
		renderList();
		announce(`Deleted ${video.title}`);
	}

	async function persistReorder(slugs, announcement) {
		if (reorderBusy || !state.writable) return;
		reorderBusy = true;
		renderList();
		try {
			const response = await fetch("/api/videos", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					action: "reorder",
					slugs,
					...revPayload(),
				}),
			});
			const result = await readJson(response);

			if (response.status === 409) {
				reorderBusy = false;
				renderList();
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
				reorderBusy = false;
				return;
			}

			if (typeof result.rev === "number") setRevision(result.rev);
			applyCatalogOrder(slugs);
			reportPublish(result.publish);
			if (announcement) announce(announcement);
		} catch {
			window.DashToast?.show({
				message: "Network error while reordering.",
				tone: "danger",
			});
			await reloadLatest();
		} finally {
			reorderBusy = false;
			renderList();
		}
	}

	function currentOrderedSlugs() {
		return sortVideos(state.videos, "order").map((video) => video.slug);
	}

	function moveSlug(slugs, slug, action) {
		const index = slugs.indexOf(slug);
		if (index === -1) return slugs;
		const next = slugs.slice();
		next.splice(index, 1);
		if (action === "up") next.splice(Math.max(0, index - 1), 0, slug);
		else if (action === "down")
			next.splice(Math.min(next.length, index + 1), 0, slug);
		else if (action === "top") next.unshift(slug);
		else if (action === "bottom") next.push(slug);
		return next;
	}

	function handleKeyboardReorder(slug, action) {
		if (!reorderAllowed() || !state.writable || reorderBusy) return;
		const before = currentOrderedSlugs();
		const after = moveSlug(before, slug, action);
		if (before.join("\0") === after.join("\0")) return;
		const video = findVideo(slug);
		const labels = {
			up: "up",
			down: "down",
			top: "to the top",
			bottom: "to the bottom",
		};
		void persistReorder(
			after,
			`Moved ${video?.title ?? "video"} ${labels[action] ?? ""}`,
		);
	}

	function setupDragReorder() {
		const list = els.content?.querySelector("[data-videos-rows]");
		if (!list || !reorderAllowed() || !state.writable) return;

		list.addEventListener("dragstart", onDragStart);
		list.addEventListener("dragend", onDragEnd);
		list.addEventListener("dragover", onDragOver);
		list.addEventListener("drop", onDrop);
	}

	function onDragStart(event) {
		if (!reorderAllowed() || reorderBusy) return;
		const target = event.target;
		if (!(target instanceof Element)) return;
		const handle = target.closest("[data-drag-handle]");
		const list = els.content?.querySelector("[data-videos-rows]");
		if (!handle || !list?.contains(handle)) return;
		const item = handle.closest("[data-reorder-item]");
		if (!(item instanceof HTMLElement)) return;
		dragEl = item;
		item.classList.add("is-dragging");
		event.dataTransfer?.setData("text/plain", item.dataset.slug ?? "");
		if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
	}

	function onDragEnd() {
		dragEl?.classList.remove("is-dragging");
		els.content
			?.querySelectorAll(".is-drop-target")
			.forEach((el) => el.classList.remove("is-drop-target"));
		dragEl = null;
	}

	function onDragOver(event) {
		if (!dragEl || !reorderAllowed()) return;
		event.preventDefault();
		const list = els.content?.querySelector("[data-videos-rows]");
		if (!list) return;
		const target = event.target;
		if (!(target instanceof Element)) return;
		const over = target.closest("[data-reorder-item]");
		if (!(over instanceof HTMLElement) || over === dragEl || !list.contains(over))
			return;
		list
			.querySelectorAll(".is-drop-target")
			.forEach((el) => el.classList.remove("is-drop-target"));
		over.classList.add("is-drop-target");
		const rect = over.getBoundingClientRect();
		const before = event.clientY < rect.top + rect.height / 2;
		if (before) list.insertBefore(dragEl, over);
		else list.insertBefore(dragEl, over.nextSibling);
	}

	function onDrop(event) {
		event.preventDefault();
		if (!dragEl || !reorderAllowed()) return;
		const list = els.content?.querySelector("[data-videos-rows]");
		list
			?.querySelectorAll(".is-drop-target")
			.forEach((el) => el.classList.remove("is-drop-target"));
		const slugs = [
			...(list?.querySelectorAll("[data-reorder-item]") ?? []),
		]
			.map((el) => el.dataset.slug)
			.filter(Boolean);
		void persistReorder(slugs, "Catalog order updated");
	}

	function clearFilters() {
		query.category = "all";
		query.featured = "all";
		query.provider = "all";
		syncUrl();
		renderList();
	}

	function clearSearch() {
		query.q = "";
		if (els.search) els.search.value = "";
		syncUrl();
		renderList();
	}

	function applyQueryChange(partial, { debounceSearch = false } = {}) {
		query = { ...query, ...partial };
		if (debounceSearch) {
			if (searchTimer) clearTimeout(searchTimer);
			searchTimer = setTimeout(() => {
				syncUrl();
				renderList();
			}, SEARCH_DEBOUNCE_MS);
			return;
		}
		syncUrl();
		renderList();
	}

	function bindEvents() {
		els.search?.addEventListener("input", () => {
			applyQueryChange(
				{ q: els.search?.value ?? "" },
				{ debounceSearch: true },
			);
		});

		els.sort?.addEventListener("change", () => {
			applyQueryChange({ sort: els.sort?.value ?? "order" });
		});

		els.featured?.addEventListener("change", () => {
			applyQueryChange({ featured: els.featured?.value ?? "all" });
		});

		els.provider?.addEventListener("change", () => {
			applyQueryChange({ provider: els.provider?.value ?? "all" });
		});

		ROOT.addEventListener("click", (event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;

			const addBtn = target.closest("[data-videos-add]");
			if (addBtn) {
				if (!state.writable) return;
				openEditor(null);
				return;
			}

			const categoryTab = target.closest("[data-videos-category]");
			if (categoryTab) {
				applyQueryChange({
					category: categoryTab.getAttribute("data-videos-category") ?? "all",
				});
				return;
			}

			const chipRemove = target.closest("[data-videos-chip-remove]");
			if (chipRemove) {
				const key = chipRemove.getAttribute("data-videos-chip-remove");
				if (key === "category") applyQueryChange({ category: "all" });
				else if (key === "featured") applyQueryChange({ featured: "all" });
				else if (key === "provider") applyQueryChange({ provider: "all" });
				return;
			}

			if (target.closest("[data-videos-clear-filters]")) {
				clearFilters();
				return;
			}

			if (target.closest("[data-videos-clear-search]")) {
				clearSearch();
				return;
			}

			const emptyAction = target.closest("[data-empty-action]");
			if (emptyAction) {
				const id = emptyAction.getAttribute("data-empty-action");
				if (id === "add") openEditor(null);
				else if (id === "clear-search") clearSearch();
				else if (id === "clear-filters") clearFilters();
				else if (id === "retry") void reloadLatest();
				return;
			}

			const editBtn = target.closest("[data-videos-edit]");
			if (editBtn) {
				const slug = editBtn.getAttribute("data-videos-edit");
				const video = slug ? findVideo(slug) : null;
				if (video) openEditor(video);
				return;
			}

			const deleteBtn = target.closest("[data-videos-delete]");
			if (deleteBtn) {
				const slug = deleteBtn.getAttribute("data-videos-delete");
				if (slug) void deleteVideo(slug);
				return;
			}

			const reorderBtn = target.closest("[data-reorder]");
			if (reorderBtn) {
				const action = reorderBtn.getAttribute("data-reorder");
				const row = reorderBtn.closest("[data-slug]");
				const slug = row?.getAttribute("data-slug");
				if (slug && action) handleKeyboardReorder(slug, action);
			}
		});

		window.addEventListener("popstate", () => {
			query = parseUrlQuery();
			renderList();
		});
	}

	function hydrate() {
		const node = document.getElementById("dash-videos-bootstrap");
		if (!node?.textContent) {
			renderError("Missing videos bootstrap data.");
			return;
		}
		try {
			const data = JSON.parse(node.textContent);
			state.videos = sortVideos(data.videos ?? [], "order");
			state.writable = Boolean(data.writable);
		} catch {
			renderError("Could not parse videos bootstrap data.");
			return;
		}
		query = parseUrlQuery();
		bindEvents();
		renderList();
	}

	hydrate();
})();
