export const locales = ["en", "de"] as const;

export type Lang = (typeof locales)[number];

export const defaultLang: Lang = "en";

export const PREFERRED_LANG_KEY = "preferred-lang";

const ui = {
	en: {
		"meta.title": "Moin Bin Umair — Filmmaker",
		"meta.description":
			"Indie films, local work, photography, and short-form stories by filmmaker Moin Bin Umair.",
		"meta.jobTitle": "Filmmaker",
		"a11y.skip": "Skip to selected work",
		"a11y.home": "home",
		"a11y.navToggle": "Toggle navigation",
		"a11y.primaryNav": "Primary navigation",
		"a11y.langSwitch": "Language",
		"nav.home": "Home",
		"nav.about": "About",
		"nav.indie": "Indie / Art",
		"nav.local": "Local Films",
		"nav.photography": "Photography",
		"nav.bts": "BTS & trailers",
		"nav.shorts": "Shorts",
		"nav.contact": "Contact",
		"hero.tagline": "Filmmaker · Visual storyteller",
		"hero.orbit": "Still · Motion · Story · Still · Motion · Story ·",
		"hero.explore": "Explore the work",
		"hero.contact": "Get in touch",
		"bridge.aria": "Continue exploring",
		"bridge.toPhotography": "Continue to photography",
		"bridge.toContact": "Start a conversation",
		"bridge.contact": "Or get in touch",
		"about.meta": "Profile",
		"about.title": "About",
		"about.intro":
			"Filmmaker and photographer working between still and motion.",
		"about.stats.value": "126+",
		"about.stats.label": "Projects",
		"about.stats.body":
			"Quiet moments, imperfect details, and the atmosphere that holds them.",
		"about.craft.eyebrow": "Craft",
		"about.craft.title": "Still ↔ motion",
		"about.craft.body":
			"Work moves between filmmaking and photography — always looking for the detail, feeling, or perspective that makes an image stay with you.",
		"about.place.eyebrow": "Place",
		"about.place.title": "South Asia · Berlin",
		"about.place.body":
			"Shaped by a South Asian sensibility and three years living in Berlin.",
		"about.thesis.eyebrow": "Thesis",
		"about.thesis.title": "Leave something behind",
		"about.thesis.body":
			"I don’t just want an image to look good. I want it to leave something behind — the kind of work that stays with you after the screen goes dark.",
		"about.portrait.alt": "Portrait of Moin Bin Umair",
		"section.indie.title": "Indie / Art",
		"section.indie.description":
			"International films and personal narrative work.",
		"section.indie.empty": "Indie / Art films will appear here.",
		"section.local.title": "Local Films",
		"section.local.description":
			"Karachi and local narrative films.",
		"section.local.empty": "Local films will appear here.",
		"section.bts.title": "BTS & trailers",
		"section.bts.description":
			"Behind-the-scenes cuts and trailers.",
		"section.bts.empty": "BTS and trailers will appear here.",
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
		"section.seeMore": "See more",
		"section.showLess": "Show less",
		"shorts.clipCount": "{count} clips",
		"shorts.playAria": "Play {title}",
		"shorts.clipOf": "{current} / {total}",
		"photo.category.architecture": "Architecture",
		"photo.category.behind-the-scenes": "Behind the scenes",
		"photo.category.portraits-fashion": "Portraits & fashion",
		"photo.category.fashion-lookbook": "Fashion Editorial",
		"photo.category.events-wedding": "Events & wedding",
		"photo.category.street-photography": "Street",
		"photo.category.film-portraits-trieste": "Trieste",
		"photo.category.portfolio-spreads": "Portfolio Spreads",
		"photo.category.product-photography": "Product Photography",
		"photo.prev": "Previous",
		"photo.next": "Next",
		"contact.meta": "Enquiries",
		"contact.title": "Let’s make something worth watching.",
		"contact.titleHtml": "Let’s make something<br /> worth watching.",
		"contact.description":
			"Indie films, narrative projects, and creative collaborations.",
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
			"Indiefilme, lokale Arbeiten, Fotografie und Kurzformate von Filmemacher Moin Bin Umair.",
		"meta.jobTitle": "Filmemacher",
		"a11y.skip": "Zur ausgewählten Arbeit springen",
		"a11y.home": "Start",
		"a11y.navToggle": "Navigation umschalten",
		"a11y.primaryNav": "Hauptnavigation",
		"a11y.langSwitch": "Sprache",
		"nav.home": "Start",
		"nav.about": "Über mich",
		"nav.indie": "Indie / Kunst",
		"nav.local": "Lokale Filme",
		"nav.photography": "Fotografie",
		"nav.bts": "BTS & Trailer",
		"nav.shorts": "Shorts",
		"nav.contact": "Kontakt",
		"hero.tagline": "Filmemacher · Visueller Geschichtenerzähler",
		"hero.orbit": "Bild · Bewegung · Geschichte · Bild · Bewegung · Geschichte ·",
		"hero.explore": "Arbeit entdecken",
		"hero.contact": "Kontakt aufnehmen",
		"bridge.aria": "Weiter entdecken",
		"bridge.toPhotography": "Weiter zur Fotografie",
		"bridge.toContact": "Gespräch beginnen",
		"bridge.contact": "Oder Kontakt aufnehmen",
		"about.meta": "Profil",
		"about.title": "Über mich",
		"about.intro":
			"Filmemacher und Fotograf zwischen Still und Bewegung.",
		"about.stats.value": "126+",
		"about.stats.label": "Projekte",
		"about.stats.body":
			"Ruhige Momente, unperfekte Details und die Atmosphäre, die sie trägt.",
		"about.craft.eyebrow": "Handwerk",
		"about.craft.title": "Still ↔ Bewegung",
		"about.craft.body":
			"Die Arbeit bewegt sich zwischen Film und Fotografie — immer auf der Suche nach dem Detail, dem Gefühl oder der Perspektive, die ein Bild bleiben lässt.",
		"about.place.eyebrow": "Ort",
		"about.place.title": "Südasien · Berlin",
		"about.place.body":
			"Geprägt von einer südasiatischen Sensibilität und drei Jahren in Berlin.",
		"about.thesis.eyebrow": "These",
		"about.thesis.title": "Etwas hinterlassen",
		"about.thesis.body":
			"Ein Bild soll nicht nur gut aussehen. Es soll etwas hinterlassen — die Art von Arbeit, die bleibt, wenn der Bildschirm dunkel wird.",
		"about.portrait.alt": "Porträt von Moin Bin Umair",
		"section.indie.title": "Indie / Kunst",
		"section.indie.description":
			"Internationale Filme und persönliche narrative Arbeiten.",
		"section.indie.empty": "Indie-/Kunstfilme erscheinen hier.",
		"section.local.title": "Lokale Filme",
		"section.local.description":
			"Karachi und lokale narrative Filme.",
		"section.local.empty": "Lokale Filme erscheinen hier.",
		"section.bts.title": "BTS & Trailer",
		"section.bts.description":
			"Behind-the-Scenes und Trailer.",
		"section.bts.empty": "BTS und Trailer erscheinen hier.",
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
		"section.seeMore": "Mehr anzeigen",
		"section.showLess": "Weniger anzeigen",
		"shorts.clipCount": "{count} Clips",
		"shorts.playAria": "{title} abspielen",
		"shorts.clipOf": "{current} / {total}",
		"photo.category.architecture": "Architektur",
		"photo.category.behind-the-scenes": "Making-of",
		"photo.category.portraits-fashion": "Porträts & Mode",
		"photo.category.fashion-lookbook": "Fashion-Editorial",
		"photo.category.events-wedding": "Events & Hochzeit",
		"photo.category.street-photography": "Street",
		"photo.category.film-portraits-trieste": "Triest",
		"photo.category.portfolio-spreads": "Portfolio-Spreads",
		"photo.category.product-photography": "Produktfotografie",
		"photo.prev": "Zurück",
		"photo.next": "Weiter",
		"contact.meta": "Anfragen",
		"contact.title": "Lass uns etwas machen, das man sehen will.",
		"contact.titleHtml":
			"Lass uns etwas machen,<br /> das man sehen will.",
		"contact.description":
			"Indiefilme, narrative Projekte und kreative Zusammenarbeiten.",
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
		{ label: t("nav.about"), href: "#about" },
		{ label: t("nav.indie"), href: "#indie" },
		{ label: t("nav.local"), href: "#local" },
		{ label: t("nav.photography"), href: "#photography" },
		{ label: t("nav.bts"), href: "#bts" },
		{ label: t("nav.shorts"), href: "#shorts" },
		{ label: t("nav.contact"), href: "#contact" },
	] as const;
}
