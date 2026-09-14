import { defineMiddleware } from "astro:middleware";
import { accessJwtConfig, verifyAccessJwt } from "./lib/access-jwt";
import { dashboardAccessEnforced } from "./lib/store";
import {
	dashboardOrigin,
	isDashboardHost,
	isDashboardPath,
	isPreviewHost,
	siteOrigin,
} from "./lib/hosts";

export const onRequest = defineMiddleware(async (context, next) => {
	const url = context.url;
	const host = url.host;
	const onDashboard = isDashboardHost(host);
	const dashboardPath = isDashboardPath(url.pathname);

	if (onDashboard && url.pathname === "/") {
		return context.redirect("/dashboard");
	}

	if (onDashboard && !dashboardPath && !url.pathname.startsWith("/media/")) {
		return context.redirect("/dashboard");
	}

	if (!import.meta.env.DEV && !onDashboard && dashboardPath) {
		const target = new URL(
			`${url.pathname}${url.search}`,
			`${dashboardOrigin(url)}/`,
		);
		if (target.host !== host) {
			return context.redirect(target.toString(), 302);
		}
	}

	// Fail closed on every dashboard hostname in production — including
	// dashboard.*.workers.dev. Do not skip *.workers.dev: that host is both
	// "preview" and the live editor, and skipping left the catalog public.
	// Ephemeral PR Workers (mbu-pr-*) are not dashboard hosts; /dashboard
	// there stays reachable for visual QA without a Zero Trust app per URL.
	// Catalog/media mutations require a verified Access JWT (api-auth).
	if (onDashboard && import.meta.env.PROD && dashboardAccessEnforced()) {
		if (!accessJwtConfig()) {
			return new Response(
				"Dashboard Access is not configured. Set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD on the dashboard Worker.",
				{
					status: 503,
					headers: {
						"content-type": "text/plain; charset=utf-8",
						"x-robots-tag": "noindex",
					},
				},
			);
		}
		const identity = await verifyAccessJwt(context.request);
		if (!identity) {
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

	if (onDashboard || dashboardPath) {
		response.headers.set("x-robots-tag", "noindex, nofollow");
		response.headers.set("x-mbu-surface", "dashboard");
		response.headers.set("cache-control", "no-store");
	} else {
		response.headers.set("x-mbu-surface", "site");
		response.headers.set("x-mbu-site-origin", siteOrigin(url));
		// Preview hosts must not compete with the production canonical.
		if (isPreviewHost(host)) {
			response.headers.set("x-robots-tag", "noindex, nofollow");
		}
		// Media routes set their own long-lived Cache-Control; do not override.
		// Internal purge endpoint must stay uncached.
		if (!url.pathname.startsWith("/media/") && url.pathname !== "/cdn-purge") {
			response.headers.set(
				"cache-control",
				"public, s-maxage=86400, stale-while-revalidate=604800",
			);
			const buildId =
				typeof import.meta.env.PUBLIC_BUILD_ID === "string"
					? import.meta.env.PUBLIC_BUILD_ID.trim()
					: "";
			const tags = ["html"];
			if (buildId) tags.push(`deploy-${buildId.slice(0, 12)}`);
			response.headers.set("cache-tag", tags.join(","));
		} else if (url.pathname === "/cdn-purge") {
			response.headers.set("cache-control", "no-store");
		}
	}

	return response;
});
