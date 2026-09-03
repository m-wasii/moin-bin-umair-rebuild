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

async function fromAssets(
	request: Request,
	location: string,
	options: { forwardRange?: boolean } = {},
) {
	const assets = env.ASSETS;
	if (assets) {
		const url = new URL(location, request.url).toString();
		const range = options.forwardRange ? request.headers.get("range") : null;
		if (range) {
			const ranged = await assets.fetch(
				new Request(url, { headers: { range } }),
			);
			if (ranged.status === 206 || ranged.ok) return ranged;
		}
		const response = await assets.fetch(new Request(url));
		if (!response.ok) return null;
		return response;
	}

	if (!import.meta.env.DEV) return null;

	try {
		const { readFile } = await import("node:fs/promises");
		const { join } = await import("node:path");
		const bytes = await readFile(
			join(process.cwd(), "public", location.replace(/^\//, "")),
		);
		return new Response(bytes, {
			headers: {
				"content-type": location.toLowerCase().endsWith(".webp")
					? "image/webp"
					: "video/mp4",
				"content-length": String(bytes.byteLength),
				"accept-ranges": "bytes",
			},
		});
	} catch {
		return null;
	}
}

function assetHeaders(contentType: string, extra: Record<string, string> = {}) {
	return {
		"content-type": contentType,
		"cache-control": "public, max-age=86400",
		...extra,
	};
}

async function serveVideoAsset(request: Request, asset: Response) {
	const contentType = asset.headers.get("content-type") || "video/mp4";

	if (asset.status === 206) {
		const extra: Record<string, string> = { "accept-ranges": "bytes" };
		const length = asset.headers.get("content-length");
		const contentRange = asset.headers.get("content-range");
		if (length) extra["content-length"] = length;
		if (contentRange) extra["content-range"] = contentRange;
		return new Response(asset.body, {
			status: 206,
			headers: assetHeaders(contentType, extra),
		});
	}

	const rangeHeader = request.headers.get("range");
	const declaredSize = Number(asset.headers.get("content-length") || 0);
	const declaredRange = declaredSize
		? parseRange(rangeHeader, declaredSize)
		: null;

	// Unknown size, no Range, or unusable Range: serve a playable 200.
	if (!rangeHeader || !declaredRange) {
		const extra: Record<string, string> = { "accept-ranges": "bytes" };
		if (declaredSize) extra["content-length"] = String(declaredSize);
		return new Response(asset.body, {
			headers: assetHeaders(contentType, extra),
		});
	}

	const bytes = new Uint8Array(await asset.arrayBuffer());
	const size = bytes.byteLength;
	const range = parseRange(rangeHeader, size);
	if (!range) {
		return new Response(bytes, {
			headers: assetHeaders(contentType, {
				"content-length": String(size),
				"accept-ranges": "bytes",
			}),
		});
	}

	return new Response(bytes.subarray(range.start, range.end + 1), {
		status: 206,
		headers: assetHeaders(contentType, {
			"content-length": String(range.length),
			"content-range": `bytes ${range.start}-${range.end}/${size}`,
			"accept-ranges": "bytes",
		}),
	});
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
		const asset = await fromAssets(request, publicLocation, {
			forwardRange: true,
		});
		if (asset) {
			return serveVideoAsset(request, asset);
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

	const object = await getShortRange(campaign, file, range.start, range.length);
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
