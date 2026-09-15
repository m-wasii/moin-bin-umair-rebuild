/**
 * Site-wide reduced-motion kill switch.
 * When true, every visitor gets prefers-reduced-motion: reduce behavior
 * (no scroll/text reveals, no smooth scroll, no hero video loop).
 */
export const FORCE_REDUCED_MOTION = true;

const QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
	return FORCE_REDUCED_MOTION || window.matchMedia(QUERY).matches;
}

/** Live MediaQueryList for OS preference change listeners. */
export function reducedMotionMql(): MediaQueryList {
	return window.matchMedia(QUERY);
}
