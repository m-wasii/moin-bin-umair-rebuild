/// <reference types="astro/client" />

interface CloudflareEnv {
	MEDIA?: {
		get(key: string): Promise<{
			json<T = unknown>(): Promise<T>;
			arrayBuffer(): Promise<ArrayBuffer>;
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

declare module "cloudflare:workers" {
	export const env: CloudflareEnv;
}
