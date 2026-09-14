/**
 * Serialize a value as JSON safe to embed in an HTML
 * `<script type="application/json">` element via set:html.
 *
 * Escapes `<`, `>`, and `&` as JSON unicode escapes so catalog strings
 * (e.g. alt text) cannot terminate the script element. JSON.parse still
 * recovers the original characters.
 */
export function serializeJsonForScript(value: unknown): string {
	return JSON.stringify(value)
		.replace(/</g, "\\u003c")
		.replace(/>/g, "\\u003e")
		.replace(/&/g, "\\u0026");
}
