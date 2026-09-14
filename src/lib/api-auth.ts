import { accessJwtConfig, verifyAccessJwt } from "./access-jwt";
import { isDashboardHost } from "./hosts";
import { dashboardAccessEnforced } from "./store";

function json(data: unknown, status: number) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store",
			"x-robots-tag": "noindex",
		},
	});
}

/**
 * Defense-in-depth for catalog/media mutations.
 * Does not replace Cloudflare Access at the edge.
 *
 * - Dev: allow (local dashboard without Access).
 * - Prod + DASHBOARD_ENFORCE_CF_ACCESS=false: allow (documented bring-up only).
 * - Prod + enforced:
 *   - dashboard host only (blocks public / preview Workers sharing MEDIA)
 *   - verified Cf-Access-Jwt-Assertion (email header alone is forgeable)
 *   - fail closed if CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD are missing
 */
export async function unauthorizedMutationResponse(
	request: Request,
): Promise<Response | null> {
	if (import.meta.env.DEV) return null;

	if (!dashboardAccessEnforced()) return null;

	const host = new URL(request.url).host;
	if (!isDashboardHost(host)) {
		console.warn("[api-auth] mutation blocked — not a dashboard host");
		return json({ error: "Unauthorized" }, 401);
	}

	if (!accessJwtConfig()) {
		console.error(
			"[api-auth] CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD not configured",
		);
		return json({ error: "Service unavailable" }, 503);
	}

	const identity = await verifyAccessJwt(request);
	if (!identity) {
		console.warn("[api-auth] mutation blocked — Access JWT invalid or missing");
		return json({ error: "Unauthorized" }, 401);
	}

	return null;
}
