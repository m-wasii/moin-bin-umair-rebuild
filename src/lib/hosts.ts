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

export function dashboardOrigin(url: URL) {
	const configured = import.meta.env.PUBLIC_DASHBOARD_URL;
	if (configured) return new URL(configured).origin;

	const host = hostnameOf(url);
	if (host === "localhost" || host === "127.0.0.1") {
		return `${url.protocol}//${url.host}`;
	}

	return `${url.protocol}//dashboard.${host}`;
}

export function siteOrigin(url: URL) {
	const configured = import.meta.env.SITE || import.meta.env.PUBLIC_SITE_URL;
	if (configured) return new URL(configured).origin;

	const host = hostnameOf(url);
	if (host.startsWith("dashboard.")) {
		return `${url.protocol}//${host.replace(/^dashboard\./, "")}${url.port ? `:${url.port}` : ""}`;
	}

	return url.origin;
}
