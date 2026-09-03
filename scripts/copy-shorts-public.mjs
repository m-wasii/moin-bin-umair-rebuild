import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fromRoot = join(root, ".data", "media", "shorts");
const toRoot = join(root, "public", "shorts");

function copyTree(from, to) {
	mkdirSync(to, { recursive: true });
	for (const entry of readdirSync(from, { withFileTypes: true })) {
		const src = join(from, entry.name);
		const dest = join(to, entry.name);
		if (entry.isDirectory()) copyTree(src, dest);
		else if (/\.(mp4|webp)$/i.test(entry.name)) {
			copyFileSync(src, dest);
		}
	}
}

if (!existsSync(fromRoot)) {
	throw new Error(`missing ${fromRoot}`);
}
copyTree(fromRoot, toRoot);
console.log("copy-shorts-public: done");
