/// <reference types="astro/client" />

interface CloudflareEnv {
	ASSETS?: {
		fetch(input: Request | string): Promise<Response>;
	};
	MEDIA?: {
		get(
			key: string,
			options?: { range?: { offset: number; length: number } },
		): Promise<{
			json<T = unknown>(): Promise<T>;
			arrayBuffer(): Promise<ArrayBuffer>;
			body?: ReadableStream<Uint8Array>;
			size?: number;
			etag?: string;
			uploaded?: Date;
			httpMetadata?: { contentType?: string };
		} | null>;
		head?(key: string): Promise<{
			size: number;
			etag?: string;
			uploaded?: Date;
			httpMetadata?: { contentType?: string };
		} | null>;
		put(
			key: string,
			value: string | Uint8Array,
			options?: { httpMetadata?: { contentType?: string } },
		): Promise<unknown>;
		delete(key: string): Promise<unknown>;
	};
	YOUTUBE_API_KEY?: string;
	DASHBOARD_ENFORCE_CF_ACCESS?: string;
}

interface WorkersCachePurgeResult {
	success: boolean;
	errors?: Array<{ code: number; message: string }>;
}

interface WorkersCache {
	purge(options: {
		tags?: string[];
		pathPrefixes?: string[];
		purgeEverything?: boolean;
	}): Promise<WorkersCachePurgeResult>;
}

declare module "cloudflare:workers" {
	export const env: CloudflareEnv;
	export const cache: WorkersCache;
}
