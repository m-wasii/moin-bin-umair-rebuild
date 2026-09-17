/**
 * Shared focus trap + escape handling for dashboard overlays.
 * Lightweight — no framework dependency.
 */
(function () {
	const FOCUSABLE =
		'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

	function focusableWithin(root) {
		return [...root.querySelectorAll(FOCUSABLE)].filter(
			(el) =>
				el instanceof HTMLElement &&
				!el.hasAttribute("disabled") &&
				el.getAttribute("aria-hidden") !== "true" &&
				el.tabIndex !== -1,
		);
	}

	function trapFocus(event, root) {
		if (event.key !== "Tab") return;
		const nodes = focusableWithin(root);
		if (!nodes.length) {
			event.preventDefault();
			return;
		}
		const first = nodes[0];
		const last = nodes[nodes.length - 1];
		const active = document.activeElement;
		if (event.shiftKey && active === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && active === last) {
			event.preventDefault();
			first.focus();
		}
	}

	window.DashFocus = {
		FOCUSABLE,
		focusableWithin,
		trapFocus,
		lockScroll() {
			document.documentElement.dataset.dashOverlayOpen = "true";
		},
		unlockScroll() {
			const open = document.querySelectorAll(
				"[data-dash-overlay][data-open='true']",
			).length;
			if (!open) delete document.documentElement.dataset.dashOverlayOpen;
		},
	};
})();
