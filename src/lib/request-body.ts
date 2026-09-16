import { ClientError } from "./api-errors.ts";

/**
 * Parse a JSON object body. Rejects arrays, primitives, and malformed JSON.
 * Callers map ClientError into HTTP 400 as needed.
 */
export async function readJsonObject(
	request: Request,
): Promise<Record<string, unknown>> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		throw new ClientError("Invalid JSON");
	}
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
		throw new ClientError("Invalid JSON");
	}
	return raw as Record<string, unknown>;
}

/**
 * Optional boolean for JSON mutation bodies.
 * Accepts real booleans and the strings "true" / "false" only
 * (so `"false"` is never treated as true the way Boolean("false") is).
 * Returns undefined when the field is absent, empty, or not a recognized value.
 */
export function parseOptionalBoolean(value: unknown): boolean | undefined {
	if (value == null || value === "") return undefined;
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (normalized === "true") return true;
		if (normalized === "false") return false;
	}
	return undefined;
}

export function optionalString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}
