import { revealConfig } from "./reveal-config";

/**
 * Central timing for site-wide text writing / reveal animations.
 * Adjust here to tune feel across the whole site.
 */
export const textRevealConfig = {
	/** Short headings / brief copy total reveal window */
	durationShortMs: 550,
	/** Longer paragraphs total reveal window */
	durationLongMs: 950,
	/** Character count at/above which long duration + mask mode are preferred */
	longTextChars: 56,
	/** Stagger between words (headings / short copy) */
	wordStaggerMs: 42,
	/** Cap on word-stagger chain so long headings stay snappy */
	maxWordStaggerTotalMs: 420,
	/**
	 * Prefetch geometry shared with `[data-reveal]` so text writing starts
	 * before the host reaches the viewport during fast scroll.
	 */
	rootMargin: revealConfig.rootMargin,
	threshold: revealConfig.threshold,
	/** Soft easing for clip reveals */
	easing: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

export type TextRevealConfig = typeof textRevealConfig;
