/**
 * HTTP byte-range parsing (RFC 9110 §14.1.2).
 * Distinguishes absent / invalid / unsatisfiable / valid so callers never
 * treat a bad Range as an implicit full-body response.
 */

export type ByteRangeResult =
	| { kind: "absent" }
	| { kind: "invalid" }
	| { kind: "unsatisfiable" }
	| { kind: "range"; start: number; end: number; length: number };

/**
 * Parse a single `Range` header against a known representation size.
 * Only `bytes=` unit and a single contiguous range are accepted.
 */
export function parseByteRange(
	header: string | null,
	size: number,
): ByteRangeResult {
	if (header == null) return { kind: "absent" };
	const trimmed = header.trim();
	if (!trimmed) return { kind: "absent" };

	// Multiple ranges are not implemented — reject rather than ignore.
	if (trimmed.includes(",")) return { kind: "invalid" };

	const match = /^bytes=(\d*)-(\d*)$/i.exec(trimmed);
	if (!match) return { kind: "invalid" };

	const startRaw = match[1]!;
	const endRaw = match[2]!;
	const hasStart = startRaw !== "";
	const hasEnd = endRaw !== "";
	if (!hasStart && !hasEnd) return { kind: "invalid" };

	if (size <= 0) return { kind: "unsatisfiable" };

	// Suffix form: bytes=-N (last N bytes). bytes=-0 is unsatisfiable.
	if (!hasStart && hasEnd) {
		if (!/^\d+$/.test(endRaw)) return { kind: "invalid" };
		const suffix = Number(endRaw);
		if (!Number.isSafeInteger(suffix) || suffix < 0) return { kind: "invalid" };
		if (suffix === 0) return { kind: "unsatisfiable" };
		const length = Math.min(suffix, size);
		const start = size - length;
		const end = size - 1;
		return { kind: "range", start, end, length };
	}

	if (!/^\d+$/.test(startRaw)) return { kind: "invalid" };
	const start = Number(startRaw);
	if (!Number.isSafeInteger(start) || start < 0) return { kind: "invalid" };
	if (start >= size) return { kind: "unsatisfiable" };

	if (!hasEnd) {
		const end = size - 1;
		return { kind: "range", start, end, length: end - start + 1 };
	}

	if (!/^\d+$/.test(endRaw)) return { kind: "invalid" };
	const end = Number(endRaw);
	if (!Number.isSafeInteger(end) || end < 0) return { kind: "invalid" };
	if (start > end) return { kind: "invalid" };

	const clampedEnd = Math.min(end, size - 1);
	return {
		kind: "range",
		start,
		end: clampedEnd,
		length: clampedEnd - start + 1,
	};
}

export function rangeUnsatisfiableHeaders(size: number): Record<string, string> {
	return {
		"content-range": `bytes */${size}`,
		"accept-ranges": "bytes",
	};
}
