import { env } from "cloudflare:workers";
import { decideAccessEnforced } from "../access-enforce-policy";
import { isSafeStorageSegment } from "../catalog-integrity";
import type { MediaBucket } from "./types";

export function workerEnv() {
	return env as {
		MEDIA?: MediaBucket;
		YOUTUBE_API_KEY?: string;
		CDN_PURGE_SECRET?: string;
		DASHBOARD_ENFORCE_CF_ACCESS?: string;
		/** Required together with DASHBOARD_ENFORCE_CF_ACCESS=false for insecure bring-up. */
		ALLOW_INSECURE_DASHBOARD_BRINGUP?: string;
	};
}

export function getBucket(): MediaBucket | undefined {
	return workerEnv().MEDIA;
}

/** True when R2 is bound, or local `.data` writes are allowed in DEV. */
export function hasWritableMedia() {
	return Boolean(getBucket()) || import.meta.env.DEV;
}

/**
 * Reject path traversal / absolute paths in storage keys.
 * Each `/`-separated segment must be a safe storage segment.
 */
export function assertSafeObjectKey(key: string): string {
	const trimmed = key.trim();
	if (
		!trimmed ||
		trimmed.startsWith("/") ||
		trimmed.includes("\\") ||
		trimmed.includes("\0") ||
		trimmed.includes("//")
	) {
		throw new Error("Invalid storage key.");
	}
	const parts = trimmed.split("/");
	if (parts.length === 0 || parts.some((part) => !isSafeStorageSegment(part))) {
		throw new Error("Invalid storage key.");
	}
	return trimmed;
}

export function guessMediaContentType(key: string) {
	const lower = key.toLowerCase();
	if (lower.endsWith(".webp")) return "image/webp";
	if (lower.endsWith(".mp4")) return "video/mp4";
	if (lower.endsWith(".json")) return "application/json";
	return "application/octet-stream";
}

export async function localPath(key: string) {
	const { join } = await import("node:path");
	return join(process.cwd(), ".data", "media", key);
}

export async function readLocalJson<T>(key: string): Promise<T | null> {
	try {
		const { readFile } = await import("node:fs/promises");
		const raw = await readFile(await localPath(key), "utf8");
		return JSON.parse(raw) as T;
	} catch {
		// Missing local DEV media files are expected before seeding.
		return null;
	}
}

export async function writeLocalJson(key: string, value: unknown) {
	if (!import.meta.env.DEV) {
		throw new Error(
			"Media storage is not configured (missing R2 binding MEDIA).",
		);
	}
	const { mkdir, writeFile } = await import("node:fs/promises");
	const { dirname } = await import("node:path");
	const path = await localPath(key);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(value, null, "\t")}\n`);
}

export async function readLocalBytes(key: string) {
	try {
		const { readFile } = await import("node:fs/promises");
		return await readFile(await localPath(key));
	} catch {
		// Missing local DEV media files are expected before seeding.
		return null;
	}
}

export async function writeLocalBytes(key: string, bytes: Uint8Array) {
	if (!import.meta.env.DEV) {
		throw new Error(
			"Media storage is not configured (missing R2 binding MEDIA).",
		);
	}
	const { mkdir, writeFile } = await import("node:fs/promises");
	const { dirname } = await import("node:path");
	const path = await localPath(key);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, bytes);
}

export async function deleteLocal(key: string) {
	if (!import.meta.env.DEV) return;
	try {
		const { unlink } = await import("node:fs/promises");
		await unlink(await localPath(key));
	} catch {
		// Ignore missing files during local DEV cleanup.
	}
}

/** Serialize local catalog mutations per key (dev / single-process). */
const localCatalogLocks = new Map<string, Promise<void>>();

export async function withLocalCatalogLock<T>(
	key: string,
	fn: () => Promise<T>,
): Promise<T> {
	const previous = localCatalogLocks.get(key) ?? Promise.resolve();
	const { promise: done, resolve: release } = Promise.withResolvers<void>();
	const chain = previous.then(() => done);
	localCatalogLocks.set(key, chain);
	await previous.catch(() => undefined);
	try {
		return await fn();
	} finally {
		release();
		if (localCatalogLocks.get(key) === chain) {
			localCatalogLocks.delete(key);
		}
	}
}

export function youtubeApiKey() {
	return workerEnv().YOUTUBE_API_KEY || import.meta.env.YOUTUBE_API_KEY;
}

/**
 * Whether Cloudflare Access must be enforced for dashboard/mutations.
 * Defaults to enforced. Disabling requires both Worker vars:
 *   DASHBOARD_ENFORCE_CF_ACCESS=false
 *   ALLOW_INSECURE_DASHBOARD_BRINGUP=true
 */
export function dashboardAccessEnforced() {
	const envBindings = workerEnv();
	const decision = decideAccessEnforced({
		enforceFlag: envBindings.DASHBOARD_ENFORCE_CF_ACCESS,
		allowInsecureBringUp: envBindings.ALLOW_INSECURE_DASHBOARD_BRINGUP,
	});
	if (decision.rejectedInsecureDisable) {
		console.error(
			"[auth] Ignoring DASHBOARD_ENFORCE_CF_ACCESS=false without ALLOW_INSECURE_DASHBOARD_BRINGUP=true",
		);
	}
	return decision.enforced;
}
