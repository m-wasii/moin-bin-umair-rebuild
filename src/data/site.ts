export const site = {
	name: "Moin Bin Umair",
	shortName: "MBU",
	title: "Moin Bin Umair — Filmmaker",
	description:
		"Commercial work, short films, and visual stories by filmmaker Moin Bin Umair.",
	vimeoUrl: "https://vimeo.com/moonshine123",
	location: "Berlin, Germany",
	email: "hello@example.com",
	instagramUrl: "https://instagram.com/",
	hero: {
		tagline: ["Filmmaker", "Visual storyteller"],
	},
} as const;

export const navigation = [
	{ label: "Home", href: "#home" },
	{ label: "Commercial", href: "#commercial" },
	{ label: "Art & Films", href: "#art" },
	{ label: "Contact", href: "#contact" },
] as const;
