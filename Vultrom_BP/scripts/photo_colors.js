/**
 * Block and entity colors for the Camera (Block.getMapColor is Beta-only). Pure data and
 * math, no @minecraft imports: tools/make-photo-assets.mjs builds the photo palette from it.
 * Colors are 0xRRGGBB averages of the vanilla textures (grass and leaves biome-tinted).
 */

const DYES = ["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black"];
const WOOL = [0xe9ecec, 0xf07613, 0xbd44b3, 0x3aafd9, 0xf8c627, 0x70b919, 0xed8dac, 0x3e4447, 0x8e8e86, 0x158991, 0x792aac, 0x35399d, 0x724728, 0x546d1b, 0xa12722, 0x141519];
const CONCRETE = [0xcfd5d6, 0xe06100, 0xa9309f, 0x2389c6, 0xf0af15, 0x5ea818, 0xd5658e, 0x36393d, 0x7d7d73, 0x157788, 0x64209c, 0x2c2e8f, 0x603b1f, 0x495b24, 0x8e2020, 0x080a0f];
const TERRACOTTA = [0xd1b2a1, 0xa15325, 0x95576c, 0x706c8a, 0xba8523, 0x677534, 0xa04d4e, 0x392a23, 0x876a61, 0x575b5b, 0x764656, 0x4a3b5b, 0x4d3323, 0x4c532a, 0x8f3d2e, 0x251610];

/** Wood family: [log/stem side, log top, planks, leaves]. */
const WOODS = {
	oak: [0x6d5533, 0xa2834f, 0xa2834f, 0x4a7a2a],
	spruce: [0x3b2610, 0x6e5530, 0x735532, 0x3d5e3d],
	birch: [0xd8d7d2, 0xc1b37a, 0xc0af79, 0x5f8a3f],
	jungle: [0x554419, 0x9a6e4c, 0xa07351, 0x3e8e1b],
	acacia: [0x675f55, 0x965a35, 0xa8582f, 0x4f7a26],
	dark_oak: [0x3c2e1a, 0x49341b, 0x432b14, 0x3f6e1e],
	mangrove: [0x533f2a, 0x6f2b29, 0x763631, 0x4e7a21],
	cherry: [0x36191e, 0xb98a87, 0xe2b2ab, 0xe5adc2],
	pale_oak: [0x5a504a, 0xe6dcd7, 0xe4d9d6, 0xa0a69c],
	bamboo: [0x8a8a2c, 0xc2af52, 0xc2af52, 0x5d8b2b],
	crimson: [0x5c1a1e, 0x7e3a56, 0x653147, 0x720b0b],
	warped: [0x3a3a4d, 0x3a8e8c, 0x2b6863, 0x167e86]
};

/** Exact block colors: a number, or { top, side, bottom } for blocks whose faces differ. */
const BLOCKS = {
	grass_block: { top: 0x7cb342, side: 0x8a7b4e, bottom: 0x866043 },
	grass: { top: 0x7cb342, side: 0x8a7b4e, bottom: 0x866043 },
	dirt: 0x866043,
	coarse_dirt: 0x77553b,
	rooted_dirt: 0x90674c,
	podzol: { top: 0x5b3f18, side: 0x7a5732, bottom: 0x866043 },
	mycelium: { top: 0x6f6265, side: 0x7d6a64, bottom: 0x866043 },
	grass_path: { top: 0x947a41, side: 0x866043, bottom: 0x866043 },
	dirt_path: { top: 0x947a41, side: 0x866043, bottom: 0x866043 },
	farmland: { top: 0x5a3a1d, side: 0x866043, bottom: 0x866043 },
	mud: 0x3c393d,
	mud_bricks: 0x89684f,
	packed_mud: 0x8e6b50,
	clay: 0xa0a6b3,
	stone: 0x7d7d7d,
	cobblestone: 0x7a7a7a,
	mossy_cobblestone: 0x6e7b5e,
	smooth_stone: 0x9e9e9e,
	stonebrick: 0x7a7979,
	stone_bricks: 0x7a7979,
	mossy_stone_bricks: 0x737a62,
	granite: 0x956755,
	polished_granite: 0x9a6a59,
	diorite: 0xbcbcbc,
	polished_diorite: 0xc1c1c3,
	andesite: 0x888889,
	polished_andesite: 0x848786,
	deepslate: 0x505052,
	cobbled_deepslate: 0x4d4d51,
	tuff: 0x6c6d66,
	calcite: 0xdfe0dc,
	dripstone_block: 0x866b5c,
	pointed_dripstone: 0x866b5c,
	bedrock: 0x555555,
	gravel: 0x837e7e,
	sand: 0xdbcfa3,
	red_sand: 0xbe6621,
	sandstone: 0xd8cb9b,
	red_sandstone: 0xb5621f,
	snow: 0xf9fefe,
	snow_layer: 0xf9fefe,
	powder_snow: 0xf8fdfd,
	ice: 0x91b8fe,
	packed_ice: 0x8db4fa,
	blue_ice: 0x74a8fd,
	water: 0x3f76e4,
	flowing_water: 0x3f76e4,
	lava: 0xcf5b13,
	flowing_lava: 0xcf5b13,
	obsidian: 0x0f0a18,
	crying_obsidian: 0x20091f,
	short_grass: 0x6a9e3a,
	tall_grass: 0x6a9e3a,
	tallgrass: 0x6a9e3a,
	fern: 0x5f8f35,
	large_fern: 0x5f8f35,
	deadbush: 0x6b4f28,
	dead_bush: 0x6b4f28,
	seagrass: 0x2e7d32,
	kelp: 0x3d7a2a,
	vine: 0x2b6e11,
	waterlily: 0x208030,
	lily_pad: 0x208030,
	moss_block: 0x596d2d,
	moss_carpet: 0x596d2d,
	azalea: 0x5f7c2d,
	flowering_azalea: 0x7c6c7e,
	azalea_leaves: 0x5a7c2c,
	azalea_leaves_flowered: 0x6e7c46,
	cactus: 0x4e7a27,
	reeds: 0x94c065,
	sugar_cane: 0x94c065,
	bamboo: 0x5d8b2b,
	pumpkin: { top: 0xc0761b, side: 0xc67519, bottom: 0xc67519 },
	carved_pumpkin: 0xc67519,
	lit_pumpkin: 0xd88a20,
	melon_block: 0x6f9118,
	hay_block: 0xa68b0c,
	sponge: 0xc3c04a,
	slime: 0x6fc05a,
	honey_block: 0xfbb830,
	brick_block: 0x966153,
	bricks: 0x966153,
	tnt: { top: 0xb9b3a9, side: 0xdb4a3a, bottom: 0xb9b3a9 },
	glass: 0xc8dfe3,
	glass_pane: 0xc8dfe3,
	tinted_glass: 0x2c2730,
	bookshelf: { top: 0xa2834f, side: 0x6b5236, bottom: 0xa2834f },
	crafting_table: { top: 0x8a6a41, side: 0x765a39, bottom: 0xa2834f },
	furnace: 0x6e6e6e,
	lit_furnace: 0x787068,
	blast_furnace: 0x5e5d5d,
	smoker: 0x6e5d48,
	chest: 0xa2772e,
	trapped_chest: 0xa2772e,
	ender_chest: 0x2e3f3f,
	barrel: 0x86643b,
	torch: 0xffd86b,
	lantern: 0x6e5a3f,
	rail: 0x7b6d57,
	golden_rail: 0x9a7f3c,
	iron_block: 0xdcdcdc,
	gold_block: 0xf6d03d,
	diamond_block: 0x62ede4,
	emerald_block: 0x2acb57,
	lapis_block: 0x1f4398,
	redstone_block: 0xaf1805,
	coal_block: 0x101010,
	copper_block: 0xc06c50,
	exposed_copper: 0xa17e68,
	weathered_copper: 0x6d9174,
	oxidized_copper: 0x52a284,
	netherite_block: 0x42393a,
	quartz_block: 0xece6df,
	amethyst_block: 0x8562c1,
	budding_amethyst: 0x8462c1,
	coal_ore: 0x737373,
	iron_ore: 0x88817b,
	gold_ore: 0x8f8c7d,
	diamond_ore: 0x7a8e8d,
	emerald_ore: 0x6c8874,
	lapis_ore: 0x6b7590,
	redstone_ore: 0x8c6e6e,
	lit_redstone_ore: 0x9c6e6e,
	copper_ore: 0x7c7d72,
	deepslate_coal_ore: 0x4a4a4c,
	deepslate_iron_ore: 0x6a645f,
	deepslate_gold_ore: 0x736b56,
	deepslate_diamond_ore: 0x536a6a,
	deepslate_emerald_ore: 0x4e6857,
	deepslate_lapis_ore: 0x4f5a76,
	deepslate_redstone_ore: 0x684c4e,
	deepslate_copper_ore: 0x5c5d55,
	netherrack: 0x612626,
	nether_brick: 0x2c1519,
	nether_bricks: 0x2c1519,
	red_nether_brick: 0x450709,
	soul_sand: 0x513e32,
	soul_soil: 0x4b3929,
	basalt: 0x49494e,
	polished_basalt: 0x5c5b60,
	smooth_basalt: 0x48484e,
	blackstone: 0x2a2328,
	glowstone: 0xd7b06d,
	magma: 0x8e3f1f,
	crimson_nylium: { top: 0x831f1f, side: 0x6b2a29, bottom: 0x612626 },
	warped_nylium: { top: 0x2b7265, side: 0x4f3d3a, bottom: 0x612626 },
	nether_wart_block: 0x720b0b,
	warped_wart_block: 0x167e86,
	shroomlight: 0xf19246,
	nether_gold_ore: 0x73362a,
	quartz_ore: 0x75413e,
	nether_quartz_ore: 0x75413e,
	ancient_debris: 0x5e4238,
	end_stone: 0xdbde9e,
	end_bricks: 0xdadfa3,
	end_stone_bricks: 0xdadfa3,
	purpur_block: 0xa97da9,
	chorus_plant: 0x5d395d,
	chorus_flower: 0x977a97,
	end_portal_frame: { top: 0x5b7961, side: 0xc0c39b, bottom: 0xdbde9e },
	sea_lantern: 0xacc7be,
	prismarine: 0x63a39a,
	prismarine_bricks: 0x63ab9e,
	dark_prismarine: 0x335b4c,
	sculk: 0x0d1e24,
	mangrove_roots: 0x4a3b26,
	muddy_mangrove_roots: 0x463b2d,
	bee_nest: 0xc7a048,
	beehive: 0xb38c55,
	red_mushroom_block: 0xc82f2d,
	brown_mushroom_block: 0x956f51,
	mushroom_stem: 0xcbc4b9,
	red_mushroom: 0xc82f2d,
	brown_mushroom: 0x956f51,
	tube_coral_block: 0x3157d2,
	brain_coral_block: 0xcf5b9f,
	bubble_coral_block: 0xa118a0,
	fire_coral_block: 0xa3232e,
	horn_coral_block: 0xd8c842,
	poppy: 0xc7322a,
	red_flower: 0xc7322a,
	dandelion: 0xf2d93a,
	yellow_flower: 0xf2d93a,
	cornflower: 0x4f6fe0,
	blue_orchid: 0x2aa8d8,
	allium: 0xa86bd8,
	azure_bluet: 0xd8dde0,
	oxeye_daisy: 0xe0e2d0,
	lily_of_the_valley: 0xe8ece4,
	sunflower: 0xf2c51f,
	lilac: 0xc49bc7,
	rose_bush: 0xa8302a,
	peony: 0xe0b7d8,
	sweet_berry_bush: 0x3f6a2e,
	wheat: 0xb59a3a,
	carrots: 0x4f8f2a,
	potatoes: 0x4f8f2a,
	beetroot: 0x4f8f2a,
	beacon: 0x7fe0e0,
	end_rod: 0xe8e0d8,
	campfire: 0xd8822a,
	fire: 0xe8902a,
	soul_fire: 0x3fd8e0,
	ochre_froglight: 0xf2e4a7,
	verdant_froglight: 0xd8edcf,
	pearlescent_froglight: 0xeedbe4,
	redstone_lamp: 0x8a5a33,
	lit_redstone_lamp: 0xd9a35a,
	jack_o_lantern: 0xd88a20,
	"vultrom:sapphire_ore": 0x6e7d9a,
	"vultrom:ruby_ore": 0x8f6e72,
	"vultrom:deepslate_ruby_ore": 0x5e4f55,
	"vultrom:gemstone_cutter": 0x7d7d7d
};

/** Blocks that light themselves (shadows and night don't darken them). */
export const EMISSIVE = new Set([
	"glowstone",
	"sea_lantern",
	"shroomlight",
	"lava",
	"flowing_lava",
	"torch",
	"soul_torch",
	"lantern",
	"soul_lantern",
	"magma",
	"ochre_froglight",
	"verdant_froglight",
	"pearlescent_froglight",
	"lit_redstone_lamp",
	"lit_pumpkin",
	"jack_o_lantern",
	"beacon",
	"end_rod",
	"campfire",
	"soul_campfire",
	"fire",
	"soul_fire",
	"lit_furnace",
	"redstone_torch"
]);

/** Name-based fallbacks for blocks missing from the table, first match wins. */
const KEYWORDS = [
	["deepslate", 0x505052],
	["blackstone", 0x2a2328],
	["sandstone", 0xd8cb9b],
	["prismarine", 0x63a39a],
	["purpur", 0xa97da9],
	["quartz", 0xece6df],
	["end_stone", 0xdbde9e],
	["nether_brick", 0x2c1519],
	["mud_brick", 0x89684f],
	["brick", 0x966153],
	["copper", 0xc06c50],
	["coral", 0xcf5b9f],
	["tuff", 0x6c6d66],
	["granite", 0x956755],
	["diorite", 0xbcbcbc],
	["andesite", 0x888889],
	["cobblestone", 0x7a7a7a],
	["stone", 0x7d7d7d],
	["snow", 0xf9fefe],
	["ice", 0x91b8fe],
	["sand", 0xdbcfa3],
	["dirt", 0x866043],
	["leaves", 0x4a7a2a],
	["sapling", 0x4f8a2a],
	["flower", 0xd8c84a],
	["tulip", 0xd8584a],
	["glass", 0xc8dfe3],
	["iron", 0xc8c8c8],
	["gold", 0xe8c03a],
	["diamond", 0x62ede4],
	["emerald", 0x2acb57],
	["redstone", 0xaf1805],
	["lapis", 0x1f4398],
	["amethyst", 0x8562c1],
	["sculk", 0x0d1e24],
	["nether", 0x612626],
	["crimson", 0x653147],
	["warped", 0x2b6863],
	["log", 0x6d5533],
	["wood", 0x6d5533],
	["plank", 0xa2834f],
	["door", 0xa2834f],
	["fence", 0xa2834f],
	["sign", 0xa2834f],
	["slab", 0x9e9e9e],
	["stairs", 0x9e9e9e],
	["wall", 0x7a7a7a],
	["ore", 0x7d7d7d]
];

const UNKNOWN_BLOCK = 0x8a8a8a;

/** @param {number | { top: number, side: number, bottom: number }} c @param {string} face */
function pickFace(c, face) {
	if (typeof c === "number") return c;
	return face === "Up" ? c.top : face === "Down" ? c.bottom : c.side;
}

function woodColor(name) {
	for (const [wood, [bark, top, planks, leaves]] of Object.entries(WOODS)) {
		if (!name.startsWith(`${wood}_`) && !name.startsWith(`stripped_${wood}_`)) continue;
		const rest = name.slice(name.indexOf(`${wood}_`) + wood.length + 1);
		if (rest === "leaves") return leaves;
		if (rest === "log" || rest === "stem" || rest === "wood" || rest === "hyphae" || rest === "block") {
			return name.startsWith("stripped_") ? { top, side: planks, bottom: top } : { top, side: bark, bottom: top };
		}
		return planks;
	}
	return undefined;
}

function dyeColor(name) {
	for (let i = 0; i < DYES.length; i++) {
		const dye = DYES[i];
		if (!name.startsWith(`${dye}_`)) continue;
		const rest = name.slice(dye.length + 1);
		if (rest.includes("concrete")) return CONCRETE[i];
		if (rest.includes("terracotta")) return TERRACOTTA[i];
		if (rest.includes("stained_glass")) return mix(WOOL[i], 0xffffff, 0.45);
		return WOOL[i];
	}
	return undefined;
}

/**
 * The color of `typeId` seen from `face` ("Up", "Down", "North", …), as 0xRRGGBB.
 * @param {string} typeId
 * @param {string} face
 */
export function blockColor(typeId, face) {
	const name = typeId.startsWith("minecraft:") ? typeId.slice(10) : typeId;
	const exact = BLOCKS[name] ?? BLOCKS[typeId];
	if (exact !== undefined) return pickFace(exact, face);
	const dyed = dyeColor(name);
	if (dyed !== undefined) return dyed;
	if (name === "terracotta" || name === "hardened_clay") return 0x985e43;
	const wood = woodColor(name);
	if (wood !== undefined) return pickFace(wood, face);
	for (const [word, color] of KEYWORDS) {
		if (name.includes(word)) return color;
	}
	return UNKNOWN_BLOCK;
}

export function isEmissive(typeId) {
	return EMISSIVE.has(typeId.startsWith("minecraft:") ? typeId.slice(10) : typeId);
}

/** Entity colors and rough hitboxes [width, height], for mobs and players in a photo. */
export const ENTITIES = {
	"minecraft:player": [0x3a6db4, 0.6, 1.8],
	"minecraft:cow": [0x4a3726, 0.9, 1.3],
	"minecraft:mooshroom": [0xa31d1d, 0.9, 1.3],
	"minecraft:sheep": [0xe7e7e7, 0.9, 1.3],
	"minecraft:pig": [0xf0a5a2, 0.9, 0.9],
	"minecraft:chicken": [0xf2f2f2, 0.4, 0.7],
	"minecraft:horse": [0x8a5a2b, 1.4, 1.6],
	"minecraft:donkey": [0x7a6a5a, 1.4, 1.5],
	"minecraft:wolf": [0xd7d3cf, 0.6, 0.85],
	"minecraft:cat": [0xe0a050, 0.6, 0.7],
	"minecraft:fox": [0xe07a30, 0.6, 0.7],
	"minecraft:rabbit": [0x9a7a5a, 0.4, 0.5],
	"minecraft:bee": [0xe8b830, 0.55, 0.5],
	"minecraft:villager_v2": [0x8c6a4e, 0.6, 1.9],
	"minecraft:villager": [0x8c6a4e, 0.6, 1.9],
	"minecraft:wandering_trader": [0x2a4f8f, 0.6, 1.9],
	"minecraft:iron_golem": [0xc9c1b6, 1.4, 2.9],
	"minecraft:zombie": [0x3e7c3e, 0.6, 1.9],
	"minecraft:husk": [0x8a7a52, 0.6, 1.9],
	"minecraft:drowned": [0x4a8a8a, 0.6, 1.9],
	"minecraft:skeleton": [0xbdbdbd, 0.6, 1.9],
	"minecraft:creeper": [0x4caf50, 0.6, 1.7],
	"minecraft:spider": [0x3d332b, 1.4, 0.9],
	"minecraft:enderman": [0x161616, 0.6, 2.9],
	"minecraft:slime": [0x6fc05a, 1.0, 1.0],
	"minecraft:squid": [0x2a3f5a, 0.8, 0.8],
	"minecraft:axolotl": [0xe8a0c0, 0.75, 0.42],
	"vultrom:jeweler": [0x2b5c9e, 0.6, 1.9]
};
export const DEFAULT_ENTITY = [0x8a7a6a, 0.7, 1.2];
/** Entities a photo never shows (items, projectiles, markers, framed photos). */
export const INVISIBLE_ENTITIES = new Set([
	"minecraft:item",
	"minecraft:xp_orb",
	"minecraft:arrow",
	"minecraft:snowball",
	"minecraft:egg",
	"minecraft:area_effect_cloud",
	"minecraft:lightning_bolt",
	"minecraft:painting",
	"minecraft:fishing_hook",
	"minecraft:npc",
	"minecraft:agent",
	"vultrom:photo_tile"
]);

// ---------- color math ----------
export const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
export const hex = ([r, g, b]) => (clamp255(r) << 16) | (clamp255(g) << 8) | clamp255(b);
const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
export const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** a·(1−t) + b·t on 0xRRGGBB colors. */
export function mix(a, b, t) {
	const [ar, ag, ab] = rgb(a);
	const [br, bg, bb] = rgb(b);
	return hex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
}

export function scale(c, k) {
	const [r, g, b] = rgb(c);
	return hex([r * k, g * k, b * k]);
}

export const FACE_SHADE = { Up: 1.0, Down: 0.55, North: 0.85, South: 0.85, East: 0.7, West: 0.7 };

// ---------- sky ----------
const DAY_TOP = 0x78a7ff;
const DAY_HORIZON = 0xc0d8ff;
const NIGHT_TOP = 0x04060f;
const NIGHT_HORIZON = 0x141a30;
const SUNSET = 0xff8c3c;
export const NETHER_FOG = 0x330a08;
export const END_SKY = 0x16101e;

/** 0 at night … 1 at day, from the time of day in ticks (0 = sunrise, 6000 = noon). */
export function daylight(timeOfDay) {
	return clamp01(Math.cos(((timeOfDay - 6000) / 24000) * 2 * Math.PI) * 2 + 0.6);
}

/** Unit vector toward the sun; it rises in the east (+X) at time 0 and peaks at 6000. */
export function sunDirection(timeOfDay) {
	const a = (timeOfDay / 24000) * 2 * Math.PI;
	return { x: Math.cos(a), y: Math.sin(a), z: 0 };
}

/** How strong sunrise/sunset glow is (sun near the horizon). */
function glowAmount(timeOfDay) {
	const sun = sunDirection(timeOfDay);
	return clamp01(1 - Math.abs(sun.y) / 0.35) * 0.85;
}

function starHash(d) {
	const q = (v) => Math.floor(v * 90);
	let n = q(d.x) * 73856093 ^ q(d.y) * 19349663 ^ q(d.z) * 83492791;
	n = Math.imul(n ^ (n >>> 13), 0x5bd1e995);
	return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

/**
 * Sky color for a ray that hit nothing: day/night gradient, sunrise/sunset glow toward the
 * sun, the sun and moon discs, and stars at night.
 */
export function skyColor(dir, timeOfDay, dimensionId) {
	if (dimensionId === "minecraft:nether") return NETHER_FOG;
	if (dimensionId === "minecraft:the_end") return starHash(dir) < 0.03 ? 0x8a7aa0 : END_SKY;
	const day = daylight(timeOfDay);
	const up = clamp01(dir.y);
	let c = mix(mix(NIGHT_HORIZON, DAY_HORIZON, day), mix(NIGHT_TOP, DAY_TOP, day), Math.sqrt(up));
	const sun = sunDirection(timeOfDay);
	const glow = glowAmount(timeOfDay);
	if (glow > 0 && dir.y < 0.45) {
		const toward = clamp01((dir.x * Math.sign(sun.x || 1) + 1) / 2);
		c = mix(c, SUNSET, glow * (1 - clamp01(dir.y) / 0.45) * toward * toward);
	}
	const sunDot = dir.x * sun.x + dir.y * sun.y + dir.z * sun.z;
	if (sun.y > -0.08 && sunDot > 0.9975) return 0xfff6c8;
	if (sun.y < 0.08 && -sunDot > 0.998) return 0xdde3f0;
	if (day < 0.5 && dir.y > 0.05 && starHash(dir) < 0.02 * (1 - day * 2)) return 0xe6e8ff;
	return c;
}

/** Fog color at the horizon for distance haze. */
export function fogColor(timeOfDay, dimensionId) {
	if (dimensionId === "minecraft:nether") return NETHER_FOG;
	if (dimensionId === "minecraft:the_end") return END_SKY;
	return mix(NIGHT_HORIZON, DAY_HORIZON, daylight(timeOfDay));
}

export const WATER = 0x3f76e4;
export const DEEP_WATER = 0x10245a;

const COMMON = new Set([
	"grass_block",
	"dirt",
	"stone",
	"cobblestone",
	"deepslate",
	"andesite",
	"granite",
	"diorite",
	"tuff",
	"gravel",
	"sand",
	"sandstone",
	"clay",
	"snow",
	"ice",
	"short_grass",
	"fern",
	"water"
]);

/**
 * [color, weight] samples of what photos show (blocks under face shading, shadow and night,
 * distance haze, water, sky), for building the palette in tools/make-photo-assets.mjs.
 */
export function paletteSamples() {
	/** @type {[number, number][]} */
	const bases = [];
	for (const [name, c] of Object.entries(BLOCKS)) {
		const w = COMMON.has(name) ? 6 : 1;
		if (typeof c === "number") bases.push([c, w]);
		else bases.push([c.top, w], [c.side, w], [c.bottom, w / 2]);
	}
	for (const [wood, [bark, top, planks, leaves]] of Object.entries(WOODS)) {
		const w = wood === "oak" || wood === "spruce" || wood === "birch" ? 5 : 1;
		bases.push([bark, w], [top, w / 2], [planks, w], [leaves, w * 1.5]);
	}
	for (const list of [WOOL, CONCRETE, TERRACOTTA]) for (const c of list) bases.push([c, 0.5]);
	for (const [, c] of KEYWORDS) bases.push([c, 0.3]);
	for (const [c] of Object.values(ENTITIES)) bases.push([c, 0.3]);

	/** @type {[number, number][]} */
	const out = [];
	for (const [c, w] of bases) {
		for (const shade of [1, 0.85, 0.7, 0.55]) {
			for (const [light, lw] of [[1, 1], [0.6, 0.6], [0.32, 0.3]]) out.push([scale(c, shade * light), w * lw]);
			out.push([mix(scale(c, shade), DAY_HORIZON, 0.35), w * 0.4]);
			out.push([mix(scale(c, shade), DAY_HORIZON, 0.7), w * 0.25]);
		}
	}
	for (const bed of [0xdbcfa3, 0x866043, 0x837e7e, 0x7d7d7d]) {
		for (const t of [0.5, 0.7, 0.9]) out.push([mix(bed, WATER, t), 3]);
	}
	for (let t = 0; t <= 24000; t += 1000) {
		for (let y = -0.2; y <= 1; y += 0.1) {
			const w = daylight(t) > 0.5 ? 6 : 2;
			for (const x of [-1, 0, 1]) out.push([skyColor({ x: x * Math.sqrt(1 - Math.min(1, y * y)), y, z: 0.01 }, t, "minecraft:overworld"), w]);
		}
	}
	for (const c of [0xfff6c8, 0xdde3f0, 0xe6e8ff, NETHER_FOG, END_SKY, DEEP_WATER, 0x000000, 0xffffff]) out.push([c, 2]);
	return out;
}
