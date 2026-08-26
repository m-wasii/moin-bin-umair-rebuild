import { config, fields, collection, singleton } from "@keystatic/core";

const repoOwner = import.meta.env.KEYSTATIC_GITHUB_REPO_OWNER ?? "m-wasii";
const repoName =
	import.meta.env.KEYSTATIC_GITHUB_REPO_NAME ?? "moin-bin-umair-rebuild";

// Local filesystem in `astro dev`. GitHub mode on the deployed dashboard
// (requires KEYSTATIC_GITHUB_* secrets + Cloudflare Access for Google login).
const useGithubStorage = import.meta.env.PROD;

export default config({
	storage: useGithubStorage
		? {
				kind: "github",
				repo: `${repoOwner}/${repoName}`,
				branchPrefix: "content/",
			}
		: {
				kind: "local",
			},
	ui: {
		brand: { name: "MBU Videos" },
	},
	singletons: {
		videoSettings: singleton({
			label: "Video settings",
			path: "src/data/video-settings",
			format: { data: "json" },
			schema: {
				vimeoUser: fields.text({
					label: "Vimeo username",
					description:
						"Public Vimeo account used to auto-fill title, year, duration, and thumbnail.",
					defaultValue: "moonshine123",
					validation: { isRequired: true },
				}),
			},
		}),
	},
	collections: {
		videos: collection({
			label: "Videos",
			slugField: "name",
			path: "src/content/videos/*",
			format: { data: "json" },
			schema: {
				name: fields.slug({
					name: {
						label: "Label",
						description:
							"Short name shown in this admin list (not on the site).",
					},
				}),
				url: fields.url({
					label: "Video URL",
					description: "Full Vimeo or YouTube link.",
					validation: { isRequired: true },
				}),
				category: fields.select({
					label: "Category",
					options: [
						{ label: "Commercial", value: "commercial" },
						{ label: "Art & Films", value: "art" },
						{ label: "Shorts (9:16)", value: "shorts" },
					],
					defaultValue: "commercial",
				}),
				title: fields.text({
					label: "Title override",
					description:
						"Optional. Leave blank to use the title from Vimeo/YouTube.",
				}),
				description: fields.text({
					label: "Description",
					description: "Optional about-copy shown in the video dialog.",
					multiline: true,
				}),
				year: fields.integer({
					label: "Year",
					description: "Required for YouTube. Optional for Vimeo (auto-filled).",
				}),
				duration: fields.integer({
					label: "Duration (seconds)",
					description:
						"Required for YouTube unless YOUTUBE_API_KEY is set. Optional for Vimeo.",
				}),
				featured: fields.checkbox({
					label: "Featured",
					defaultValue: false,
				}),
				sortOrder: fields.integer({
					label: "Sort order",
					description: "Lower numbers appear first within each section.",
					defaultValue: 100,
				}),
			},
		}),
	},
});
