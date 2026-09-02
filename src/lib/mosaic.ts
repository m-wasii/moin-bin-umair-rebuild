export type MosaicSpan = 3 | 4 | 5 | 6 | 7 | 8 | 12;

const PAIR_SPANS: Array<[MosaicSpan, MosaicSpan]> = [
	[7, 5],
	[5, 7],
	[8, 4],
	[4, 8],
];

const TRIPLE_SPANS: Array<[MosaicSpan, MosaicSpan, MosaicSpan]> = [
	[5, 4, 3],
	[3, 5, 4],
	[4, 3, 5],
];

export function mosaicRowSizes(count: number): number[] {
	if (count <= 0) return [];
	if (count === 1) return [1];
	if (count === 2) return [2];
	if (count === 3) return [3];
	if (count === 4) return [2, 2];

	if (count % 2 === 1) {
		const pairCount = (count - 3) / 2;
		const pairsBefore = pairCount <= 1 ? 0 : 1;
		const rows: number[] = [];

		for (let index = 0; index < pairsBefore; index += 1) rows.push(2);
		rows.push(3);
		for (let index = 0; index < pairCount - pairsBefore; index += 1) {
			rows.push(2);
		}

		return rows;
	}

	return Array.from({ length: count / 2 }, () => 2);
}

export function mosaicSpans(count: number): MosaicSpan[] {
	const rows = mosaicRowSizes(count);
	const spans: MosaicSpan[] = [];
	let pairIndex = 0;
	let tripleIndex = 0;

	for (const size of rows) {
		if (size === 1) {
			spans.push(12);
			continue;
		}

		if (size === 2) {
			const pair = PAIR_SPANS[pairIndex % PAIR_SPANS.length];
			spans.push(pair[0], pair[1]);
			pairIndex += 1;
			continue;
		}

		const triple = TRIPLE_SPANS[tripleIndex % TRIPLE_SPANS.length];
		spans.push(triple[0], triple[1], triple[2]);
		tripleIndex += 1;
	}

	return spans;
}
