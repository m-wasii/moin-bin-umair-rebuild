/**
 * Scroll-settling primitives for navigation hash jumps.
 *
 * Owns no mutable navigation state. Callers register listeners/timeouts and
 * abort predicates so interrupted jumps can cancel stale cleanup.
 */

/** Frames with <1px scroll delta before treating motion as settled (no scrollend). */
export const SCROLL_SETTLE_STABLE_FRAMES = 4;

export function supportsNativeScrollEnd() {
	return typeof window.onscrollend !== "undefined";
}

/**
 * Smooth scrolling can settle after the navigation call returns,
 * so destination reveals wait until the viewport is stable.
 */
export function watchScrollUntilStable(
	onStable: () => void,
	options?: { shouldAbort?: () => boolean },
) {
	let lastY = window.scrollY;
	let stableFrames = 0;

	const tick = () => {
		if (options?.shouldAbort?.()) return;

		if (Math.abs(window.scrollY - lastY) < 1) {
			stableFrames += 1;
			if (stableFrames >= SCROLL_SETTLE_STABLE_FRAMES) {
				onStable();
				return;
			}
		} else {
			stableFrames = 0;
			lastY = window.scrollY;
		}

		requestAnimationFrame(tick);
	};

	requestAnimationFrame(tick);
}

export function waitForScrollToSettle(
	onSettle: () => void,
	options?: {
		shouldAbort?: () => boolean;
		shouldIgnoreEvent?: () => boolean;
		timeoutMs?: number;
		registerNativeHandler?: (handler: () => void) => void;
		registerTimeout?: (timeoutId: number) => void;
	},
) {
	const finish = () => {
		if (options?.shouldAbort?.()) return;
		onSettle();
	};

	if (supportsNativeScrollEnd()) {
		const onScrollEnd = () => {
			if (options?.shouldAbort?.()) return;
			if (options?.shouldIgnoreEvent?.()) return;
			finish();
		};
		options?.registerNativeHandler?.(onScrollEnd);
		window.addEventListener(
			"scrollend",
			onScrollEnd,
			options?.timeoutMs == null ? { once: true } : undefined,
		);
	} else {
		watchScrollUntilStable(finish, { shouldAbort: options?.shouldAbort });
	}

	if (options?.timeoutMs != null) {
		const timeoutId = window.setTimeout(finish, options.timeoutMs);
		options.registerTimeout?.(timeoutId);
	}
}
