/**
 * Photo data shared by the Camera, the Photo viewer and the framed picture: palette
 * quantizing, the pixel string (1024 characters for 32×32 photos, 4096 for 64×64), glyph
 * lines for the viewer form and the frame tiles' packed entity properties. No @minecraft
 * imports (also used by tools/).
 */
import { PALETTE } from "./photo_palette.js";

/** New photos are 64×64; photos from v0.1.10 are 32×32. */
export const PHOTO_SIZE = 64;
export const PHOTO_SIZES = [32, 64];
/** The viewer form fits 32 glyph columns, so 64×64 photos show as an overview plus quarters. */
export const VIEW_SIZE = 32;
/** One character per pixel, its palette index (PALETTE has 64 colors). */
export const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
/** Dynamic property strings are limited to 32,767 bytes. */
export const MAX_PROPERTY_LENGTH = 32767;

// Viewer glyphs: U+E200 + top·64 + bottom is a half-block glyph showing palette colors
// `top` over `bottom` (RP font/glyph_E2.png … glyph_F1.png, see tools/make-photo-assets.mjs).
export const GLYPH_BASE = 0xe200;

// Framed pictures: each tile entity draws `rows` full picture rows from int properties
// vultrom:p0 … that pack 4 pixels each (6 bits apiece, so they stay below 2^24, which Molang
// reads exactly). An entity can have at most 32 properties, so a 64×64 tile carries 2 rows in
// all 32 and gets its tile index from its variant (event vultrom:tile_<n>) instead.
export const FRAMES = {
	32: { entity: "vultrom:photo_tile", rows: 2, tiles: 16, props: 16, tileProperty: "vultrom:tile" },
	64: { entity: "vultrom:photo_tile64", rows: 2, tiles: 32, props: 32, tileEvent: "vultrom:tile_" }
};
export const TILE_TYPES = new Set(Object.values(FRAMES).map((f) => f.entity));

const cache = new Map();

const channels = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/** Index of the palette color nearest to 0xRRGGBB (weighted "redmean" distance). */
export function nearestColor(color) {
	const key = color & 0xffffff;
	const hit = cache.get(key);
	if (hit !== undefined) return hit;
	const [r, g, b] = channels(key);
	let best = 0;
	let bestD = Infinity;
	for (let i = 0; i < PALETTE.length; i++) {
		const [pr, pg, pb] = channels(PALETTE[i]);
		const rm = (r + pr) / 2;
		const dr = r - pr;
		const dg = g - pg;
		const db = b - pb;
		const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
		if (d < bestD) {
			bestD = d;
			best = i;
		}
	}
	if (cache.size > 8192) cache.clear();
	cache.set(key, best);
	return best;
}

/** Side length of a photo with `count` pixels, or undefined if it isn't a photo size. */
export function sizeOf(count) {
	return PHOTO_SIZES.find((s) => s * s === count);
}

/** @param {ArrayLike<number>} indices palette indices, row-major from the top-left */
export function encodePixels(indices) {
	let s = "";
	for (let i = 0; i < indices.length; i++) s += ALPHABET[indices[i] & 63];
	return s;
}

/** @returns {Uint8Array | undefined} palette indices, or undefined if `text` isn't a photo */
export function decodePixels(text) {
	if (typeof text !== "string" || !sizeOf(text.length)) return undefined;
	const out = new Uint8Array(text.length);
	for (let i = 0; i < text.length; i++) {
		const v = ALPHABET.indexOf(text[i]);
		if (v < 0) return undefined;
		out[i] = v;
	}
	return out;
}

/** Half-size picture: each 2×2 block averaged in RGB, then snapped back to the palette. */
export function downsample(indices, size) {
	const half = size / 2;
	const out = new Uint8Array(half * half);
	for (let y = 0; y < half; y++) {
		for (let x = 0; x < half; x++) {
			const sum = [0, 0, 0];
			for (const i of [0, 1, size, size + 1]) {
				const c = channels(PALETTE[indices[2 * y * size + 2 * x + i]]);
				for (let k = 0; k < 3; k++) sum[k] += c[k];
			}
			out[y * half + x] = nearestColor(sum.reduce((acc, v) => (acc << 8) | Math.round(v / 4), 0));
		}
	}
	return out;
}

/** The `w`×`w` square of a `size`-wide picture whose top-left pixel is (x0, y0). */
export function crop(indices, size, x0, y0, w) {
	const out = new Uint8Array(w * w);
	for (let y = 0; y < w; y++) out.set(indices.subarray((y0 + y) * size + x0, (y0 + y) * size + x0 + w), y * w);
	return out;
}

export function glyph(top, bottom) {
	return String.fromCharCode(GLYPH_BASE + top * 64 + bottom);
}

/** A square picture as size / 2 lines of half-block glyphs, white so nothing tints them. */
export function photoLines(indices) {
	const size = Math.round(Math.sqrt(indices.length));
	const lines = [];
	for (let y = 0; y < size; y += 2) {
		let line = "§f";
		for (let x = 0; x < size; x++) line += glyph(indices[y * size + x], indices[(y + 1) * size + x]);
		lines.push(line);
	}
	return lines;
}

/** Packed vultrom:p0 … values for tile `tile` (0 = top rows) of a `size`×`size` frame. */
export function tileProperties(indices, tile, size) {
	const { rows, props } = FRAMES[size];
	const out = new Array(props).fill(0);
	const start = tile * rows * size;
	for (let i = 0; i < props * 4; i++) out[i >> 2] += indices[start + i] * 64 ** (i & 3);
	return out;
}

/** Inverse of tileProperties for every tile: `tiles[t]` is tile t's property array. */
export function pixelsFromTiles(tiles, size) {
	const { rows, props, tiles: count } = FRAMES[size];
	const out = new Uint8Array(size * size);
	for (let t = 0; t < count; t++) {
		const start = t * rows * size;
		for (let i = 0; i < props * 4; i++) out[start + i] = Math.floor((tiles[t]?.[i >> 2] ?? 0) / 64 ** (i & 3)) % 64;
	}
	return out;
}

/** Minecraft time of day (0 = 06:00) as "HH:MM". */
export function clockTime(timeOfDay) {
	const minutes = Math.floor((((timeOfDay % 24000) + 24000) % 24000) * 0.06) + 6 * 60;
	const h = Math.floor(minutes / 60) % 24;
	const m = minutes % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export const DIMENSION_NAMES = {
	"minecraft:overworld": "Overworld",
	"minecraft:nether": "Nether",
	"minecraft:the_end": "The End"
};

/**
 * Photo lore: who, where and when, each line within Bedrock's 50-character lore limit.
 * @param {{ id: number, by: string, x: number, y: number, z: number, dim: string, day: number, time: number, size?: number }} meta
 */
export function photoLore(meta) {
	const dim = DIMENSION_NAMES[meta.dim] ?? meta.dim.replace(/^minecraft:/, "");
	return [
		`§7Taken by §f${meta.by.slice(0, 24)}`,
		`§7At §f${meta.x} ${meta.y} ${meta.z} §7(${dim})`.slice(0, 50),
		`§7Day ${meta.day}, ${clockTime(meta.time)}`,
		`§8Photo #${meta.id}${meta.size ? ` · ${meta.size}x${meta.size}` : ""}`
	];
}
