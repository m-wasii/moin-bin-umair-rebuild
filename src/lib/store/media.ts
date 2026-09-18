import {
	assertSafeObjectKey,
	deleteLocal,
	getBucket,
	guessMediaContentType,
	localPath,
	readLocalBytes,
	writeLocalBytes,
} from "./bucket";
import type { MediaHead, StoredMediaBody } from "./types";

async function mediaBodyToBytes(body: StoredMediaBody): Promise<Uint8Array> {
	if (body.body instanceof Uint8Array) return body.body;
	return new Uint8Array(await new Response(body.body).arrayBuffer());
}

async function readLocalMediaBody(
	key: string,
): Promise<StoredMediaBody | null> {
	const local = await readLocalBytes(key);
	if (!local) return null;
	return {
		body: new Uint8Array(local),
		size: local.byteLength,
		contentType: guessMediaContentType(key),
	};
}

/**
 * R2 / local `.data/media` object (e.g. `media/hero-loop.mp4`).
 * Prefers streaming the R2 body; buffers only for local DEV or when size is unknown.
 *
 * Fallback rules:
 * - R2 hit → stream/buffer from R2
 * - R2 miss → try local `.data/media` (works in `astro dev`; no-op on Workers)
 * - No R2 binding in production → log misconfiguration, return null
 * - No R2 binding in DEV → local only
 */
export async function getMediaObject(
	key: string,
): Promise<StoredMediaBody | null> {
	const safeKey = assertSafeObjectKey(key);
	const bucket = getBucket();
	if (bucket) {
		const object = await bucket.get(safeKey);
		if (object) {
			const contentType =
				object.httpMetadata?.contentType || guessMediaContentType(safeKey);

			if (object.body) {
				const size =
					typeof object.size === "number"
						? object.size
						: (await bucket.head?.(safeKey))?.size;
				if (typeof size === "number") {
					return { body: object.body, size, contentType };
				}
			}

			const bytes = new Uint8Array(await object.arrayBuffer());
			return {
				body: bytes,
				size: bytes.byteLength,
				contentType,
			};
		}
		return readLocalMediaBody(safeKey);
	}

	if (!import.meta.env.DEV) {
		console.error(
			`[store] MEDIA binding missing; cannot read media object ${safeKey}`,
		);
		return null;
	}

	return readLocalMediaBody(safeKey);
}

async function localMediaHead(key: string): Promise<MediaHead | null> {
	try {
		const { stat } = await import("node:fs/promises");
		const info = await stat(await localPath(key));
		return {
			size: info.size,
			uploaded: info.mtime,
			httpMetadata: { contentType: guessMediaContentType(key) },
		};
	} catch {
		return null;
	}
}

export async function getMediaHead(key: string): Promise<MediaHead | null> {
	const safeKey = assertSafeObjectKey(key);
	const bucket = getBucket();
	if (bucket) {
		if (bucket.head) {
			const head = await bucket.head(safeKey);
			if (head) return head;
		} else {
			const object = await bucket.get(safeKey);
			if (object) {
				if (typeof object.size === "number") {
					return {
						size: object.size,
						etag: object.etag,
						uploaded: object.uploaded,
						httpMetadata: object.httpMetadata,
					};
				}
				const bytes = await object.arrayBuffer();
				return {
					size: bytes.byteLength,
					etag: object.etag,
					uploaded: object.uploaded,
					httpMetadata: object.httpMetadata,
				};
			}
		}
		return localMediaHead(safeKey);
	}

	if (!import.meta.env.DEV) return null;
	return localMediaHead(safeKey);
}

async function localMediaRange(
	key: string,
	offset: number,
	length: number,
): Promise<StoredMediaBody | null> {
	try {
		const { open } = await import("node:fs/promises");
		const handle = await open(await localPath(key), "r");
		try {
			const bytes = new Uint8Array(length);
			const { bytesRead } = await handle.read(bytes, 0, length, offset);
			return {
				body: bytes.subarray(0, bytesRead),
				size: bytesRead,
				contentType: guessMediaContentType(key),
			};
		} finally {
			await handle.close();
		}
	} catch {
		return null;
	}
}

export async function getMediaRange(
	key: string,
	offset: number,
	length: number,
): Promise<StoredMediaBody | null> {
	const safeKey = assertSafeObjectKey(key);
	const bucket = getBucket();
	if (bucket) {
		const object = await bucket.get(safeKey, {
			range: { offset, length },
		});
		if (object) {
			const contentType =
				object.httpMetadata?.contentType || guessMediaContentType(safeKey);
			if (object.body) {
				return { body: object.body, size: length, contentType };
			}
			const bytes = new Uint8Array(await object.arrayBuffer());
			return {
				body: bytes,
				size: bytes.byteLength,
				contentType,
			};
		}
		return localMediaRange(safeKey, offset, length);
	}

	if (!import.meta.env.DEV) return null;
	return localMediaRange(safeKey, offset, length);
}

/** Write an opaque media object (hero loop/poster, etc.). */
export async function putMediaBytes(
	key: string,
	bytes: Uint8Array,
	contentType?: string,
) {
	const safeKey = assertSafeObjectKey(key);
	const type = contentType || guessMediaContentType(safeKey);
	const bucket = getBucket();
	if (bucket) {
		await bucket.put(safeKey, bytes, {
			httpMetadata: { contentType: type },
		});
		return;
	}
	await writeLocalBytes(safeKey, bytes);
}

/** Delete an opaque media object (best-effort for callers that ignore miss). */
export async function deleteMediaBytes(key: string) {
	const safeKey = assertSafeObjectKey(key);
	const bucket = getBucket();
	if (bucket) {
		await bucket.delete(safeKey);
		return;
	}
	await deleteLocal(safeKey);
}

/**
 * Copy an opaque media object to another key.
 * Returns false when the source is missing.
 */
export async function copyMediaBytes(
	fromKey: string,
	toKey: string,
	contentType?: string,
): Promise<boolean> {
	const source = await getMediaObject(fromKey);
	if (!source) return false;
	const bytes = await mediaBodyToBytes(source);
	await putMediaBytes(
		toKey,
		bytes,
		contentType || source.contentType || guessMediaContentType(fromKey),
	);
	return true;
}
