import { accessJwtConfig, verifyAccessJwt } from "./access-jwt";
import { isDashboardHost } from "./hosts";
import { decideMutationAuth } from "./mutation-auth-policy";
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
 * - Prod + both DASHBOARD_ENFORCE_CF_ACCESS=false and
 *   ALLOW_INSECURE_DASHBOARD_BRINGUP=true: allow (documented bring-up only).
 * - Prod + enforced (default; a lone enforce=false is ignored):
 *   - dashboard host only (blocks public / preview Workers sharing MEDIA)
 *   - verified Cf-Access-Jwt-Assertion (email header alone is forgeable)
 *   - fail closed if CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD are missing
 */
export async function unauthorizedMutationResponse(
	request: Request,
): Promise<Response | null> {
	const isDev = import.meta.env.DEV;
	const accessEnforced = dashboardAccessEnforced();
	if (isDev || !accessEnforced) return null;

	const host = new URL(request.url).host;
	const onDashboard = isDashboardHost(host);
	const jwtConfig = accessJwtConfig();
	const identity =
		onDashboard && jwtConfig ? await verifyAccessJwt(request) : null;

	const decision = decideMutationAuth({
		isDev: false,
		accessEnforced: true,
		isDashboardHost: onDashboard,
		hasJwtConfig: Boolean(jwtConfig),
		hasValidIdentity: Boolean(identity),
	});

	if (decision.allow) return null;

	if (decision.reason === "not-dashboard-host") {
		console.warn("[api-auth] mutation blocked — not a dashboard host");
	} else if (decision.reason === "missing-access-config") {
		console.error(
			"[api-auth] CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD not configured",
		);
	} else if (decision.reason === "invalid-access-jwt") {
		console.warn("[api-auth] mutation blocked — Access JWT invalid or missing");
	}

	return json(
		{
			error: decision.status === 503 ? "Service unavailable" : "Unauthorized",
		},
		decision.status,
	);
}
