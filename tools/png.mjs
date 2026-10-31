// Minimal RGBA PNG writer (no dependencies) for the photo asset tools and previews.
import { deflateSync, crc32 } from "node:zlib";

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body) >>> 0);
	return Buffer.concat([len, body, crc]);
}

/** An RGBA image: `set(x, y, 0xRRGGBB, alpha)` and `encode()` → PNG bytes. */
export class Image {
	constructor(width, height) {
		this.width = width;
		this.height = height;
		this.data = Buffer.alloc(width * height * 4);
	}
	set(x, y, color, alpha = 255) {
		if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
		const i = (y * this.width + x) * 4;
		this.data[i] = (color >> 16) & 255;
		this.data[i + 1] = (color >> 8) & 255;
		this.data[i + 2] = color & 255;
		this.data[i + 3] = alpha;
	}
	fill(x, y, w, h, color, alpha = 255) {
		for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, color, alpha);
	}
	encode() {
		const raw = Buffer.alloc((this.width * 4 + 1) * this.height);
		for (let y = 0; y < this.height; y++) {
			raw[y * (this.width * 4 + 1)] = 0;
			this.data.copy(raw, y * (this.width * 4 + 1) + 1, y * this.width * 4, (y + 1) * this.width * 4);
		}
		const ihdr = Buffer.alloc(13);
		ihdr.writeUInt32BE(this.width, 0);
		ihdr.writeUInt32BE(this.height, 4);
		ihdr[8] = 8;
		ihdr[9] = 6;
		return Buffer.concat([
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
			chunk("IHDR", ihdr),
			chunk("IDAT", deflateSync(raw, { level: 9 })),
			chunk("IEND", Buffer.alloc(0))
		]);
	}
}
