/**
 * Toast feedback primitive.
 * Usage: DashToast.show({ message, tone?, timeoutMs? })
 */
(function () {
	const ROOT_ID = "dash-toast-root";

	function ensureRoot() {
		let root = document.getElementById(ROOT_ID);
		if (root) return root;
		root = document.createElement("div");
		root.id = ROOT_ID;
		root.className = "dash-toast-root";
		root.setAttribute("aria-live", "polite");
		root.setAttribute("aria-relevant", "additions");
		document.body.appendChild(root);
		return root;
	}

	function show(options) {
		const message = options?.message ?? "";
		if (!message) return null;
		const tone = options.tone ?? "neutral";
		const timeoutMs = options.timeoutMs ?? 4200;
		const root = ensureRoot();
		const el = document.createElement("div");
		el.className = `dash-toast dash-toast--${tone}`;
		el.setAttribute("role", tone === "danger" ? "alert" : "status");
		el.innerHTML = `<p class="dash-toast__message"></p><button type="button" class="dash-toast__close" aria-label="Dismiss">×</button>`;
		el.querySelector(".dash-toast__message").textContent = message;
		const close = () => {
			el.dataset.leaving = "true";
			window.setTimeout(() => el.remove(), 180);
		};
		el.querySelector(".dash-toast__close")?.addEventListener("click", close);
		root.appendChild(el);
		if (timeoutMs > 0) window.setTimeout(close, timeoutMs);
		return { dismiss: close };
	}

	window.DashToast = { show };
})();
