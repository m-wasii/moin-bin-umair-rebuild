/**
 * Logic check for dashboard Access gating (mirrors src/middleware.ts + hosts).
 * Run: node scripts/verify-dashboard-auth.mjs
 */

function isPreviewHost(host) {
	const normalized = host.split(":")[0]?.toLowerCase() ?? "";
	return (
		normalized.endsWith(".workers.dev") || normalized.endsWith(".pages.dev")
	);
}

function isDashboardHost(host) {
	const normalized = host.split(":")[0]?.toLowerCase() ?? "";
	return (
		normalized.startsWith("dashboard.") ||
		normalized === "dashboard.localhost" ||
		normalized.startsWith("dashboard.127.0.0.1")
	);
}

/** Same decision as middleware: gate only dashboard hosts in production. */
function shouldRequireAccess({ host, prod, enforce = true }) {
	const onDashboard = isDashboardHost(host);
	if (!(onDashboard && prod)) return false;
	return enforce;
}

const cases = [
	{
		name: "prod dashboard.workers.dev without Access → gated",
		host: "dashboard.wasi-workdesk.workers.dev",
		prod: true,
		expect: true,
		assertPreview: true,
	},
	{
		name: "prod custom dashboard host → gated",
		host: "dashboard.moinbinumair.com",
		prod: true,
		expect: true,
	},
	{
		name: "local dashboard path → not gated",
		host: "127.0.0.1:4321",
		prod: false,
		expect: false,
	},
	{
		name: "PR preview /dashboard → not gated (not dashboard host)",
		host: "mbu-pr-26.wasi-workdesk.workers.dev",
		prod: true,
		expect: false,
		assertPreview: true,
	},
	{
		name: "public site host → not gated",
		host: "mbu.wasi-workdesk.workers.dev",
		prod: true,
		expect: false,
	},
	{
		name: "enforce disabled → not gated",
		host: "dashboard.wasi-workdesk.workers.dev",
		prod: true,
		enforce: false,
		expect: false,
	},
	{
		name: "OLD BUG: must not skip auth just because host is *.workers.dev",
		host: "dashboard.wasi-workdesk.workers.dev",
		prod: true,
		expect: true,
		oldBuggyCheck(host) {
			const onDashboard = isDashboardHost(host);
			const preview = isPreviewHost(host);
			const protectDashboard = onDashboard && true;
			return protectDashboard && !preview; // buggy: always false on workers.dev
		},
	},
];

let failed = 0;
for (const c of cases) {
	const preview = isPreviewHost(c.host);
	if (c.assertPreview && !preview) {
		console.error(`FAIL ${c.name}: expected isPreviewHost=true`);
		failed++;
		continue;
	}
	if (c.oldBuggyCheck) {
		const buggy = c.oldBuggyCheck(c.host);
		const fixed = shouldRequireAccess({
			host: c.host,
			prod: c.prod,
			enforce: c.enforce,
		});
		if (buggy !== false) {
			console.error(`FAIL ${c.name}: expected old buggy check to be false`);
			failed++;
			continue;
		}
		if (fixed !== true) {
			console.error(`FAIL ${c.name}: fixed check should gate`);
			failed++;
			continue;
		}
		console.log(`ok  ${c.name}`);
		continue;
	}
	const got = shouldRequireAccess({
		host: c.host,
		prod: c.prod,
		enforce: c.enforce,
	});
	if (got !== c.expect) {
		console.error(
			`FAIL ${c.name}: got ${got}, expected ${c.expect} (preview=${preview})`,
		);
		failed++;
		continue;
	}
	console.log(`ok  ${c.name}`);
}

if (failed) {
	console.error(`\n${failed} case(s) failed`);
	process.exit(1);
}
console.log("\nAll dashboard auth cases passed.");
