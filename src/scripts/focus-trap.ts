const FOCUSABLE_SELECTOR = [
	"a[href]",
	"area[href]",
	"button:not([disabled])",
	"input:not([disabled]):not([type='hidden'])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"iframe",
	"audio[controls]",
	"video[controls]",
	"[contenteditable]:not([contenteditable='false'])",
	"[tabindex]:not([tabindex='-1'])",
].join(",");

function isFocusable(el: HTMLElement): boolean {
	if (el.closest("[hidden], [inert]")) return false;
	if (el.getAttribute("aria-hidden") === "true") return false;
	if (typeof el.checkVisibility === "function") {
		try {
			return el.checkVisibility({
				checkOpacity: false,
				checkVisibilityCSS: true,
			});
		} catch {
			/* fall through */
		}
	}
	return el.getClientRects().length > 0;
}

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
	return Array.from(
		container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
	).filter(isFocusable);
}

export interface FocusTrap {
	activate(initialFocus?: HTMLElement | null): void;
	deactivate(): void;
	isActive(): boolean;
}

/**
 * Tab/Shift+Tab cycle within `container`. Listener is attached only while active.
 */
export function createFocusTrap(container: HTMLElement): FocusTrap {
	let active = false;

	function ensureContainerTabbable() {
		if (!container.hasAttribute("tabindex")) {
			container.setAttribute("tabindex", "-1");
		}
	}

	function focusInitial(initialFocus?: HTMLElement | null) {
		ensureContainerTabbable();
		const focusables = getFocusableElements(container);
		const preferred =
			initialFocus &&
			container.contains(initialFocus) &&
			isFocusable(initialFocus)
				? initialFocus
				: null;
		const target = preferred ?? focusables[0] ?? container;
		try {
			target.focus({ preventScroll: true });
		} catch {
			/* ignore */
		}
	}

	function onKeyDown(event: KeyboardEvent) {
		if (!active || event.key !== "Tab") return;

		const focusables = getFocusableElements(container);
		if (focusables.length === 0) {
			event.preventDefault();
			ensureContainerTabbable();
			try {
				container.focus({ preventScroll: true });
			} catch {
				/* ignore */
			}
			return;
		}

		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		const current = document.activeElement;

		if (event.shiftKey) {
			if (current === first || !container.contains(current)) {
				event.preventDefault();
				last.focus({ preventScroll: true });
			}
			return;
		}

		if (current === last || !container.contains(current)) {
			event.preventDefault();
			first.focus({ preventScroll: true });
		}
	}

	return {
		activate(initialFocus) {
			if (active) {
				focusInitial(initialFocus);
				return;
			}
			active = true;
			document.addEventListener("keydown", onKeyDown, true);
			focusInitial(initialFocus);
		},
		deactivate() {
			if (!active) return;
			active = false;
			document.removeEventListener("keydown", onKeyDown, true);
		},
		isActive() {
			return active;
		},
	};
}

export function blurIfInside(container: HTMLElement | null | undefined) {
	if (!container) return;
	const activeEl = document.activeElement;
	if (activeEl instanceof HTMLElement && container.contains(activeEl)) {
		activeEl.blur();
	}
}
