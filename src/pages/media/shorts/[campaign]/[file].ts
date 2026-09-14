import type { APIRoute } from "astro";
import { isShortMediaFile, isShortSlug } from "../../../../data/shorts";
import {
	parseByteRange,
	rangeUnsatisfiableHeaders,
} from "../../../../lib/http-range";
import {
	getShortBytes,
	getShortHead,
	getShortRange,
} from "../../../../lib/store";

export const prerender = false;

function asBody(body: ReadableStream<Uint8Array> | Uint8Array) {
	return body as BodyInit;
}

function assetHeaders(contentType: string, extra: Record<string, string> = {}) {
	return {
		"content-type": contentType,
		"cache-control": "public, max-age=31536000, immutable",
		...extra,
	};
}

export const GET: APIRoute = async ({ params, request }) => {
	const campaign = params.campaign ?? "";
	const file = params.file ?? "";
	if (!isShortSlug(campaign) || !isShortMediaFile(file)) {
		return new Response("Not found", { status: 404 });
	}

	const isPoster = file.toLowerCase().endsWith(".webp");

	if (isPoster) {
		const object = await getShortBytes(campaign, file);
		if (!object) {
			return new Response("Not found", { status: 404 });
		}
		return new Response(asBody(object.body), {
			headers: assetHeaders(object.contentType, {
				"content-length": String(object.size),
			}),
		});
	}

	const head = await getShortHead(campaign, file);
	if (!head) {
		return new Response("Not found", { status: 404 });
	}

	const range = parseByteRange(request.headers.get("range"), head.size);

	if (range.kind === "invalid") {
		return new Response("Invalid Range", { status: 400 });
	}

	if (range.kind === "unsatisfiable") {
		return new Response(null, {
			status: 416,
			headers: {
				...rangeUnsatisfiableHeaders(head.size),
				"content-type": head.contentType,
			},
		});
	}

	if (range.kind === "range") {
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
	}

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
};
