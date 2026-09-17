import { withMediaVersion } from "../media-url";
import type { SiteCacheRefreshOptions } from "../site-cache";
import { readCatalogRecord, writeCatalogRecord, type WriteCatalogResult } from "./catalog";
import { getMediaHead } from "./media";
import type { CatalogRevision, MediaHead } from "./types";
import { HERO_META_KEY } from "./types";

export const HERO_LOOP_KEY = "media/hero-loop.mp4";
export const HERO_POSTER_KEY = "media/hero-poster.webp";

interface HeroCatalogPayload {
	v?: string;
	rev?: number;
}

function versionFromMediaHead(head: MediaHead | null) {
	if (!head) return "1";
	if (head.etag) return head.etag.replace(/"/g, "");
	if (head.uploaded) return String(head.uploaded.getTime());
	return String(head.size || "1");
}

/**
 * Cache-bust query for hero poster/loop.
 * Object etags always participate so replacing bytes cannot leave a sticky
 * catalog `v` pointing at obsolete immutable URLs forever.
 */
export async function heroMediaVersion() {
	const meta = await readHeroMeta();
	const [loop, poster] = await Promise.all([
		getMediaHead(HERO_LOOP_KEY),
		getMediaHead(HERO_POSTER_KEY),
	]);
	const objectVersion = `${versionFromMediaHead(loop)}-${versionFromMediaHead(poster)}`;
	const catalogV = meta?.payload.v?.trim();
	return catalogV ? `${catalogV}-${objectVersion}` : objectVersion;
}

export function heroMediaSrc(
	file: "hero-loop.mp4" | "hero-poster.webp",
	version: string,
) {
	return withMediaVersion(`/media/${file}`, version);
}

async function readHeroMeta(): Promise<{
	payload: HeroCatalogPayload;
	revision: CatalogRevision;
} | null> {
	const { payload, revision } = await readCatalogRecord(HERO_META_KEY);
	if (!revision.found) return null;
	return {
		payload: payload as HeroCatalogPayload,
		revision,
	};
}

export async function readHeroCatalog(): Promise<{
	revision: CatalogRevision;
	catalogVersion: string | null;
	loop: MediaHead | null;
	poster: MediaHead | null;
	mediaVersion: string;
	loopSrc: string | null;
	posterSrc: string | null;
}> {
	const meta = await readHeroMeta();
	const [loop, poster, mediaVersion] = await Promise.all([
		getMediaHead(HERO_LOOP_KEY),
		getMediaHead(HERO_POSTER_KEY),
		heroMediaVersion(),
	]);
	return {
		revision: meta?.revision ?? { rev: 0, found: false },
		catalogVersion: meta?.payload.v?.trim() || null,
		loop,
		poster,
		mediaVersion,
		loopSrc: loop ? heroMediaSrc("hero-loop.mp4", mediaVersion) : null,
		posterSrc: poster ? heroMediaSrc("hero-poster.webp", mediaVersion) : null,
	};
}

/**
 * Persist hero version + purge/warm when hero bytes are replaced.
 * Accepts an expected revision for CAS when the client supplies one.
 */
export async function touchHeroMedia(
	version = Date.now().toString(36),
	cache?: SiteCacheRefreshOptions,
	expected?: CatalogRevision,
): Promise<WriteCatalogResult> {
	const current = await readHeroMeta();
	const revision =
		expected ?? current?.revision ?? ({ rev: 0, found: false } as CatalogRevision);
	const payload: HeroCatalogPayload = { v: version };
	return writeCatalogRecord(
		HERO_META_KEY,
		payload as Record<string, unknown>,
		revision,
		cache,
	);
}
