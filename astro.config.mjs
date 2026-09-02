// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

const site = process.env.SITE;

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
});
