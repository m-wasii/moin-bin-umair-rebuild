import generated from "./projects.generated.json";

export type ProjectCategory = "commercial" | "art" | "shorts";
export type VideoProvider = "vimeo" | "youtube";

export interface Project {
	id: string;
	title: string;
	category: ProjectCategory;
	year: number;
	duration: number;
	thumbnail: string;
	description?: string;
	featured?: boolean;
	provider?: VideoProvider;
}

export function projectProvider(
	project: Pick<Project, "provider">,
): VideoProvider {
	return project.provider ?? "vimeo";
}

export function projectWatchUrl(project: Pick<Project, "id" | "provider">) {
	return projectProvider(project) === "youtube"
		? `https://www.youtube.com/watch?v=${project.id}`
		: `https://vimeo.com/${project.id}`;
}

export function projectHostLabel(project: Pick<Project, "provider">) {
	return projectProvider(project) === "youtube" ? "YouTube" : "Vimeo";
}

/** Portfolio films. Edit `catalog.json`, then run `npm run sync:videos`. */
export const projects = generated.projects as Project[];

export const commercialProjects = projects.filter(
	(project) => project.category === "commercial",
);

export const artProjects = projects.filter(
	(project) => project.category === "art",
);

export const shortsProjects = projects.filter(
	(project) => project.category === "shorts",
);

export function formatDuration(duration: number) {
	const minutes = Math.floor(duration / 60);
	const seconds = duration % 60;

	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
