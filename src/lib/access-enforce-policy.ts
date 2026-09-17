/**
 * Pure Access-enforcement policy (no Worker bindings).
 *
 * Production must not be opened by a single mis-set flag.
 * Disabling enforcement requires both:
 *   DASHBOARD_ENFORCE_CF_ACCESS=false
 *   ALLOW_INSECURE_DASHBOARD_BRINGUP=true
 */

export interface AccessEnforceDecision {
	enforced: boolean;
	/** True when enforce=false was ignored because the second flag was missing. */
	rejectedInsecureDisable: boolean;
}

export function decideAccessEnforced(input: {
	enforceFlag?: string | null;
	allowInsecureBringUp?: string | null;
}): AccessEnforceDecision {
	if (input.enforceFlag !== "false") {
		return { enforced: true, rejectedInsecureDisable: false };
	}
	if (input.allowInsecureBringUp === "true") {
		return { enforced: false, rejectedInsecureDisable: false };
	}
	return { enforced: true, rejectedInsecureDisable: true };
}
