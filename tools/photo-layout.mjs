// Pixel layout of the Photo viewer glyphs and the framed picture, shared by
// tools/make-photo-assets.mjs (which bakes it into the packs) and the mock-test preview.

// Viewer glyph cell on a 256×256 glyph page (16×16 per glyph, one GUI pixel per texel).
// Bedrock advances a glyph by its rightmost inked column + 1, so 4 inked columns draw a
// 5-pixel step (4 color + 1 gap). Cells taller than 8 rise above the line; 10 inked rows
// at the bottom tile the ~10-pixel form line height: rows 6–10 are the top pixel, 11–15 the
// bottom one.
export const GLYPH = { cell: 16, inkWidth: 4, advance: 5, topRows: [6, 11], bottomRows: [11, 16], lineHeight: 10 };

// Framed picture, in model units (1/16 block): a 14×14 picture inside a 1-unit frame that
// fills the block face, with each pixel 7/16 units.
export const FRAME = {
	pixel: 0.4375,
	left: -7,
	top: 15,
	plane: 7.875, // picture plane; the wall face is at z = 8
	border: { front: 7.25, depth: 0.75, width: 1 }
};

export const FRAME_COLORS = { front: 0x6b4428, side: 0x4e321c };
