/** Public workers.dev script name. Must match wrangler.jsonc `"name"`. */
export const WORKERS_DEV_SITE_WORKER = "mbu";

export function hostnameOf(url: URL) {
	return url.host.split(":")[0]?.toLowerCase() ?? "";
}

export function isPreviewHost(host: string) {
	const normalized = host.split(":")[0]?.toLowerCase() ?? "";
	return (
		normalized.endsWith(".workers.dev") || normalized.endsWith(".pages.dev")
	);
}

export function isDashboardHost(host: string) {
	const normalized = host.split(":")[0]?.toLowerCase() ?? "";
	return (
		normalized.startsWith("dashboard.") ||
		normalized === "dashboard.localhost" ||
		normalized.startsWith("dashboard.127.0.0.1")
	);
}

export function isDashboardPath(pathname: string) {
	return (
		pathname === "/dashboard" ||
		pathname.startsWith("/dashboard/") ||
		pathname.startsWith("/api/videos") ||
		pathname.startsWith("/api/photos")
	);
}

/**
 * Account suffix for `worker.account.workers.dev` (four labels).
 * Example: `mbu.wasi-workdesk.workers.dev` → `wasi-workdesk.workers.dev`
 */
export function workersDevAccountHost(host: string) {
	const normalized = host.split(":")[0]?.toLowerCase() ?? "";
	if (!normalized.endsWith(".workers.dev")) return null;
	const labels = normalized.split(".");
	if (labels.length !== 4) return null;
	return labels.slice(1).join(".");
}

export function dashboardOrigin(url: URL) {
	const configured = import.meta.env.PUBLIC_DASHBOARD_URL;
	if (configured) return new URL(configured).origin;

	const host = hostnameOf(url);
	if (host === "localhost" || host === "127.0.0.1") {
		return `${url.protocol}//${url.host}`;
	}
	if (isDashboardHost(host)) {
		return `${url.protocol}//${url.host}`;
	}

	const account = workersDevAccountHost(host);
	if (account) {
		return `${url.protocol}//dashboard.${account}`;
	}

	// pages.dev and other preview hosts keep /dashboard on-host
	if (isPreviewHost(host)) {
		return `${url.protocol}//${url.host}`;
	}

	if (host.startsWith("www.")) {
		return `${url.protocol}//dashboard.${host.slice(4)}`;
	}

	return `${url.protocol}//dashboard.${host}`;
}

export function siteOrigin(url: URL) {
	const configured = import.meta.env.SITE || import.meta.env.PUBLIC_SITE_URL;
	if (configured) return new URL(configured).origin;

	const host = hostnameOf(url);
	const account = workersDevAccountHost(host);
	if (account) {
		return `${url.protocol}//${WORKERS_DEV_SITE_WORKER}.${account}`;
	}

	if (host.startsWith("dashboard.")) {
		const rest = host.replace(/^dashboard\./, "");
		return `${url.protocol}//${rest}${url.port ? `:${url.port}` : ""}`;
	}

	return url.origin;
}
