/** Append or replace a `?v=` cache-busting query on a media path. */
export function withMediaVersion(path: string, version: string) {
	const trimmed = version.trim();
	if (!trimmed) return path;

	const qIndex = path.indexOf("?");
	const base = qIndex === -1 ? path : path.slice(0, qIndex);
	const params = new URLSearchParams(
		qIndex === -1 ? "" : path.slice(qIndex + 1),
	);
	params.set("v", trimmed);
	return `${base}?${params.toString()}`;
}

export function mediaVersionFromBytes(bytes: Uint8Array) {
	// FNV-1a 32-bit — short, stable fingerprint for upload cache-busting.
	let hash = 0x811c9dc5;
	const step = Math.max(1, Math.floor(bytes.length / 4096));
	for (let i = 0; i < bytes.length; i += step) {
		hash ^= bytes[i]!;
		hash = Math.imul(hash, 0x01000193);
	}
	hash ^= bytes.length;
	return (hash >>> 0).toString(36);
}

export function newMediaVersion() {
	return Date.now().toString(36);
}
