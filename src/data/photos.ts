export const photoCategories = [
	"film-portraits-trieste",
	"architecture",
	"behind-the-scenes",
	"portraits-fashion",
	"fashion-lookbook",
	"events-wedding",
	"street-photography",
] as const;

export type PhotoCategory = (typeof photoCategories)[number];

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

export function isPhotoCategory(value: string): value is PhotoCategory {
	return (photoCategories as readonly string[]).includes(value);
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
