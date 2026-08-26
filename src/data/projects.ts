export type ProjectCategory = "commercial" | "art" | "shorts";

export interface Project {
	id: string;
	title: string;
	category: ProjectCategory;
	year: number;
	duration: number;
	thumbnail: string;
	featured?: boolean;
}

export const projects: Project[] = [
	{
		id: "941885206",
		title: "Mr Spex",
		category: "commercial",
		year: 2024,
		duration: 46,
		thumbnail:
			"https://i.vimeocdn.com/video/1845163634-895d5a0e006df08fefa4d667f13df3ff658f031f0840f9eaf709f43168ab98bf-d_1280x720?region=us",
		featured: true,
	},
	{
		id: "898735203",
		title: "The Hook — Behind the Scenes",
		category: "commercial",
		year: 2023,
		duration: 79,
		thumbnail:
			"https://i.vimeocdn.com/video/1775724249-ab8493333fbcd720f4127ef33f3b0e01acff434f1590f8f4a379d8e22f6af84d-d_1280x720?region=us",
	},
	{
		id: "887931494",
		title: "Helpers A.D",
		category: "commercial",
		year: 2023,
		duration: 55,
		thumbnail:
			"https://i.vimeocdn.com/video/1758709820-aabb923eb02a5de1d3b8516d2e3a0fa282b128984fd9dc36e12c10021086027f-d_1280x720?region=us",
	},
	{
		id: "887931489",
		title: "Dresscode A.D.",
		category: "commercial",
		year: 2023,
		duration: 16,
		thumbnail:
			"https://i.vimeocdn.com/video/1758709347-41bbce800f5d43b24d278300a09fb1f67e7180782aedb873a82e3d476871fab4-d_1280x720?region=us",
	},
	{
		id: "838576202",
		title: "Main Hoon Kissan",
		category: "commercial",
		year: 2023,
		duration: 203,
		thumbnail:
			"https://i.vimeocdn.com/video/1687596871-28bf77650fa98913d58a39f5826756fc15e403d2bf89a869bf412ba9c9a297f3-d_1280x720?region=us",
	},
	{
		id: "898735413",
		title: "An'kahi",
		category: "art",
		year: 2023,
		duration: 652,
		thumbnail:
			"https://i.vimeocdn.com/video/1775725392-344c18ebccaaf32c9fb7760d65e20250de731b7b2fcb18855506372c096a7c49-d_1280x720?region=us",
		featured: true,
	},
	{
		id: "1026359221",
		title: "Smoke and Mirrors",
		category: "art",
		year: 2024,
		duration: 724,
		thumbnail:
			"https://i.vimeocdn.com/video/1946129668-289e7a07b9b93a96d757a66b06c445692574cef623453229f3f9bd2126ab0215-d_1280x720?region=us",
	},
	{
		id: "1026358790",
		title: "Smoke and Mirrors — Trailer",
		category: "art",
		year: 2024,
		duration: 48,
		thumbnail:
			"https://i.vimeocdn.com/video/1946128345-fdb1fdfe2c2de2548e573908a35e8f4fb9a895fe9848ee15eaa406cf10e280c0-d_1280x720?region=us",
	},
	{
		id: "973619906",
		title: "Islamabad",
		category: "art",
		year: 2024,
		duration: 330,
		thumbnail:
			"https://i.vimeocdn.com/video/1887801527-1640e6d958ceeb350816514629484968a25f3ea92e88b6bdfb7f644c5e3f1790-d_1280x720?region=us",
	},
	{
		id: "911992966",
		title: "By Chance — Trailer",
		category: "art",
		year: 2024,
		duration: 57,
		thumbnail:
			"https://i.vimeocdn.com/video/1796935574-0d2223e1e7bdccb1edd18ce47ceb40de4da5b42e29e9c06a71b0255023d9c55d-d_1280x720?region=us",
	},
	{
		id: "911714914",
		title: "Paris",
		category: "art",
		year: 2024,
		duration: 66,
		thumbnail:
			"https://i.vimeocdn.com/video/1796379990-75d6fc9f0d283fd5a07aa6f4990514ef11a4da87055263dcd7102e31ffccfc31-d_1280x720?region=us",
	},
	{
		id: "887016435",
		title: "By Chance",
		category: "art",
		year: 2023,
		duration: 820,
		thumbnail:
			"https://i.vimeocdn.com/video/1757351682-2af4bf2bc0a88470c35a8c7b5bf3ebf9771ca56818e2cfa99a571cf98dd9ab91-d_1280x720?region=us",
	},
	{
		id: "887014384",
		title: "Blackmail",
		category: "art",
		year: 2023,
		duration: 380,
		thumbnail:
			"https://i.vimeocdn.com/video/1757343482-5464f77343fc77bbd0f692b50b986b0986663852d6085244208b1b56fff35438-d_1280x720?region=us",
	},
	{
		id: "857425108",
		title: "Memory",
		category: "art",
		year: 2023,
		duration: 219,
		thumbnail:
			"https://i.vimeocdn.com/video/1714541062-8f12aca81855d950ad336e8d6c75b93adee558daf865540b6067eadfd5307a96-d_1280x720?region=us",
	},
	{
		id: "857404107",
		title: "A Chance",
		category: "art",
		year: 2023,
		duration: 267,
		thumbnail:
			"https://i.vimeocdn.com/video/1714515349-df080ce7cc04deffcd3e76be72537e03534dd5456708f5bf794cc1ca1031c138-d_1280x720?region=us",
	},
	{
		id: "854083915",
		title: "Plate of Rice",
		category: "art",
		year: 2023,
		duration: 300,
		thumbnail:
			"https://i.vimeocdn.com/video/1709891417-28720745fdb8b2e41fdc29a6828ef7de7151ffeeed662288a9f2388d647d693a-d_1280x720?region=us",
	},
	{
		id: "854082701",
		title: "Writer's Block",
		category: "art",
		year: 2023,
		duration: 283,
		thumbnail:
			"https://i.vimeocdn.com/video/1709889113-3fdb4cf5c5a76f0e4551abde7c8ecc4b5c48577b2acf2331d529c34bb942a98e-d_1280x720?region=us",
	},
	// Vertical (9:16) short-form videos go here with category: "shorts".
];

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
