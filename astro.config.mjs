// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

// Canonical host for hreflang/OG. Prefer SITE / CF_PAGES_URL; fall back to
// production domain from .env.example (Workers preview often leaves SITE unset).
const site =
	process.env.SITE || process.env.CF_PAGES_URL || "https://moinbinumair.com";

export default defineConfig({
	site,
	adapter: cloudflare({
		imageService: "compile",
	}),
	session: false,
	i18n: {
		defaultLocale: "en",
		locales: ["en", "de"],
		routing: {
			prefixDefaultLocale: false,
		},
	},
	vite: {
		server: {
			watch: {
				ignored: ["**/.data/**"],
			},
		},
	},
});
