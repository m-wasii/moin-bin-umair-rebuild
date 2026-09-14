import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "cloudflare:workers";

export interface AccessJwtConfig {
	/** Issuer URL, e.g. https://myteam.cloudflareaccess.com */
	issuer: string;
	aud: string;
}

function readBinding(name: "CF_ACCESS_TEAM_DOMAIN" | "CF_ACCESS_AUD") {
	const fromEnv = (env as Record<string, string | undefined>)[name];
	const fromMeta = import.meta.env[name];
	const raw = typeof fromEnv === "string" ? fromEnv : fromMeta;
	return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Access application config for JWT verification.
 * Both values are required in production when Access is enforced.
 */
export function accessJwtConfig(): AccessJwtConfig | null {
	const team = readBinding("CF_ACCESS_TEAM_DOMAIN");
	const aud = readBinding("CF_ACCESS_AUD");
	if (!team || !aud) return null;
	const issuer = team.startsWith("https://")
		? team.replace(/\/$/, "")
		: `https://${team.replace(/\/$/, "")}`;
	return { issuer, aud };
}

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksForIssuer(issuer: string) {
	let jwks = jwksByIssuer.get(issuer);
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
		jwksByIssuer.set(issuer, jwks);
	}
	return jwks;
}

/**
 * Cryptographically verify Cf-Access-Jwt-Assertion.
 * Do not trust cf-access-authenticated-user-email alone — it is forgeable
 * when Access is not terminating the request.
 */
export async function verifyAccessJwt(
	request: Request,
): Promise<{ email: string } | null> {
	const config = accessJwtConfig();
	if (!config) return null;

	const token = request.headers.get("cf-access-jwt-assertion")?.trim();
	if (!token) return null;

	try {
		const { payload } = await jwtVerify(token, jwksForIssuer(config.issuer), {
			issuer: config.issuer,
			audience: config.aud,
		});
		const email = typeof payload.email === "string" ? payload.email.trim() : "";
		if (!email) return null;
		return { email };
	} catch (error) {
		console.error("[access-jwt] verification failed", error);
		return null;
	}
}
