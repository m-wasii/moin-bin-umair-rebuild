import { ClientError } from "./api-errors.ts";

/**
 * Parse a JSON object body. Rejects arrays, primitives, and malformed JSON.
 * Callers map ClientError / SyntaxError into HTTP 400 as needed.
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
 * Optional boolean from JSON / form-like values.
 * Treats "false" / "0" / "no" / "off" as false (unlike Boolean("false")).
 * Returns undefined when the field is absent or empty.
 */
export function parseOptionalBoolean(value: unknown): boolean | undefined {
	if (value == null || value === "") return undefined;
	if (typeof value === "boolean") return value;
	if (typeof value === "number") {
		if (value === 1) return true;
		if (value === 0) return false;
		return undefined;
	}
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (normalized === "true" || normalized === "1" || normalized === "on") {
			return true;
		}
		if (
			normalized === "false" ||
			normalized === "0" ||
			normalized === "off" ||
			normalized === "no"
		) {
			return false;
		}
	}
	return undefined;
}

export function optionalString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}
