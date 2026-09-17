/**
 * Mobile sidebar sheet + shell chrome behavior.
 */
(function () {
	const toggle = document.querySelector("[data-dash-nav-toggle]");
	const sheet = document.querySelector("[data-dash-nav-sheet]");
	const backdrop = document.querySelector("[data-dash-nav-backdrop]");
	const closeBtn = document.querySelector("[data-dash-nav-close]");
	if (!toggle || !sheet) return;

	if (!sheet.id) sheet.id = "dash-nav-sheet";
	toggle.setAttribute("aria-controls", sheet.id);

	let lastFocus = null;

	function isOpen() {
		return sheet.dataset.open === "true";
	}

	function setOpen(next) {
		sheet.dataset.open = next ? "true" : "false";
		sheet.setAttribute("aria-hidden", next ? "false" : "true");
		toggle.setAttribute("aria-expanded", next ? "true" : "false");
		if (backdrop) {
			backdrop.dataset.open = next ? "true" : "false";
			backdrop.hidden = !next;
		}
		if (next) {
			lastFocus = document.activeElement;
			window.DashFocus?.lockScroll();
			const first = window.DashFocus?.focusableWithin(sheet)?.[0];
			first?.focus();
		} else {
			window.DashFocus?.unlockScroll();
			if (lastFocus instanceof HTMLElement) lastFocus.focus();
			else toggle.focus();
		}
	}

	toggle.addEventListener("click", () => setOpen(!isOpen()));
	backdrop?.addEventListener("click", () => setOpen(false));
	closeBtn?.addEventListener("click", () => setOpen(false));

	sheet.addEventListener("keydown", (event) => {
		if (!isOpen()) return;
		if (event.key === "Escape") {
			event.preventDefault();
			setOpen(false);
			return;
		}
		window.DashFocus?.trapFocus(event, sheet);
	});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && isOpen()) setOpen(false);
	});

	window.matchMedia("(min-width: 1024px)").addEventListener("change", (mq) => {
		if (mq.matches && isOpen()) setOpen(false);
	});
})();
