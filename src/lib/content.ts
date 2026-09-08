import { storedVideoToProject } from "./video-metadata";
import { listPhotos, listShorts, listVideos, type StoredVideo } from "./store";
import type { Project } from "../data/projects";
import type { StoredPhoto } from "../data/photos";
import { isShortCampaign, type StoredShort } from "../data/shorts";

export async function loadProjects(): Promise<{
	projects: Project[];
	indie: Project[];
	local: Project[];
	bts: Project[];
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
		indie: projects.filter((project) => project.category === "indie"),
		local: projects.filter((project) => project.category === "local"),
		bts: projects.filter((project) => project.category === "bts"),
		shorts: projects.filter((project) => project.category === "shorts"),
	};
}

export async function loadPhotos(): Promise<StoredPhoto[]> {
	return listPhotos();
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
