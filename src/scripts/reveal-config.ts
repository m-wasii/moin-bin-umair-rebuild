/**
 * Shared scroll-reveal geometry.
 *
 * Proof (fast manual scroll instrumentation): single-frame deltas reached
 * ~3.4× viewport height, and content already in the viewport still had
 * opacity:0 / translate because IntersectionObserver used a conservative
 * bottom-only inset (`0px 0px -8% 0px`). Prefetch must exceed that jump.
 */
export const revealConfig = {
	/**
	 * Symmetric prefetch band so reveals start before content enters view.
	 * 250% ≈ 2.5 viewports each side — covers measured multi-viewport jumps
	 * when combined with the rAF safety buffer below.
	 */
	rootMargin: "250% 0px 250% 0px",
	/** Any intersection with the expanded root is enough to arm the reveal. */
	threshold: 0,
	/**
	 * Extra document-Y padding (in viewport heights) for the rAF safety pass.
	 * Slightly larger than the IO margin so a late observer callback cannot
	 * leave in-flight content visually hidden.
	 */
	safetyBufferVh: 3,
} as const;

export type RevealConfig = typeof revealConfig;
