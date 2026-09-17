/**
 * Pure purge→warm sequencing (no network).
 * Warm must not run after a failed purge — that re-caches stale HTML.
 */

export interface PurgeThenWarmResult {
	purged: boolean;
	warmed: boolean;
}

export async function runPurgeThenWarm(options: {
	purge: () => Promise<void>;
	warm: () => Promise<void>;
	onPurgeError?: (error: unknown) => void;
	onWarmError?: (error: unknown) => void;
	onSkipWarmAfterPurgeFailure?: () => void;
}): Promise<PurgeThenWarmResult> {
	try {
		await options.purge();
	} catch (error) {
		options.onPurgeError?.(error);
		options.onSkipWarmAfterPurgeFailure?.();
		return { purged: false, warmed: false };
	}

	try {
		await options.warm();
		return { purged: true, warmed: true };
	} catch (error) {
		options.onWarmError?.(error);
		return { purged: true, warmed: false };
	}
}
