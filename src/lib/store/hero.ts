import { withMediaVersion } from "../media-url";
import type { SiteCacheRefreshOptions } from "../site-cache";
import { readCatalogRecord, writeCatalogRecord } from "./catalog";
import { getMediaHead } from "./media";
import type { CatalogRevision, MediaHead } from "./types";
import { HERO_META_KEY } from "./types";

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
		getMediaHead("media/hero-loop.mp4"),
		getMediaHead("media/hero-poster.webp"),
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

/** Persist hero version + purge/warm when hero bytes are replaced. */
export async function touchHeroMedia(
	version = Date.now().toString(36),
	cache?: SiteCacheRefreshOptions,
) {
	const current = await readHeroMeta();
	const revision = current?.revision ?? { rev: 0, found: false };
	const payload: HeroCatalogPayload = { v: version };
	await writeCatalogRecord(
		HERO_META_KEY,
		payload as Record<string, unknown>,
		revision,
		cache,
	);
}
