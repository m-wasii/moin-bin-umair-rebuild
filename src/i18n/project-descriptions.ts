import type { Project } from "../data/projects";
import type { Lang } from "./ui";

/** German project about-copy keyed by project id. Titles stay in their original language. */
const descriptionsDe: Record<string, string> = {
	"941885206":
		"Ein klarer Werbeschnitt für Mr Spex, gebaut um präzise Produktbeats und einen selbstbewussten visuellen Rhythmus.",
	"898735203":
		"Ein Blick hinter die Kulissen von The Hook — Set, Crew und das Handwerk hinter dem fertigen Film.",
	"887931494":
		"Ein kurzer Werbespot für Helpers A.D mit warmen Figuren und einem klaren, überzeugenden Erzählbogen.",
	"887931489":
		"Ein knapper, rasanter Spot für Dresscode A.D., der Stil und Haltung in unter zwanzig Sekunden setzt.",
	"838576202":
		"Ein längerer Werbefilm, der den Alltag der Landwirtschaft mit geerdeter Erzählung und filmischem Maßstab zeigt.",
	"898735413":
		"Ein meditativer Kurzfilm über unausgesprochene Emotion, getragen von ruhigen Bildern und einer anhaltenden Atmosphäre.",
	"1026359221":
		"Ein Kunstfilm über Illusion und Performance, in dem Gezeigtes und Verschwiegenes ständig die Plätze tauschen.",
	"1026358790":
		"Ein kompakter Trailer, der Ton und Bildsprache von Smoke and Mirrors andeutet.",
	"973619906":
		"Ein Stadtporträt von Islamabad über Textur, Licht und die leiseren Rhythmen eines Ortes.",
	"911992966":
		"Ein kurzer Trailer für By Chance, der den Sinn für Zufall und emotionale Drift des Films einführt.",
	"911714914":
		"Ein kurzer visueller Essay aus Paris — aufmerksam für Stimmung, Bewegung und flüchtige Details der Stadt.",
	"887016435":
		"Ein längerer Kurzfilm über Zufallsbegegnungen und die fragilen Wendungen, die ein Leben umlenken.",
	"887014384":
		"Ein spannungsgeladener narrativer Kurzfilm, in dem Druck, Geheimnis und moralischer Kompromiss Bild für Bild zunehmen.",
	"857425108":
		"Ein reflektierendes Stück über Erinnerung und Verlust, geprägt von weichen Bildern und einem intimen Tempo.",
	"857404107":
		"Ein figurengetriebener Kurzfilm über eine einzige Chance — und was es kostet, sie zu ergreifen.",
	"854083915":
		"Ein intimer Film um eine einfache Mahlzeit, der mit kleinen Gesten eine größere emotionale Welt freilegt.",
	"854082701":
		"Ein Porträt kreativer Lähmung, das die unruhige Schleife zwischen leerem Blatt und rastlosem Kopf nachzeichnet.",
};

export function localizedProjectDescription(
	project: Pick<Project, "id" | "description">,
	lang: Lang,
): string {
	if (lang === "de") {
		return descriptionsDe[project.id] ?? project.description ?? "";
	}
	return project.description ?? "";
}
