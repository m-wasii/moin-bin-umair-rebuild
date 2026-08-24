// @ts-check
import { defineConfig } from "astro/config";

const site = process.env.SITE || process.env.CF_PAGES_URL;

// https://astro.build/config
export default defineConfig({
	site,
});
