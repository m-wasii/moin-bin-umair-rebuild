/**
 * Resolve Cloudflare ExecutionContext.waitUntil from Astro locals.
 * @astrojs/cloudflare populates `locals.cfContext` in the Worker entrypoint.
 */
export function waitUntilFromLocals(
	locals: App.Locals | undefined,
): ((promise: Promise<unknown>) => void) | undefined {
	if (!locals) return undefined;
	const cfContext = (
		locals as { cfContext?: { waitUntil?: (p: Promise<unknown>) => void } }
	).cfContext;
	const waitUntil = cfContext?.waitUntil;
	if (typeof waitUntil !== "function") return undefined;
	return waitUntil.bind(cfContext);
}
