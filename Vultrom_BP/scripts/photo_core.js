/**
 * Photo data shared by the Camera, the Photo viewer and the framed picture: palette
 * quantizing, the 1024-character pixel string, glyph lines for the viewer form and the
 * frame tiles' packed entity properties. No @minecraft imports (also used by tools/).
 */
import { PALETTE } from "./photo_palette.js";

export const PHOTO_SIZE = 32;
export const PHOTO_PIXELS = PHOTO_SIZE * PHOTO_SIZE;
/** One character per pixel, its palette index (PALETTE has 64 colors). */
export const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

// Viewer glyphs: U+E200 + top·64 + bottom is a half-block glyph showing palette colors
// `top` over `bottom` (RP font/glyph_E2.png … glyph_F1.png, see tools/make-photo-assets.mjs).
export const GLYPH_BASE = 0xe200;

// Frame tiles: each vultrom:photo_tile entity draws TILE_ROWS rows; its int properties
// vultrom:p0 … p15 pack 4 pixels each (6 bits apiece, so they stay below 2^24, which Molang
// reads exactly).
export const TILE_ROWS = 2;
export const TILE_COUNT = PHOTO_SIZE / TILE_ROWS;
export const TILE_PROPS = (TILE_ROWS * PHOTO_SIZE) / 4;

const cache = new Map();

/** Index of the palette color nearest to 0xRRGGBB (weighted "redmean" distance). */
export function nearestColor(color) {
	const key = color & 0xfcfcfc;
	const hit = cache.get(key);
	if (hit !== undefined) return hit;
	const r = (color >> 16) & 255;
	const g = (color >> 8) & 255;
	const b = color & 255;
	let best = 0;
	let bestD = Infinity;
	for (let i = 0; i < PALETTE.length; i++) {
		const p = PALETTE[i];
		const rm = (r + ((p >> 16) & 255)) / 2;
		const dr = r - ((p >> 16) & 255);
		const dg = g - ((p >> 8) & 255);
		const db = b - (p & 255);
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

/** @param {ArrayLike<number>} indices palette indices, row-major from the top-left */
export function encodePixels(indices) {
	let s = "";
	for (let i = 0; i < PHOTO_PIXELS; i++) s += ALPHABET[indices[i] & 63];
	return s;
}

/** @returns {Uint8Array | undefined} palette indices, or undefined if `text` isn't a photo */
export function decodePixels(text) {
	if (typeof text !== "string" || text.length !== PHOTO_PIXELS) return undefined;
	const out = new Uint8Array(PHOTO_PIXELS);
	for (let i = 0; i < PHOTO_PIXELS; i++) {
		const v = ALPHABET.indexOf(text[i]);
		if (v < 0) return undefined;
		out[i] = v;
	}
	return out;
}

export function glyph(top, bottom) {
	return String.fromCharCode(GLYPH_BASE + top * 64 + bottom);
}

/** The picture as PHOTO_SIZE / 2 lines of half-block glyphs, white so nothing tints them. */
export function photoLines(indices) {
	const lines = [];
	for (let y = 0; y < PHOTO_SIZE; y += 2) {
		let line = "§f";
		for (let x = 0; x < PHOTO_SIZE; x++) line += glyph(indices[y * PHOTO_SIZE + x], indices[(y + 1) * PHOTO_SIZE + x]);
		lines.push(line);
	}
	return lines;
}

/** Packed vultrom:p0 … p15 values for frame tile `tile` (0 = top two rows). */
export function tileProperties(indices, tile) {
	const props = new Array(TILE_PROPS).fill(0);
	const start = tile * TILE_ROWS * PHOTO_SIZE;
	for (let i = 0; i < TILE_PROPS * 4; i++) props[i >> 2] += indices[start + i] * 64 ** (i & 3);
	return props;
}

/** Inverse of tileProperties for every tile: `tiles[t]` is tile t's property array. */
export function pixelsFromTiles(tiles) {
	const out = new Uint8Array(PHOTO_PIXELS);
	for (let t = 0; t < TILE_COUNT; t++) {
		const start = t * TILE_ROWS * PHOTO_SIZE;
		for (let i = 0; i < TILE_PROPS * 4; i++) out[start + i] = Math.floor((tiles[t]?.[i >> 2] ?? 0) / 64 ** (i & 3)) % 64;
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
 * @param {{ id: number, by: string, x: number, y: number, z: number, dim: string, day: number, time: number }} meta
 */
export function photoLore(meta) {
	const dim = DIMENSION_NAMES[meta.dim] ?? meta.dim.replace(/^minecraft:/, "");
	return [
		`§7Taken by §f${meta.by.slice(0, 24)}`,
		`§7At §f${meta.x} ${meta.y} ${meta.z} §7(${dim})`.slice(0, 50),
		`§7Day ${meta.day}, ${clockTime(meta.time)}`,
		`§8Photo #${meta.id}`
	];
}
