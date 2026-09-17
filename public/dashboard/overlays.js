/**
 * Overlay foundations: dialog, confirm, drawer, inspector.
 * Content editors are intentionally not included in Phase 3A.
 */
(function () {
	function ensureHosts() {
		let dialogHost = document.getElementById("dash-dialog-host");
		let drawerHost = document.getElementById("dash-drawer-host");
		let inspectorHost = document.getElementById("dash-inspector-host");

		if (!dialogHost) {
			dialogHost = document.createElement("div");
			dialogHost.id = "dash-dialog-host";
			document.body.appendChild(dialogHost);
		}
		if (!drawerHost) {
			drawerHost = document.createElement("div");
			drawerHost.id = "dash-drawer-host";
			document.body.appendChild(drawerHost);
		}
		if (!inspectorHost) {
			inspectorHost = document.createElement("div");
			inspectorHost.id = "dash-inspector-host";
			document.body.appendChild(inspectorHost);
		}
		return { dialogHost, drawerHost, inspectorHost };
	}

	function createBackdrop(onClick) {
		const backdrop = document.createElement("div");
		backdrop.className = "dash-overlay-backdrop";
		backdrop.dataset.dashOverlay = "backdrop";
		backdrop.addEventListener("click", onClick);
		return backdrop;
	}

	function bindEscapeAndTrap(root, onClose) {
		function onKey(event) {
			if (event.key === "Escape") {
				event.preventDefault();
				onClose();
				return;
			}
			window.DashFocus?.trapFocus(event, root);
		}
		root.addEventListener("keydown", onKey);
		return () => root.removeEventListener("keydown", onKey);
	}

	function openLayer({
		host,
		panelClass,
		labelledBy,
		label,
		bodyHtml,
		role,
		side,
	}) {
		const previousFocus = document.activeElement;
		const backdrop = createBackdrop(() => api.close());
		const panel = document.createElement("div");
		panel.className = panelClass;
		panel.dataset.dashOverlay = "true";
		panel.dataset.open = "true";
		if (side) panel.dataset.side = side;
		panel.setAttribute("role", role);
		panel.setAttribute("aria-modal", "true");
		if (labelledBy) panel.setAttribute("aria-labelledby", labelledBy);
		else if (label) panel.setAttribute("aria-label", label);
		panel.innerHTML = bodyHtml;

		host.replaceChildren(backdrop, panel);
		window.DashFocus?.lockScroll();

		const unbind = bindEscapeAndTrap(panel, () => api.close());
		const first = window.DashFocus?.focusableWithin(panel)?.[0];
		first?.focus();

		const api = {
			panel,
			close() {
				unbind();
				host.replaceChildren();
				window.DashFocus?.unlockScroll();
				if (previousFocus instanceof HTMLElement) previousFocus.focus();
			},
		};
		return api;
	}

	function renderActionButtons(actions) {
		return (actions ?? [])
			.map((action, index) => {
				const variant = action.variant ?? "secondary";
				const attr = action.role === "close" ? "data-dash-close" : `data-dash-action="${index}"`;
				return `<button type="button" class="dash-btn dash-btn--${variant}" ${attr}>${escapeHtml(action.label)}</button>`;
			})
			.join("");
	}

	function bindOverlayActions(layer, actions) {
		layer.panel.querySelectorAll("[data-dash-close]").forEach((btn) => {
			btn.addEventListener("click", () => layer.close());
		});
		layer.panel.querySelectorAll("[data-dash-action]").forEach((btn) => {
			btn.addEventListener("click", () => {
				const index = Number(btn.getAttribute("data-dash-action"));
				const action = actions?.[index];
				const result = action?.onClick?.();
				if (result !== false) layer.close();
			});
		});
	}

	function dialog({ title, body, actions }) {
		const { dialogHost } = ensureHosts();
		const titleId = `dash-dialog-title-${Date.now()}`;
		const actionHtml = renderActionButtons(actions);

		const layer = openLayer({
			host: dialogHost,
			panelClass: "dash-dialog",
			labelledBy: titleId,
			role: "dialog",
			bodyHtml: `
				<header class="dash-dialog__header">
					<h2 id="${titleId}" class="dash-dialog__title">${escapeHtml(title)}</h2>
					<button type="button" class="dash-icon-btn" data-dash-close aria-label="Close">×</button>
				</header>
				<div class="dash-dialog__body">${body ?? ""}</div>
				${actionHtml ? `<footer class="dash-dialog__footer">${actionHtml}</footer>` : ""}
			`,
		});

		bindOverlayActions(layer, actions);
		return layer;
	}

	function confirm({
		title,
		message,
		confirmLabel = "Confirm",
		cancelLabel = "Cancel",
		destructive = false,
	}) {
		return new Promise((resolve) => {
			let settled = false;
			function finish(value) {
				if (settled) return;
				settled = true;
				resolve(value);
			}
			const layer = dialog({
				title,
				body: `<p class="dash-dialog__message">${escapeHtml(message)}</p>`,
				actions: [
					{
						label: cancelLabel,
						variant: "secondary",
						onClick() {
							finish(false);
						},
					},
					{
						label: confirmLabel,
						variant: destructive ? "danger" : "primary",
						onClick() {
							finish(true);
						},
					},
				],
			});
			const originalClose = layer.close.bind(layer);
			layer.close = () => {
				finish(false);
				originalClose();
			};
			layer.panel.querySelectorAll("[data-dash-close]").forEach((btn) => {
				btn.addEventListener("click", () => finish(false));
			});
		});
	}

	/**
	 * Side drawer overlay.
	 * @param {object} options
	 * @param {string} options.title
	 * @param {string} [options.body]
	 * @param {"left"|"right"} [options.side]
	 * @param {string} [options.footer] Optional raw HTML inside dash-drawer__footer
	 * @param {Array<{label: string, variant?: string, role?: string, onClick?: Function}>} [options.actions]
	 *        Same shape as dialog actions; rendered as buttons in the footer (after footer HTML).
	 *        Use role: "close" for Cancel so Escape/X/Cancel stay accessible.
	 */
	function drawer({ title, body, side = "right", footer, actions }) {
		const { drawerHost } = ensureHosts();
		const titleId = `dash-drawer-title-${Date.now()}`;
		const actionHtml = renderActionButtons(actions);
		const footerInner = `${footer ?? ""}${actionHtml}`;
		const footerHtml = footerInner
			? `<footer class="dash-drawer__footer">${footerInner}</footer>`
			: "";

		const layer = openLayer({
			host: drawerHost,
			panelClass: "dash-drawer",
			labelledBy: titleId,
			role: "dialog",
			side,
			bodyHtml: `
				<header class="dash-drawer__header">
					<h2 id="${titleId}" class="dash-drawer__title">${escapeHtml(title)}</h2>
					<button type="button" class="dash-icon-btn" data-dash-close aria-label="Close">×</button>
				</header>
				<div class="dash-drawer__body">${body ?? ""}</div>
				${footerHtml}
			`,
		});

		bindOverlayActions(layer, actions);
		return layer;
	}

	function inspector({ title, body }) {
		const { inspectorHost } = ensureHosts();
		const titleId = `dash-inspector-title-${Date.now()}`;
		const layer = openLayer({
			host: inspectorHost,
			panelClass: "dash-inspector",
			labelledBy: titleId,
			role: "complementary",
			side: "right",
			bodyHtml: `
				<header class="dash-inspector__header">
					<h2 id="${titleId}" class="dash-inspector__title">${escapeHtml(title)}</h2>
					<button type="button" class="dash-icon-btn" data-dash-close aria-label="Close">×</button>
				</header>
				<div class="dash-inspector__body">${body ?? ""}</div>
			`,
		});
		layer.panel.querySelectorAll("[data-dash-close]").forEach((btn) => {
			btn.addEventListener("click", () => layer.close());
		});
		return layer;
	}

	function escapeHtml(value) {
		return String(value)
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;")
			.replaceAll(">", "&gt;")
			.replaceAll('"', "&quot;");
	}

	window.DashOverlays = { dialog, confirm, drawer, inspector };
})();
