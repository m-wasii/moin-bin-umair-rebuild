// @ts-check
import { defineConfig } from "astro/config";

const nodeEnv =
	/** @type {{ env?: Record<string, string | undefined> } | undefined} */ (
		/** @type {any} */ (globalThis).process
	)?.env;

const site = nodeEnv?.SITE || nodeEnv?.CF_PAGES_URL;

// https://astro.build/config
export default defineConfig({
	site,
});
