import type { APIRoute } from "astro";
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
	return body instanceof Uint8Array ? body : body;
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
				headers: {
					"content-type": object.contentType,
					"cache-control": "public, max-age=86400",
				},
			});
		}
		return new Response(null, {
			status: 302,
			headers: { location: publicLocation },
		});
	}

	const head = await getShortHead(campaign, file);
	if (!head) {
		return new Response(null, {
			status: 302,
			headers: { location: publicLocation },
		});
	}

	const range = parseRange(request.headers.get("range"), head.size);
	if (!range) {
		const object = await getShortRange(campaign, file, 0, head.size);
		if (!object) {
			return new Response(null, {
				status: 302,
				headers: { location: publicLocation },
			});
		}
		return new Response(asBody(object.body), {
			headers: {
				"content-type": head.contentType,
				"content-length": String(object.size),
				"accept-ranges": "bytes",
				"cache-control": "public, max-age=86400",
			},
		});
	}

	const object = await getShortRange(
		campaign,
		file,
		range.start,
		range.length,
	);
	if (!object) {
		return new Response(null, {
			status: 302,
			headers: { location: publicLocation },
		});
	}

	return new Response(asBody(object.body), {
		status: 206,
		headers: {
			"content-type": head.contentType,
			"content-length": String(object.size),
			"content-range": `bytes ${range.start}-${range.end}/${head.size}`,
			"accept-ranges": "bytes",
			"cache-control": "public, max-age=86400",
		},
	});
};
