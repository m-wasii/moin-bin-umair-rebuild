/**
 * Pure mutation-auth policy (no Worker bindings / JWT crypto).
 * Mirrors the decision tree in api-auth.ts for deterministic tests.
 */

export type MutationAuthDecision =
	{ allow: true } | { allow: false; status: 401 | 503; reason: string };

export function decideMutationAuth(input: {
	isDev: boolean;
	accessEnforced: boolean;
	isDashboardHost: boolean;
	hasJwtConfig: boolean;
	hasValidIdentity: boolean;
}): MutationAuthDecision {
	if (input.isDev) return { allow: true };
	if (!input.accessEnforced) return { allow: true };
	if (!input.isDashboardHost) {
		return { allow: false, status: 401, reason: "not-dashboard-host" };
	}
	if (!input.hasJwtConfig) {
		return { allow: false, status: 503, reason: "missing-access-config" };
	}
	if (!input.hasValidIdentity) {
		return { allow: false, status: 401, reason: "invalid-access-jwt" };
	}
	return { allow: true };
}
