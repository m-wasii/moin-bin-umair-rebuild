import { env } from "cloudflare:workers";
import {
	HOST_IMAGE_WIDTHS,
	isHostImageWidth,
	type HostImageWidth,
} from "./responsive-image";

export { HOST_IMAGE_WIDTHS, isHostImageWidth };
export type { HostImageWidth };

interface ImagesBinding {
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
}

function imagesBinding(): ImagesBinding | undefined {
	return (env as { IMAGES?: ImagesBinding }).IMAGES;
}

function bodyToStream(
	body: ReadableStream<Uint8Array> | Uint8Array,
): ReadableStream<Uint8Array> {
	if (body instanceof Uint8Array) {
		return new ReadableStream({
			start(controller) {
				controller.enqueue(body);
				controller.close();
			},
		});
	}
	return body;
}

async function bodyToBytes(
	body: ReadableStream<Uint8Array> | Uint8Array,
): Promise<Uint8Array> {
	if (body instanceof Uint8Array) return body;
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			chunks.push(value);
			total += value.byteLength;
		}
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}

/**
 * Resize photo bytes to `width`. Prefers the Workers Images binding;
 * falls back to sharp in local DEV when IMAGES is unbound.
 */
export async function resizePhotoWebp(
	body: ReadableStream<Uint8Array> | Uint8Array,
	width: HostImageWidth,
): Promise<Response | null> {
	const images = imagesBinding();
	if (images) {
		try {
			return (
				await images
					.input(bodyToStream(body))
					.transform({ width, fit: "scale-down" })
					.output({ format: "image/webp", quality: 82 })
			).response({
				headers: {
					"cache-control": "public, max-age=31536000, immutable",
				},
			});
		} catch (error) {
			console.error("[image-resize] IMAGES transform failed", error);
			return null;
		}
	}

	if (!import.meta.env.DEV) return null;

	try {
		const sharp = (await import("sharp")).default;
		const bytes = await bodyToBytes(body);
		const out = await sharp(bytes)
			.resize({ width, withoutEnlargement: true })
			.webp({ quality: 82 })
			.toBuffer();
		return new Response(new Uint8Array(out), {
			headers: {
				"content-type": "image/webp",
				"content-length": String(out.byteLength),
				"cache-control": "public, max-age=31536000, immutable",
			},
		});
	} catch (error) {
		console.error("[image-resize] sharp fallback failed", error);
		return null;
	}
}

export function parseHostImageWidth(
	raw: string | null,
): HostImageWidth | null {
	if (!raw) return null;
	const width = Number.parseInt(raw, 10);
	if (!Number.isFinite(width) || !isHostImageWidth(width)) return null;
	return width;
}
