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
	 * IntersectionObserver: fire once the element is partly on-screen
	 * (slightly before fully visible). Bottom inset matches existing
	 * `[data-reveal]` scroll choreography.
	 */
	rootMargin: "0px 0px -8% 0px",
	threshold: 0.08,
	/** Soft easing for clip reveals */
	easing: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

export type TextRevealConfig = typeof textRevealConfig;
