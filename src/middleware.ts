import { defineMiddleware } from "astro:middleware";

function isPreviewHost(host: string) {
	const normalized = host.split(":")[0]?.toLowerCase() ?? "";
	return (
		normalized.endsWith(".workers.dev") ||
		normalized.endsWith(".pages.dev")
	);
}

function isDashboardHost(host: string) {
	const normalized = host.split(":")[0]?.toLowerCase() ?? "";
	return (
		normalized.startsWith("dashboard.") ||
		normalized === "dashboard.localhost" ||
		normalized.startsWith("dashboard.127.0.0.1")
	);
}

function isKeystaticPath(pathname: string) {
	return (
		pathname === "/keystatic" ||
		pathname.startsWith("/keystatic/") ||
		pathname.startsWith("/api/keystatic")
	);
}

function dashboardOrigin(url: URL) {
	const configured = import.meta.env.PUBLIC_DASHBOARD_URL;
	if (configured) return new URL(configured).origin;

	const host = url.host.split(":")[0] ?? url.host;
	if (host === "localhost" || host === "127.0.0.1") {
		return `${url.protocol}//dashboard.localhost${url.port ? `:${url.port}` : ""}`;
	}

	return `${url.protocol}//dashboard.${host}`;
}

function siteOrigin(url: URL) {
	const configured = import.meta.env.SITE || import.meta.env.PUBLIC_SITE_URL;
	if (configured) return new URL(configured).origin;

	const host = url.host.split(":")[0] ?? url.host;
	if (host.startsWith("dashboard.")) {
		return `${url.protocol}//${host.replace(/^dashboard\./, "")}${url.port ? `:${url.port}` : ""}`;
	}

	return url.origin;
}

/**
 * - dashboard.* → Keystatic only (Google login is enforced by Cloudflare Access)
 * - apex/www → public site; bounce /keystatic to the dashboard host
 */
export const onRequest = defineMiddleware(async (context, next) => {
	const url = context.url;
	const host = url.host;
	const onDashboard = isDashboardHost(host);
	const keystaticPath = isKeystaticPath(url.pathname);

	if (onDashboard && !keystaticPath) {
		return context.redirect("/keystatic");
	}

	// In production, keep the CMS on the dashboard host only.
	// Locally and on *.workers.dev / *.pages.dev previews, /keystatic stays on-host.
	if (
		!import.meta.env.DEV &&
		!onDashboard &&
		!isPreviewHost(host) &&
		keystaticPath
	) {
		const target = new URL(
			`${url.pathname}${url.search}`,
			`${dashboardOrigin(url)}/`,
		);
		return context.redirect(target.toString());
	}

	if (onDashboard && import.meta.env.PROD) {
		// Cloudflare Access should gate the hostname. If Access is misconfigured,
		// fail closed unless explicitly disabled.
		const enforceAccess = import.meta.env.DASHBOARD_ENFORCE_CF_ACCESS !== "false";
		const accessEmail = context.request.headers.get(
			"cf-access-authenticated-user-email",
		);
		if (enforceAccess && !accessEmail) {
			return new Response(
				"Dashboard is protected by Cloudflare Access (Google login). Configure an Access application for this hostname.",
				{
					status: 401,
					headers: {
						"content-type": "text/plain; charset=utf-8",
						"x-robots-tag": "noindex",
					},
				},
			);
		}
	}

	const response = await next();

	if (onDashboard) {
		response.headers.set("x-robots-tag", "noindex, nofollow");
		response.headers.set("x-mbu-surface", "dashboard");
		// Helpful for debugging Access; never cache admin HTML.
		response.headers.set("cache-control", "no-store");
	} else {
		response.headers.set("x-mbu-surface", "site");
		response.headers.set("x-mbu-site-origin", siteOrigin(url));
	}

	return response;
});
