/**
 * Prevent accidental production / remote R2 / Worker ops.
 *
 * Usage:
 *   import { requireScriptTarget } from "./lib/target-guard.mjs";
 *   const target = requireScriptTarget({
 *     script: "seed-r2",
 *     allow: ["development", "preview", "production"],
 *     remote: true,
 *   });
 *
 * Flags:
 *   --target development|preview|production
 *   --i-know-this-is-production   (required when --target production)
 *   --origin <url>               (optional; required for some callers)
 */

const PRODUCTION_WORKER_NAMES = new Set(["mbu", "dashboard"]);

export function argValue(argv, flag) {
	const index = argv.indexOf(flag);
	if (index === -1) return null;
	return argv[index + 1] ?? null;
}

export function hasFlag(argv, flag) {
	return argv.includes(flag);
}

export function isPreviewWorkerName(name) {
	return /^mbu-pr-[1-9][0-9]*$/.test(name);
}

export function assertSafePreviewWorkerName(name) {
	if (PRODUCTION_WORKER_NAMES.has(name)) {
		throw new Error(`Refusing to operate on production Worker name "${name}".`);
	}
	if (!isPreviewWorkerName(name)) {
		throw new Error(
			`Unsafe or unexpected preview Worker name "${name}". Expected mbu-pr-<number>.`,
		);
	}
	return name;
}

/**
 * @param {{
 *   script: string;
 *   argv?: string[];
 *   allow?: Array<"development"|"preview"|"production">;
 *   remote?: boolean;
 *   requireOrigin?: boolean;
 * }} options
 */
export function requireScriptTarget(options) {
	const argv = options.argv ?? process.argv;
	const allow = options.allow ?? ["development", "preview", "production"];
	const script = options.script;
	const target = (argValue(argv, "--target") || "").toLowerCase();

	if (!target || !allow.includes(target)) {
		const allowed = allow.join("|");
		console.error(
			[
				`${script}: missing or invalid --target.`,
				`Usage: node scripts/${script}.mjs --target ${allowed} [options]`,
				"",
				"Targets:",
				"  development  local / non-remote work",
				"  preview      PR / preview Worker or bucket ops",
				"  production   live mbu / dashboard / moin-media (requires confirmation)",
				"",
				"Production also requires: --i-know-this-is-production",
			].join("\n"),
		);
		process.exit(1);
	}

	if (target === "production") {
		if (!hasFlag(argv, "--i-know-this-is-production")) {
			console.error(
				[
					`${script}: refusing production target without confirmation.`,
					"Re-run with: --target production --i-know-this-is-production",
				].join("\n"),
			);
			process.exit(1);
		}
	}

	if (options.remote && target === "development") {
		console.error(
			`${script}: --target development cannot perform remote Worker/R2 writes.`,
		);
		process.exit(1);
	}

	const origin = argValue(argv, "--origin");
	if (options.requireOrigin && !origin) {
		console.error(
			`${script}: --origin <https://…> is required for target "${target}".`,
		);
		process.exit(1);
	}

	return { target, origin, argv };
}
