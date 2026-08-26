// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import markdoc from "@astrojs/markdoc";
import keystatic from "@keystatic/astro";
import cloudflare from "@astrojs/cloudflare";

const site = process.env.SITE || process.env.CF_PAGES_URL;
// Keystatic's local API is happier on Node. Use the Cloudflare adapter for
// `build` / `preview` / production only (dashboard.domain.com on Workers).
const isDevCommand = process.argv.includes("dev");

// https://astro.build/config
export default defineConfig({
	site,
	adapter: isDevCommand
		? undefined
		: cloudflare({
				imageService: "compile",
			}),
	i18n: {
		defaultLocale: "en",
		locales: ["en", "de"],
		routing: {
			prefixDefaultLocale: false,
		},
	},
	integrations: [react(), markdoc(), keystatic()],
});
