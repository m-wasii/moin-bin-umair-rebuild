/// <reference types="astro/client" />

interface CloudflareEnv {
	ASSETS?: {
		fetch(input: Request | string): Promise<Response>;
	};
	/** Cloudflare Images binding — host-side resize for `/media/photos/?w=`. */
	IMAGES?: {
		input(
			stream: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array,
		): {
			transform(options: { width: number; fit?: string }): {
				output(options: {
					format: "image/webp";
					quality?: number;
				}): Promise<{
					response(init?: { headers?: HeadersInit }): Response;
				}>;
			};
		};
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
	/** Shared bearer token for POST /cdn-purge (mbu + dashboard Workers). */
	CDN_PURGE_SECRET?: string;
	/** Access team domain, e.g. myteam.cloudflareaccess.com */
	CF_ACCESS_TEAM_DOMAIN?: string;
	/** Access application AUD tag for the dashboard hostname */
	CF_ACCESS_AUD?: string;
	DASHBOARD_ENFORCE_CF_ACCESS?: string;
	CF_VERSION_METADATA?: { id: string; tag?: string };
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
