import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { isShortMediaFile, isShortSlug } from "../../../../data/shorts";
import {
	getShortBytes,
	getShortHead,
	getShortRange,
} from "../../../../lib/store";

export const prerender = false;

function parseRange(header: string | null, size: number) {
	if (!header) return null;
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match) return null;

	const hasStart = match[1] !== "";
	const hasEnd = match[2] !== "";
	if (!hasStart && !hasEnd) return null;

	let start = hasStart ? Number(match[1]) : size - Number(match[2]);
	let end = hasEnd ? Number(match[2]) : size - 1;
	if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
	start = Math.max(0, start);
	end = Math.min(size - 1, end);
	if (start > end) return null;
	return { start, end, length: end - start + 1 };
}

function asBody(body: ReadableStream<Uint8Array> | Uint8Array) {
	return body as BodyInit;
}

async function fromAssets(request: Request, location: string) {
	const assets = env.ASSETS;
	if (!assets) return null;
	const url = new URL(location, request.url);
	const response = await assets.fetch(new Request(url.toString()));
	if (!response.ok) return null;
	return response;
}

function assetHeaders(
	contentType: string,
	extra: Record<string, string> = {},
) {
	return {
		"content-type": contentType,
		"cache-control": "public, max-age=86400",
		...extra,
	};
}

export const GET: APIRoute = async ({ params, request }) => {
	const campaign = params.campaign ?? "";
	const file = params.file ?? "";
	if (!isShortSlug(campaign) || !isShortMediaFile(file)) {
		return new Response("Not found", { status: 404 });
	}

	const publicLocation = `/shorts/${campaign}/${file}`;
	const isPoster = file.toLowerCase().endsWith(".webp");

	if (isPoster) {
		const object = await getShortBytes(campaign, file);
		if (object) {
			return new Response(object.body, {
				headers: assetHeaders(object.contentType),
			});
		}

		// Prefer ASSETS over a 302: empty redirects to missing /shorts/*
		// were cached intermittently and broke <img> loads.
		const asset = await fromAssets(request, publicLocation);
		if (asset) {
			return new Response(asset.body, {
				headers: assetHeaders(
					asset.headers.get("content-type") || "image/webp",
				),
			});
		}
		return new Response("Not found", { status: 404 });
	}

	const head = await getShortHead(campaign, file);
	if (!head) {
		const asset = await fromAssets(request, publicLocation);
		if (asset) {
			const size = Number(asset.headers.get("content-length") || 0);
			const range = parseRange(request.headers.get("range"), size);
			if (!range || !size) {
				return new Response(asset.body, {
					headers: assetHeaders(
						asset.headers.get("content-type") || "video/mp4",
						size
							? {
									"content-length": String(size),
									"accept-ranges": "bytes",
								}
							: { "accept-ranges": "bytes" },
					),
				});
			}
			// Static assets do not support byte ranges; fall through to 404
			// rather than a broken redirect when R2 is empty.
		}
		return new Response("Not found", { status: 404 });
	}

	const range = parseRange(request.headers.get("range"), head.size);
	if (!range) {
		const object = await getShortRange(campaign, file, 0, head.size);
		if (!object) {
			return new Response("Not found", { status: 404 });
		}
		return new Response(asBody(object.body), {
			headers: assetHeaders(head.contentType, {
				"content-length": String(object.size),
				"accept-ranges": "bytes",
			}),
		});
	}

	const object = await getShortRange(
		campaign,
		file,
		range.start,
		range.length,
	);
	if (!object) {
		return new Response("Not found", { status: 404 });
	}

	return new Response(asBody(object.body), {
		status: 206,
		headers: assetHeaders(head.contentType, {
			"content-length": String(object.size),
			"content-range": `bytes ${range.start}-${range.end}/${head.size}`,
			"accept-ranges": "bytes",
		}),
	});
};
