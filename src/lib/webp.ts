const WEBP_CHUNK_TYPES = new Set([
	"VP8 ",
	"VP8L",
	"VP8X",
	"ANIM",
	"ANMF",
	"ALPH",
	"ICCP",
	"EXIF",
	"XMP ",
]);

function readFourCc(bytes: Uint8Array, offset: number) {
	if (offset + 4 > bytes.length) return null;
	return String.fromCharCode(
		bytes[offset]!,
		bytes[offset + 1]!,
		bytes[offset + 2]!,
		bytes[offset + 3]!,
	);
}

function readUint32Le(bytes: Uint8Array, offset: number) {
	return (
		(bytes[offset]! |
			(bytes[offset + 1]! << 8) |
			(bytes[offset + 2]! << 16) |
			(bytes[offset + 3]! << 24)) >>>
		0
	);
}

/**
 * Structural WebP check (RIFF/WEBP + at least one known chunk).
 * Does not decode pixels; rejects non-WebP RIFF containers and truncated files.
 */
export function isValidWebp(bytes: Uint8Array): boolean {
	if (bytes.length < 20) return false;
	if (readFourCc(bytes, 0) !== "RIFF") return false;
	if (readFourCc(bytes, 8) !== "WEBP") return false;

	const riffSize = readUint32Le(bytes, 4);
	// RIFF size is bytes after the size field; total file = riffSize + 8.
	const declaredLength = riffSize + 8;
	if (declaredLength < 20 || declaredLength > bytes.length) return false;

	let offset = 12;
	let sawBitstream = false;

	while (offset + 8 <= declaredLength) {
		const type = readFourCc(bytes, offset);
		if (!type || !WEBP_CHUNK_TYPES.has(type)) return false;

		const chunkSize = readUint32Le(bytes, offset + 4);
		const payloadStart = offset + 8;
		const payloadEnd = payloadStart + chunkSize;
		if (payloadEnd > declaredLength) return false;

		// Require a real image bitstream (VP8/VP8L) or animation frame (ANMF).
		if (type === "VP8 " || type === "VP8L" || type === "ANMF") {
			sawBitstream = true;
		}

		// Chunks are padded to even length.
		offset = payloadEnd + (chunkSize & 1);
	}

	if (offset !== declaredLength) return false;
	return sawBitstream;
}
