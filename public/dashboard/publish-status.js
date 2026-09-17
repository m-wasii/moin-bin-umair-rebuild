/**
 * Shared publish lifecycle UI helpers (Videos / Photography / Shorts / Hero).
 * Mirrors src/lib/dashboard/publish-status.ts — never claim public-live unless
 * the API refresh payload says so.
 */
(() => {
	function escapeHtml(value) {
		return String(value ?? "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	/**
	 * @param {{ refresh?: string, detail?: string } | null | undefined} publish
	 */
	function viewFromApi(publish) {
		const refresh = publish?.refresh;
		const detail = publish?.detail;
		if (refresh === "public-live") {
			return {
				lifecycle: "public-live",
				label: "Public live",
				tone: "success",
				detail,
			};
		}
		if (refresh === "refresh-failed") {
			return {
				lifecycle: "refresh-failed",
				label: "Refresh failed",
				tone: "danger",
				detail,
			};
		}
		return {
			lifecycle: "catalog-saved",
			label: "Catalog saved",
			tone: "info",
			detail: detail === "dev" ? "Dev — public refresh skipped" : detail,
		};
	}

	/**
	 * @param {{ label: string, tone: string, detail?: string, lifecycle?: string }} view
	 */
	function toastMessage(view) {
		if (view.lifecycle === "catalog-saved" && view.detail) {
			return `${view.label} (${view.detail})`;
		}
		if (view.lifecycle === "refresh-failed" && view.detail) {
			return `${view.label}: ${view.detail}`;
		}
		return view.label;
	}

	/**
	 * @param {{ label: string, tone: string, detail?: string }} view
	 */
	function setTopbarStatus(view) {
		const actions = document.querySelector(".dash-topbar__actions");
		if (!actions) return;
		let badge = actions.querySelector(".dash-status");
		if (!badge) {
			badge = document.createElement("span");
			actions.insertBefore(badge, actions.firstChild);
		}
		const text = view.detail ? `${view.label} — ${view.detail}` : view.label;
		badge.className = `dash-status dash-status--${view.tone}`;
		badge.dataset.statusTone = view.tone;
		badge.innerHTML = `<span class="dash-status__dot" aria-hidden="true"></span>${escapeHtml(text)}`;
	}

	/**
	 * @param {{ refresh?: string, detail?: string } | null | undefined} publish
	 * @param {{ toast?: boolean }} [opts]
	 */
	function report(publish, opts = {}) {
		const view = viewFromApi(publish);
		setTopbarStatus(view);
		const message = toastMessage(view);
		const tone =
			view.tone === "danger"
				? "danger"
				: view.tone === "success"
					? "success"
					: view.tone === "warning"
						? "warning"
						: "info";
		if (opts.toast !== false) {
			window.DashToast?.show({ message, tone });
		}
		return { view, message, tone };
	}

	window.DashPublish = {
		viewFromApi,
		toastMessage,
		setTopbarStatus,
		report,
		escapeHtml,
	};
})();
