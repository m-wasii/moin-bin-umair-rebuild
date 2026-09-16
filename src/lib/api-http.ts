import { ClientError } from "./api-errors.ts";
import { readJsonObject } from "./request-body.ts";
import {
	waitUntilFromLocals,
	type SiteCacheRefreshOptions,
} from "./site-cache.ts";

/** JSON response used by catalog mutation APIs (no cache-control overrides). */
export function jsonResponse(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json; charset=utf-8" },
	});
}

/** Cache refresh options for catalog saves triggered by a dashboard request. */
export function mutationCacheOpts(
	request: Request,
	locals: App.Locals,
): SiteCacheRefreshOptions {
	return {
		requestUrl: new URL(request.url),
		waitUntil: waitUntilFromLocals(locals),
	};
}

/** Parse a JSON object body or return a 400 response. */
export async function readMutationJsonBody(request: Request) {
	try {
		return { ok: true as const, body: await readJsonObject(request) };
	} catch (error) {
		const message =
			error instanceof ClientError ? error.message : "Invalid JSON";
		return {
			ok: false as const,
			response: jsonResponse({ error: message }, 400),
		};
	}
}
