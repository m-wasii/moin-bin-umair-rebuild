/**
 * Catalog mutation auth + revision contracts used by video/photo/album APIs.
 * Complements verify-catalog-mutations.mjs with reorder / conflict baselines.
 * Run: node --experimental-strip-types scripts/verify-catalog-api-contracts.mjs
 */
import {
	assertCompleteSlugOrder,
	assertExpectedRev,
	assertStoredPhoto,
	assertStoredPhotoCategory,
	assertStoredVideo,
	CatalogConflictError,
	classifyCatalogList,
	expectedRevFromRequest,
} from "../src/lib/catalog-integrity.ts";
import { decideMutationAuth } from "../src/lib/mutation-auth-policy.ts";
import { ClientError } from "../src/lib/api-errors.ts";

function fail(message) {
	console.error(`FAIL: ${message}`);
	process.exitCode = 1;
}

function ok(message) {
	console.log(`ok: ${message}`);
}

/** Authenticated mutation path (dashboard + JWT). */
{
	const decision = decideMutationAuth({
		isDev: false,
		accessEnforced: true,
		isDashboardHost: true,
		hasJwtConfig: true,
		hasValidIdentity: true,
	});
	if (decision.allow) ok("authenticated mutation allowed");
	else fail("authenticated mutation blocked");
}

/** Unauthorized mutation paths. */
{
	const publicHost = decideMutationAuth({
		isDev: false,
		accessEnforced: true,
		isDashboardHost: false,
		hasJwtConfig: true,
		hasValidIdentity: true,
	});
	if (!publicHost.allow && publicHost.status === 401)
		ok("unauthorized public-host mutation → 401");
	else fail("public-host mutation should 401");

	const noJwt = decideMutationAuth({
		isDev: false,
		accessEnforced: true,
		isDashboardHost: true,
		hasJwtConfig: true,
		hasValidIdentity: false,
	});
	if (!noJwt.allow && noJwt.status === 401)
		ok("unauthorized missing JWT → 401");
	else fail("missing JWT should 401");
}

/** Catalog revision handling. */
{
	assertExpectedRev(3, 3);
	ok("matching rev accepted");

	try {
		assertExpectedRev(3, 2);
		fail("stale rev accepted");
	} catch (error) {
		if (error instanceof CatalogConflictError) ok("stale rev → 409 conflict");
		else fail("stale rev wrong error");
	}

	assertExpectedRev(9, undefined);
	ok("omitted rev skips client CAS check");

	const fromHeader = expectedRevFromRequest(
		new Request("https://dashboard.example/api/photos", {
			headers: { "If-Match": "5" },
		}),
	);
	if (fromHeader === 5) ok("If-Match drives expected rev");
	else fail(`If-Match parse: ${fromHeader}`);
}

/** Video / photo / album (category) validation baselines. */
{
	assertStoredVideo({
		slug: "test-clip",
		id: "abc123",
		provider: "vimeo",
		category: "indie",
		title: "Test",
		url: "https://vimeo.com/1",
		thumbnail: "",
		year: 2024,
		duration: 30,
	});
	ok("video CRUD shape accepted");

	assertStoredPhoto({
		slug: "still-1",
		category: "fashion",
		title: "Still",
		alt: "Still alt",
		src: "/media/photos/fashion/still-1.webp",
	});
	ok("photo CRUD shape accepted");

	assertStoredPhotoCategory({ slug: "fashion", label: "Fashion" });
	ok("album/category shape accepted");
}

/** Album / video reorder contract. */
{
	const order = assertCompleteSlugOrder(
		["a", "b", "c"],
		["c", "a", "b"],
		"videos",
	);
	if (order.join(",") === "c,a,b") ok("video reorder complete permutation");
	else fail("reorder permutation wrong");

	try {
		assertCompleteSlugOrder(["a", "b"], ["a"], "photos");
		fail("partial reorder accepted");
	} catch (error) {
		if (error instanceof ClientError) ok("partial reorder rejected");
		else fail("partial reorder wrong error");
	}

	try {
		assertCompleteSlugOrder(["a", "b"], ["a", "b", "ghost"], "photos");
		fail("unknown slug accepted");
	} catch (error) {
		if (error instanceof ClientError) ok("unknown reorder slug rejected");
		else fail("unknown slug wrong error");
	}
}

/** Empty vs missing catalog semantics (seed vs intentional empty). */
{
	const missing = classifyCatalogList(false, undefined);
	if (missing.kind === "missing") ok("missing catalog → seed bootstrap");
	else fail("missing classification wrong");

	const empty = classifyCatalogList(true, []);
	if (empty.kind === "present" && empty.items.length === 0)
		ok("present empty array is intentional");
	else fail("empty array should stay present");
}

if (process.exitCode) {
	console.error("catalog API contract verification failed");
	process.exit(1);
}
console.log("catalog API contract verification passed");
