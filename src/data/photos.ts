export const defaultPhotoCategories = [
	{ slug: "film-portraits-trieste", label: "Trieste" },
	{ slug: "architecture", label: "Architecture" },
	{ slug: "behind-the-scenes", label: "Behind the scenes" },
	{ slug: "portraits-fashion", label: "Portraits & fashion" },
	{ slug: "fashion-lookbook", label: "Fashion lookbook" },
	{ slug: "events-wedding", label: "Events & wedding" },
	{ slug: "street-photography", label: "Street" },
] as const;

/** Seed / legacy slug list. Prefer listPhotoCategories for runtime catalogs. */
export const photoCategories = defaultPhotoCategories.map((entry) => entry.slug);

export type PhotoCategory = string;

export interface StoredPhotoCategory {
	slug: string;
	label: string;
}

export interface StoredPhoto {
	slug: string;
	category: PhotoCategory;
	title: string;
	alt: string;
	src: string;
}

export function photoMediaSrc(category: PhotoCategory, slug: string) {
	return `/media/photos/${category}/${slug}.webp`;
}

export function isPhotoCategorySlug(value: string): boolean {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80;
}

/** Accepts any valid category slug shape (catalog may be dynamic). */
export function isPhotoCategory(value: string): value is PhotoCategory {
	return isPhotoCategorySlug(value);
}

export function slugifyPhotoName(value: string) {
	return value
		.toLowerCase()
		.replace(/\.[a-z0-9]+$/i, "")
		.replace(/^\d+-/, "")
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

export function titleFromSlug(slug: string) {
	return slug
		.split("-")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}
