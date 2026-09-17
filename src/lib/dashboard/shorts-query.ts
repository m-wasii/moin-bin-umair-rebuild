import {
	isShortCampaign,
	type StoredShort,
} from "../../data/shorts";

export type ShortsKindFilter = "all" | "campaign" | "single";
export type ShortsSort = "order" | "title" | "year";

export interface ShortsQuery {
	q?: string;
	kind?: ShortsKindFilter;
	sort?: ShortsSort;
}

function normalizeQuery(q: string) {
	return q.trim().toLowerCase();
}

export function shortMatchesSearch(entry: StoredShort, q: string) {
	const needle = normalizeQuery(q);
	if (!needle) return true;
	const haystack = [entry.title, entry.slug, String(entry.year)]
		.join("\n")
		.toLowerCase();
	return haystack.includes(needle);
}

export function filterShortsByKind(
	shorts: StoredShort[],
	kind: ShortsKindFilter = "all",
) {
	if (kind === "campaign") return shorts.filter(isShortCampaign);
	if (kind === "single") return shorts.filter((entry) => !isShortCampaign(entry));
	return shorts.slice();
}

export function searchShorts(shorts: StoredShort[], q = "") {
	if (!normalizeQuery(q)) return shorts.slice();
	return shorts.filter((entry) => shortMatchesSearch(entry, q));
}

function compareOrder(a: StoredShort, b: StoredShort) {
	const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
	const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
	if (ao !== bo) return ao - bo;
	return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

export function sortShorts(shorts: StoredShort[], sort: ShortsSort = "order") {
	const copy = shorts.slice();
	switch (sort) {
		case "title":
			return copy.sort((a, b) =>
				a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
			);
		case "year":
			return copy.sort((a, b) => {
				if (a.year !== b.year) return b.year - a.year;
				return compareOrder(a, b);
			});
		case "order":
		default:
			return copy.sort(compareOrder);
	}
}

export function queryShorts(shorts: StoredShort[], query: ShortsQuery = {}) {
	const filtered = filterShortsByKind(
		searchShorts(shorts, query.q ?? ""),
		query.kind ?? "all",
	);
	return sortShorts(filtered, query.sort ?? "order");
}

/** Persistent catalog reorder only when the view is the full canonical order. */
export function shortsReorderAllowed(query: ShortsQuery = {}) {
	if ((query.kind ?? "all") !== "all") return false;
	if ((query.sort ?? "order") !== "order") return false;
	if (normalizeQuery(query.q ?? "")) return false;
	return true;
}
