/** Dashboard workspace navigation — Phase 2 Option B IA. */

export type DashboardSection =
	| "home"
	| "videos"
	| "photography"
	| "shorts"
	| "site";

export interface DashboardNavItem {
	id: DashboardSection;
	label: string;
	href: string;
	/** Shown under a small group label in the sidebar. */
	group?: string;
}

export interface DashboardNavGroup {
	label: string | null;
	items: DashboardNavItem[];
}

export const DASHBOARD_NAV: DashboardNavItem[] = [
	{ id: "home", label: "Home", href: "/dashboard" },
	{ id: "videos", label: "Videos", href: "/dashboard/videos", group: "Films" },
	{
		id: "photography",
		label: "Photography",
		href: "/dashboard/photos",
	},
	{
		id: "shorts",
		label: "Shorts",
		href: "/dashboard/shorts",
	},
	{
		id: "site",
		label: "Site / Hero",
		href: "/dashboard/site",
		group: "Site",
	},
];

export function dashboardNavGroups(): DashboardNavGroup[] {
	const groups: DashboardNavGroup[] = [];
	for (const item of DASHBOARD_NAV) {
		const label = item.group ?? null;
		const last = groups[groups.length - 1];
		if (last && last.label === label) {
			last.items.push(item);
			continue;
		}
		groups.push({ label, items: [item] });
	}
	return groups;
}

export function isDashboardSection(value: string): value is DashboardSection {
	return DASHBOARD_NAV.some((item) => item.id === value);
}
