export const locales = ["en", "de"] as const;

export type Lang = (typeof locales)[number];

export const defaultLang: Lang = "en";

export const PREFERRED_LANG_KEY = "preferred-lang";

const ui = {
	en: {
		"meta.title": "Moin Bin Umair — Filmmaker",
		"meta.description":
			"Commercial work, short films, and visual stories by filmmaker Moin Bin Umair.",
		"meta.jobTitle": "Filmmaker",
		"a11y.skip": "Skip to selected work",
		"a11y.home": "home",
		"a11y.navToggle": "Toggle navigation",
		"a11y.primaryNav": "Primary navigation",
		"a11y.langSwitch": "Language",
		"nav.home": "Home",
		"nav.commercial": "Commercial",
		"nav.art": "Art & Films",
		"nav.photography": "Photography",
		"nav.shorts": "Shorts",
		"nav.contact": "Contact",
		"hero.tagline": "Filmmaker · Visual storyteller",
		"hero.orbit": "Still · Motion · Story · Still · Motion · Story ·",
		"hero.explore": "Explore the work",
		"section.commercial.title": "Commercial",
		"section.commercial.description":
			"Brand films, campaigns, and behind-the-scenes projects.",
		"section.art.title": "Art & Films",
		"section.art.description": "Narrative films, trailers, and personal work.",
		"section.shorts.title": "Shorts",
		"section.shorts.description": "Campaigns and standalone short-form films.",
		"section.shorts.campaigns": "Campaigns",
		"section.shorts.singles": "Standalone",
		"section.photography.title": "Photography",
		"section.photography.description":
			"Albums from architecture, fashion, street, and set — open one to see the full collection.",
		"section.photography.empty": "Photographs will appear here.",
		"section.meta.vertical": "Vertical",
		"section.meta.project": "project",
		"section.meta.projects": "projects",
		"section.meta.still": "still",
		"section.meta.stills": "stills",
		"section.meta.album": "album",
		"section.meta.albums": "albums",
		"section.meta.campaign": "campaign",
		"section.meta.campaigns": "campaigns",
		"section.meta.short": "short",
		"section.meta.shorts": "shorts",
		"photo.album.kicker": "Album",
		"photo.album.open": "Open {title} album",
		"photo.album.back": "All albums",
		"photo.album.count": "{count} photographs",
		"section.shorts.empty": "Shorts will appear here.",
		"shorts.clipCount": "{count} clips",
		"shorts.playAria": "Play {title}",
		"shorts.clipOf": "{current} / {total}",
		"photo.category.architecture": "Architecture",
		"photo.category.behind-the-scenes": "Behind the scenes",
		"photo.category.portraits-fashion": "Portraits & fashion",
		"photo.category.fashion-lookbook": "Fashion lookbook",
		"photo.category.events-wedding": "Events & wedding",
		"photo.category.street-photography": "Street",
		"photo.category.film-portraits-trieste": "Trieste",
		"photo.prev": "Previous",
		"photo.next": "Next",
		"contact.meta": "Enquiries",
		"contact.titleHtml": "Let’s make something<br />worth watching.",
		"contact.description":
			"Commercial films, narrative projects, and creative collaborations.",
		"contact.email": "Email",
		"contact.phone": "Phone",
		"contact.whatsapp": "WhatsApp",
		"contact.instagram": "Instagram",
		"contact.linkedin": "LinkedIn",
		"contact.vimeo": "Vimeo",
		"contact.getInTouch": "Get in touch",
		"contact.followAlong": "Follow along",
		"contact.backToTop": "Back to top ↑",
		"card.play": "Play",
		"card.playAria": "Play {title} on {host}",
		"card.stillAlt": "Still from {title}",
		"dialog.projectFilm": "Project film",
		"dialog.about": "About",
		"dialog.close": "Close",
		"dialog.aboutLabel": "About this film",
		"dialog.openVimeo": "Open on Vimeo",
		"dialog.openYoutube": "Open on YouTube",
		"dialog.noDescription": "No description available for this film yet.",
		"lang.en": "EN",
		"lang.de": "DE",
	},
	de: {
		"meta.title": "Moin Bin Umair — Filmemacher",
		"meta.description":
			"Werbefilme, Kurzfilme und visuelle Geschichten von Filmemacher Moin Bin Umair.",
		"meta.jobTitle": "Filmemacher",
		"a11y.skip": "Zur ausgewählten Arbeit springen",
		"a11y.home": "Start",
		"a11y.navToggle": "Navigation umschalten",
		"a11y.primaryNav": "Hauptnavigation",
		"a11y.langSwitch": "Sprache",
		"nav.home": "Home",
		"nav.commercial": "Werbung",
		"nav.art": "Kunst & Filme",
		"nav.photography": "Fotografie",
		"nav.shorts": "Shorts",
		"nav.contact": "Kontakt",
		"hero.tagline": "Filmemacher · Visueller Geschichtenerzähler",
		"hero.orbit": "Bild · Bewegung · Geschichte · Bild · Bewegung · Geschichte ·",
		"hero.explore": "Arbeit entdecken",
		"section.commercial.title": "Werbung",
		"section.commercial.description":
			"Markenfilme, Kampagnen und Behind-the-Scenes-Projekte.",
		"section.art.title": "Kunst & Filme",
		"section.art.description": "Spielfilme, Trailer und persönliche Arbeiten.",
		"section.shorts.title": "Shorts",
		"section.shorts.description": "Kampagnen und eigenständige Kurzfilme.",
		"section.shorts.campaigns": "Kampagnen",
		"section.shorts.singles": "Einzelstücke",
		"section.photography.title": "Fotografie",
		"section.photography.description":
			"Alben aus Architektur, Mode, Street und Set — eines öffnen, um die ganze Serie zu sehen.",
		"section.photography.empty": "Fotografien erscheinen hier.",
		"section.meta.vertical": "Vertikal",
		"section.meta.project": "Projekt",
		"section.meta.projects": "Projekte",
		"section.meta.still": "Still",
		"section.meta.stills": "Stills",
		"section.meta.album": "Album",
		"section.meta.albums": "Alben",
		"section.meta.campaign": "Kampagne",
		"section.meta.campaigns": "Kampagnen",
		"section.meta.short": "Short",
		"section.meta.shorts": "Shorts",
		"photo.album.kicker": "Album",
		"photo.album.open": "Album {title} öffnen",
		"photo.album.back": "Alle Alben",
		"photo.album.count": "{count} Fotografien",
		"section.shorts.empty": "Shorts erscheinen hier.",
		"shorts.clipCount": "{count} Clips",
		"shorts.playAria": "{title} abspielen",
		"shorts.clipOf": "{current} / {total}",
		"photo.category.architecture": "Architektur",
		"photo.category.behind-the-scenes": "Making-of",
		"photo.category.portraits-fashion": "Porträts & Mode",
		"photo.category.fashion-lookbook": "Fashion-Lookbook",
		"photo.category.events-wedding": "Events & Hochzeit",
		"photo.category.street-photography": "Street",
		"photo.category.film-portraits-trieste": "Triest",
		"photo.prev": "Zurück",
		"photo.next": "Weiter",
		"contact.meta": "Anfragen",
		"contact.titleHtml":
			"Lass uns etwas machen,<br />das man sehen will.",
		"contact.description":
			"Werbefilme, narrative Projekte und kreative Zusammenarbeiten.",
		"contact.email": "E-Mail",
		"contact.phone": "Telefon",
		"contact.whatsapp": "WhatsApp",
		"contact.instagram": "Instagram",
		"contact.linkedin": "LinkedIn",
		"contact.vimeo": "Vimeo",
		"contact.getInTouch": "Kontakt aufnehmen",
		"contact.followAlong": "Folgen",
		"contact.backToTop": "Nach oben ↑",
		"card.play": "Abspielen",
		"card.playAria": "{title} auf {host} abspielen",
		"card.stillAlt": "Standbild aus {title}",
		"dialog.projectFilm": "Projektfilm",
		"dialog.about": "Über",
		"dialog.close": "Schließen",
		"dialog.aboutLabel": "Über diesen Film",
		"dialog.openVimeo": "Auf Vimeo öffnen",
		"dialog.openYoutube": "Auf YouTube öffnen",
		"dialog.noDescription":
			"Für diesen Film liegt noch keine Beschreibung vor.",
		"lang.en": "EN",
		"lang.de": "DE",
	},
} as const;

export type UiKey = keyof (typeof ui)["en"];

export function isLang(value: string): value is Lang {
	return locales.includes(value as Lang);
}

export function getLangFromUrl(url: URL): Lang {
	const [, maybeLocale] = url.pathname.split("/");
	if (maybeLocale && isLang(maybeLocale)) {
		return maybeLocale;
	}
	return defaultLang;
}

export function useTranslations(lang: Lang) {
	return function t(key: UiKey, vars?: Record<string, string | number>) {
		let value: string = ui[lang][key] ?? ui[defaultLang][key];
		if (vars) {
			for (const [name, replacement] of Object.entries(vars)) {
				value = value.replaceAll(`{${name}}`, String(replacement));
			}
		}
		return value;
	};
}

export function localizedHomePath(lang: Lang) {
	return lang === defaultLang ? "/" : `/${lang}/`;
}

export function getNavigation(lang: Lang) {
	const t = useTranslations(lang);
	return [
		{ label: t("nav.home"), href: "#home" },
		{ label: t("nav.commercial"), href: "#commercial" },
		{ label: t("nav.art"), href: "#art" },
		{ label: t("nav.photography"), href: "#photography" },
		{ label: t("nav.shorts"), href: "#shorts" },
		{ label: t("nav.contact"), href: "#contact" },
	] as const;
}
