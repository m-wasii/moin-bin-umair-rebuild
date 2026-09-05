import { defineMiddleware } from "astro:middleware";
import { dashboardAccessEnforced } from "./lib/store";
import {
	dashboardOrigin,
	isDashboardHost,
	isDashboardPath,
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
	// there stays reachable for QA without a Zero Trust app per preview URL.
	if (onDashboard && import.meta.env.PROD) {
		const enforceAccess = dashboardAccessEnforced();
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

	if (onDashboard || dashboardPath) {
		response.headers.set("x-robots-tag", "noindex, nofollow");
		response.headers.set("x-mbu-surface", "dashboard");
		response.headers.set("cache-control", "no-store");
	} else {
		response.headers.set("x-mbu-surface", "site");
		response.headers.set("x-mbu-site-origin", siteOrigin(url));
	}

	return response;
});
