import type { APIRoute } from "astro";
import {
	isPhotoCategorySlug,
	type StoredPhoto,
	type StoredPhotoCategory,
} from "../../data/photos";
import {
	deletePhotoBytes,
	hasWritableMedia,
	listPhotoCategories,
	listPhotos,
	listVideos,
	savePhotoCategories,
	savePhotos,
	saveVideos,
	type StoredVideo,
} from "../../lib/store";

export const prerender = false;

function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json; charset=utf-8" },
	});
}

function clearPhotoTrash(photo: StoredPhoto): StoredPhoto {
	const { deletedAt: _d, trashedWithCategory: _t, ...rest } = photo;
	return rest;
}

function clearCategoryTrash(
	category: StoredPhotoCategory,
): StoredPhotoCategory {
	const { deletedAt: _d, ...rest } = category;
	return rest;
}

function clearVideoTrash(video: StoredVideo): StoredVideo {
	const { deletedAt: _d, ...rest } = video;
	return rest;
}

export const GET: APIRoute = async () => {
	const [photos, categories, videos] = await Promise.all([
		listPhotos({ includeDeleted: true }),
		listPhotoCategories({ includeDeleted: true }),
		listVideos({ includeDeleted: true }),
	]);

	const trashedCategories = categories.filter((entry) => entry.deletedAt);
	const standalonePhotos = photos.filter(
		(photo) => photo.deletedAt && !photo.trashedWithCategory,
	);
	const trashedVideos = videos.filter((video) => video.deletedAt);

	const categoryBundles = trashedCategories.map((category) => ({
		category,
		photos: photos.filter(
			(photo) => photo.trashedWithCategory === category.slug,
		),
	}));

	return json({
		categories: categoryBundles,
		photos: standalonePhotos,
		videos: trashedVideos,
		writable: hasWritableMedia(),
	});
};

type TrashItem =
	| { kind: "photo"; slug: string; category: string }
	| { kind: "category"; slug: string }
	| { kind: "video"; slug: string };

type TrashBody = {
	action?: "move" | "restore" | "purge" | "empty";
	items?: TrashItem[];
	kind?: "photo" | "category" | "video";
	slug?: string;
	category?: string;
};

export const POST: APIRoute = async ({ request }) => {
	if (!hasWritableMedia()) {
		return json({ error: "R2 is not bound yet." }, 503);
	}

	const body = (await request.json().catch(() => ({}))) as TrashBody;
	const action = body.action;

	if (action === "move") return moveToTrash(body.items ?? []);
	if (action === "empty") return emptyTrash();

	if (action === "restore" || action === "purge") {
		const item = resolveSingleItem(body);
		if (!item) {
			return json(
				{ error: "Specify kind and identifiers for restore/purge." },
				400,
			);
		}
		return action === "restore" ? restoreItem(item) : purgeItem(item);
	}

	return json({ error: "Unknown action." }, 400);
};

function resolveSingleItem(body: TrashBody): TrashItem | null {
	if (body.kind === "photo") {
		const slug = String(body.slug ?? "");
		const category = String(body.category ?? "");
		if (!slug || !isPhotoCategorySlug(category)) return null;
		return { kind: "photo", slug, category };
	}
	if (body.kind === "category") {
		const slug = String(body.slug ?? "");
		if (!slug || !isPhotoCategorySlug(slug)) return null;
		return { kind: "category", slug };
	}
	if (body.kind === "video") {
		const slug = String(body.slug ?? "");
		if (!slug) return null;
		return { kind: "video", slug };
	}
	return null;
}

async function moveToTrash(items: TrashItem[]) {
	if (!items.length) return json({ error: "Nothing selected." }, 400);

	const now = new Date().toISOString();
	const [photos, categories, videos] = await Promise.all([
		listPhotos({ includeDeleted: true }),
		listPhotoCategories({ includeDeleted: true }),
		listVideos({ includeDeleted: true }),
	]);

	const categorySlugs = new Set(
		items
			.filter(
				(item): item is Extract<TrashItem, { kind: "category" }> =>
					item.kind === "category",
			)
			.map((item) => item.slug),
	);

	let moved = 0;

	for (const slug of categorySlugs) {
		const index = categories.findIndex(
			(entry) => entry.slug === slug && !entry.deletedAt,
		);
		if (index < 0) continue;
		categories[index] = { ...categories[index], deletedAt: now };
		for (let i = 0; i < photos.length; i++) {
			const photo = photos[i];
			if (photo.category !== slug || photo.deletedAt) continue;
			photos[i] = {
				...photo,
				deletedAt: now,
				trashedWithCategory: slug,
			};
		}
		moved += 1;
	}

	for (const item of items) {
		if (item.kind !== "photo") continue;
		if (categorySlugs.has(item.category)) continue;
		const index = photos.findIndex(
			(photo) =>
				photo.slug === item.slug &&
				photo.category === item.category &&
				!photo.deletedAt,
		);
		if (index < 0) continue;
		photos[index] = {
			...photos[index],
			deletedAt: now,
			trashedWithCategory: null,
		};
		moved += 1;
	}

	for (const item of items) {
		if (item.kind !== "video") continue;
		const index = videos.findIndex(
			(video) => video.slug === item.slug && !video.deletedAt,
		);
		if (index < 0) continue;
		videos[index] = { ...videos[index], deletedAt: now };
		moved += 1;
	}

	if (!moved) return json({ error: "No matching active items found." }, 404);

	await Promise.all([
		savePhotos(photos),
		savePhotoCategories(categories),
		saveVideos(videos),
	]);

	return json({ ok: true, moved });
}

async function restoreItem(item: TrashItem) {
	if (item.kind === "category") {
		const [photos, categories] = await Promise.all([
			listPhotos({ includeDeleted: true }),
			listPhotoCategories({ includeDeleted: true }),
		]);
		const index = categories.findIndex(
			(entry) => entry.slug === item.slug && entry.deletedAt,
		);
		if (index < 0) return json({ error: "Trashed category not found." }, 404);

		categories[index] = clearCategoryTrash(categories[index]);
		for (let i = 0; i < photos.length; i++) {
			if (photos[i].trashedWithCategory === item.slug) {
				photos[i] = clearPhotoTrash(photos[i]);
			}
		}
		await Promise.all([savePhotoCategories(categories), savePhotos(photos)]);
		return json({ ok: true });
	}

	if (item.kind === "photo") {
		const [photos, categories] = await Promise.all([
			listPhotos({ includeDeleted: true }),
			listPhotoCategories({ includeDeleted: true }),
		]);
		const index = photos.findIndex(
			(photo) =>
				photo.slug === item.slug &&
				photo.category === item.category &&
				photo.deletedAt,
		);
		if (index < 0) return json({ error: "Trashed photo not found." }, 404);

		const photo = photos[index];
		if (photo.trashedWithCategory) {
			return json(
				{
					error:
						"This photo is part of a trashed category. Restore the category to bring it back.",
				},
				409,
			);
		}

		const categoryMeta = categories.find(
			(entry) => entry.slug === item.category,
		);
		if (!categoryMeta || categoryMeta.deletedAt) {
			return json(
				{
					error:
						"Restore or recreate the photo’s category before restoring this photo.",
				},
				409,
			);
		}

		photos[index] = clearPhotoTrash(photo);
		await savePhotos(photos);
		return json({ ok: true });
	}

	const videos = await listVideos({ includeDeleted: true });
	const index = videos.findIndex(
		(video) => video.slug === item.slug && video.deletedAt,
	);
	if (index < 0) return json({ error: "Trashed video not found." }, 404);
	videos[index] = clearVideoTrash(videos[index]);
	await saveVideos(videos);
	return json({ ok: true });
}

async function purgeItem(item: TrashItem) {
	if (item.kind === "category") {
		const [photos, categories] = await Promise.all([
			listPhotos({ includeDeleted: true }),
			listPhotoCategories({ includeDeleted: true }),
		]);
		const index = categories.findIndex(
			(entry) => entry.slug === item.slug && entry.deletedAt,
		);
		if (index < 0) return json({ error: "Trashed category not found." }, 404);

		const remaining: StoredPhoto[] = [];
		for (const photo of photos) {
			if (
				photo.trashedWithCategory === item.slug ||
				(photo.category === item.slug && photo.deletedAt)
			) {
				await deletePhotoBytes(photo.category, photo.slug);
				continue;
			}
			remaining.push(photo);
		}
		categories.splice(index, 1);
		await Promise.all([
			savePhotos(remaining),
			savePhotoCategories(categories),
		]);
		return json({ ok: true });
	}

	if (item.kind === "photo") {
		const photos = await listPhotos({ includeDeleted: true });
		const index = photos.findIndex(
			(photo) =>
				photo.slug === item.slug &&
				photo.category === item.category &&
				photo.deletedAt,
		);
		if (index < 0) return json({ error: "Trashed photo not found." }, 404);
		if (photos[index].trashedWithCategory) {
			return json(
				{
					error:
						"This photo belongs to a trashed category. Permanently delete the category instead.",
				},
				409,
			);
		}
		await deletePhotoBytes(item.category, item.slug);
		photos.splice(index, 1);
		await savePhotos(photos);
		return json({ ok: true });
	}

	const videos = await listVideos({ includeDeleted: true });
	const index = videos.findIndex(
		(video) => video.slug === item.slug && video.deletedAt,
	);
	if (index < 0) return json({ error: "Trashed video not found." }, 404);
	videos.splice(index, 1);
	await saveVideos(videos);
	return json({ ok: true });
}

async function emptyTrash() {
	const [photos, categories, videos] = await Promise.all([
		listPhotos({ includeDeleted: true }),
		listPhotoCategories({ includeDeleted: true }),
		listVideos({ includeDeleted: true }),
	]);

	const remainingPhotos: StoredPhoto[] = [];
	for (const photo of photos) {
		if (photo.deletedAt) {
			await deletePhotoBytes(photo.category, photo.slug);
			continue;
		}
		remainingPhotos.push(photo);
	}

	const remainingCategories = categories.filter((entry) => !entry.deletedAt);
	const remainingVideos = videos.filter((video) => !video.deletedAt);

	await Promise.all([
		savePhotos(remainingPhotos),
		savePhotoCategories(remainingCategories),
		saveVideos(remainingVideos),
	]);

	return json({ ok: true });
}
