/**
 * Video / photo / category validation + revision helpers.
 * Run: node --experimental-strip-types scripts/verify-catalog-mutations.mjs
 */
import {
	assertExpectedRev,
	assertStoredPhoto,
	assertStoredPhotoCategory,
	assertStoredVideo,
	CatalogConflictError,
	expectedRevFromRequest,
} from "../src/lib/catalog-integrity.ts";
import { ClientError } from "../src/lib/api-errors.ts";

function fail(message) {
	console.error(`FAIL: ${message}`);
	process.exitCode = 1;
}

function ok(message) {
	console.log(`ok: ${message}`);
}

const validVideo = {
	slug: "by-chance",
	id: "dQw4w9WgXcQ",
	provider: "youtube",
	category: "indie",
	title: "By Chance",
	url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
	thumbnail: "",
	year: 2024,
	duration: 120,
};

try {
	const video = assertStoredVideo(validVideo);
	if (video.slug !== "by-chance") fail("video slug mismatch");
	else ok("valid video accepted");
} catch (error) {
	fail(`valid video rejected: ${error}`);
}

try {
	assertStoredVideo({ ...validVideo, category: "commercial" });
	fail("legacy commercial category accepted");
} catch (error) {
	if (error instanceof ClientError) ok("invalid video category rejected");
	else fail("wrong error for invalid category");
}

try {
	assertStoredVideo({ ...validVideo, slug: "../etc" });
	fail("path-traversal video slug accepted");
} catch {
	ok("path-traversal video slug rejected");
}

try {
	assertStoredVideo({ ...validVideo, year: 12.5 });
	fail("float year accepted");
} catch {
	ok("float year rejected");
}

const validPhoto = {
	slug: "mg-8600",
	category: "fashion",
	title: "MG 8600",
	alt: "Portrait",
	src: "/media/photos/fashion/mg-8600.webp",
};

try {
	assertStoredPhoto(validPhoto);
	ok("valid photo accepted");
} catch (error) {
	fail(`valid photo rejected: ${error}`);
}

try {
	assertStoredPhoto({ ...validPhoto, category: "Not_Kebab" });
	fail("non-kebab photo category accepted");
} catch {
	ok("non-kebab photo category rejected");
}

try {
	assertStoredPhotoCategory({ slug: "street-photography", label: "Street" });
	ok("valid photo category accepted");
} catch (error) {
	fail(`valid category rejected: ${error}`);
}

try {
	assertStoredPhotoCategory({ slug: "Bad_Slug", label: "X" });
	fail("non-kebab category slug accepted");
} catch {
	ok("non-kebab category slug rejected");
}

const revHeader = expectedRevFromRequest(
	new Request("https://dashboard.example/api/videos", {
		headers: { "If-Match": '"7"' },
	}),
);
if (revHeader !== 7) fail(`If-Match rev parse failed: ${revHeader}`);
else ok("If-Match revision parsed");

const revBody = expectedRevFromRequest(
	new Request("https://dashboard.example/api/videos"),
	{ rev: 4 },
);
if (revBody !== 4) fail(`body rev parse failed: ${revBody}`);
else ok("JSON rev parsed");

try {
	assertExpectedRev(1, 2);
	fail("conflict not thrown");
} catch (error) {
	if (error instanceof CatalogConflictError && error.status === 409)
		ok("catalog conflict is 409");
	else fail("conflict error shape wrong");
}

if (process.exitCode) {
	console.error("catalog mutations verification failed");
	process.exit(1);
}
console.log("catalog mutations verification passed");
