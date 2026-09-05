import { storedVideoToProject } from "./video-metadata";
import {
	listPhotoCategories,
	listPhotos,
	listShorts,
	listVideos,
	type StoredVideo,
} from "./store";
import type { Project } from "../data/projects";
import type { StoredPhoto, StoredPhotoCategory } from "../data/photos";
import { isShortCampaign, type StoredShort } from "../data/shorts";

export async function loadProjects(): Promise<{
	projects: Project[];
	commercial: Project[];
	art: Project[];
	shorts: Project[];
	videos: StoredVideo[];
}> {
	const videos = [...(await listVideos())].sort((a, b) => {
		const order = (a.sortOrder ?? 100) - (b.sortOrder ?? 100);
		if (order !== 0) return order;
		return a.slug.localeCompare(b.slug);
	});
	const projects = videos.map(storedVideoToProject);
	return {
		videos,
		projects,
		commercial: projects.filter((project) => project.category === "commercial"),
		art: projects.filter((project) => project.category === "art"),
		shorts: projects.filter((project) => project.category === "shorts"),
	};
}

export async function loadPhotos(): Promise<{
	photos: StoredPhoto[];
	categories: StoredPhotoCategory[];
}> {
	const [photos, categories] = await Promise.all([
		listPhotos(),
		listPhotoCategories(),
	]);
	return { photos, categories };
}

export async function loadShorts(): Promise<{
	shorts: StoredShort[];
	campaigns: StoredShort[];
	singles: StoredShort[];
}> {
	const shorts = [...(await listShorts())].sort((a, b) => {
		const order = (a.sortOrder ?? 100) - (b.sortOrder ?? 100);
		if (order !== 0) return order;
		return a.slug.localeCompare(b.slug);
	});

	return {
		shorts,
		campaigns: shorts.filter(isShortCampaign),
		singles: shorts.filter((entry) => !isShortCampaign(entry)),
	};
}
