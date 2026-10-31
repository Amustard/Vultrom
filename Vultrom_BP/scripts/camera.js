/**
 * Camera → Photo. Bedrock add-ons can't screenshot, so the Camera samples the world: it casts
 * a 64×64 grid of rays across the player's view (spread over ticks under a time budget shared
 * by every running capture), colors each hit from a block table (photo_colors.js) with face
 * shading, sky light, water, distance haze and sky, and quantizes to the 64-color palette.
 * The Photo item carries the picture (4096 characters; 1024 for v0.1.10's 32×32 photos) in
 * its dynamic properties.
 *
 * Viewing: using a Photo opens a form that draws it with half-block glyphs from the RP font
 * pages (glyph_E2 … glyph_F1). A form line fits 32 glyphs, so a 64×64 photo shows as a 32×32
 * overview with buttons for each full-detail quarter. Using it on the side of a block hangs
 * it as a framed picture of tile entities that each draw two rows from packed int properties
 * (FRAMES in photo_core.js: 32 vultrom:photo_tile64 for 64×64, 16 vultrom:photo_tile for 32×32).
 */
import { world, system, ItemStack, GameMode } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { showForm } from "./forms.js";
import {
	blockColor,
	isEmissive,
	ENTITIES,
	DEFAULT_ENTITY,
	INVISIBLE_ENTITIES,
	FACE_SHADE,
	skyColor,
	fogColor,
	daylight,
	mix,
	scale,
	clamp01,
	WATER,
	DEEP_WATER
} from "./photo_colors.js";
import {
	PHOTO_SIZE,
	VIEW_SIZE,
	FRAMES,
	TILE_TYPES,
	nearestColor,
	encodePixels,
	decodePixels,
	downsample,
	crop,
	photoLines,
	photoLore,
	tileProperties
} from "./photo_core.js";

const CAMERA = "vultrom:camera";
const PHOTO = "vultrom:photo";
const CUTTER = "vultrom:gemstone_cutter";
const OVERWORLD = "minecraft:overworld";

const FOV_DEG = 70;
const MAX_DIST = 96;
const FOG_START = 24;
const SKY_CHECK_DIST = 48;
const ENTITY_RANGE = 64;
const MAX_ENTITIES = 48;
const COOLDOWN_TICKS = 40;
const COOLDOWN_CATEGORY = "vultrom_camera";
// Per-tick ray budget, shared by all running captures: stop after this many ms (or MAX
// pixels per capture), but always make progress.
const TICK_BUDGET_MS = 4;
const MIN_PIXELS_PER_TICK = 4;
const MAX_PIXELS_PER_TICK = 256;
const PHOTO_PROP = "vultrom:photo";
const PIXELS_PROP = "vultrom:pixels";
const FRAME_PROP = "vultrom:frame";
const COUNTER_PROP = "vultrom:photo_count";

const NORMALS = {
	Up: { x: 0, y: 1, z: 0 },
	Down: { x: 0, y: -1, z: 0 },
	North: { x: 0, y: 0, z: -1 },
	South: { x: 0, y: 0, z: 1 },
	East: { x: 1, y: 0, z: 0 },
	West: { x: -1, y: 0, z: 0 }
};
/** Entity yaw that faces a picture out of each block side (yaw 0 faces south, +Z). */
const FACE_YAW = { North: 180, South: 0, East: -90, West: 90 };

const isWater = (typeId) => typeId.includes("water");
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
const norm = (v) => {
	const l = Math.hypot(v.x, v.y, v.z) || 1;
	return { x: v.x / l, y: v.y / l, z: v.z / l };
};

// ---------- capture ----------

/** @type {Map<string, any>} running captures by player id */
const captures = new Map();
/** @type {Map<string, number>} tick of each player's last shutter */
const lastShot = new Map();

// Grass tufts would hide everything at grazing angles (rays hit their whole block), so rays
// look through them; flowers, snow layers and other passable blocks still show.
const SEE_THROUGH = ["minecraft:short_grass", "minecraft:tall_grass", "minecraft:fern", "minecraft:large_fern", "minecraft:seagrass"];
let seeThroughSupported = true;

function castRay(dim, origin, dir, liquids, maxDistance = MAX_DIST, passable = true) {
	const options = { includeLiquidBlocks: liquids, includePassableBlocks: passable, maxDistance };
	let hit;
	try {
		hit = dim.getBlockFromRay(origin, dir, seeThroughSupported && passable ? { ...options, excludeTypes: SEE_THROUGH } : options);
	} catch (_) {
		if (!seeThroughSupported || !passable) return undefined;
		// An unknown block id in the filter throws; drop the filter for the rest of the session.
		seeThroughSupported = false;
		return castRay(dim, origin, dir, liquids, maxDistance, passable);
	}
	if (!hit?.block) return undefined;
	const { location: loc, typeId } = hit.block;
	const point = add(loc, hit.faceLocation);
	return { typeId, face: hit.face, block: loc, point, dist: Math.hypot(point.x - origin.x, point.y - origin.y, point.z - origin.z) };
}

/** Distance along `dir` to the box, and the axis of the face it enters (0 x, 1 y, 2 z). */
function rayBox(o, d, min, max) {
	let tmin = 0;
	let tmax = Infinity;
	let axis = 1;
	for (const [k, ax] of [["x", 0], ["y", 1], ["z", 2]]) {
		if (Math.abs(d[k]) < 1e-9) {
			if (o[k] < min[k] || o[k] > max[k]) return undefined;
			continue;
		}
		let t1 = (min[k] - o[k]) / d[k];
		let t2 = (max[k] - o[k]) / d[k];
		if (t1 > t2) [t1, t2] = [t2, t1];
		if (t1 > tmin) {
			tmin = t1;
			axis = ax;
		}
		tmax = Math.min(tmax, t2);
		if (tmax < tmin) return undefined;
	}
	return { t: tmin, axis };
}

function collectEntities(player, dim, origin, forward) {
	let found = [];
	try {
		found = dim.getEntities({ location: origin, maxDistance: ENTITY_RANGE });
	} catch (_) {
		return [];
	}
	const list = [];
	for (const e of found) {
		if (e.id === player.id || INVISIBLE_ENTITIES.has(e.typeId)) continue;
		const loc = e.location;
		const ahead = (loc.x - origin.x) * forward.x + (loc.y + 1 - origin.y) * forward.y + (loc.z - origin.z) * forward.z;
		if (ahead < -1) continue;
		const [color, w, h] = ENTITIES[e.typeId] ?? DEFAULT_ENTITY;
		list.push({
			color,
			min: { x: loc.x - w / 2, y: loc.y, z: loc.z - w / 2 },
			max: { x: loc.x + w / 2, y: loc.y + h, z: loc.z + w / 2 },
			d: Math.hypot(loc.x - origin.x, loc.y - origin.y, loc.z - origin.z)
		});
	}
	return list.sort((a, b) => a.d - b.d).slice(0, MAX_ENTITIES);
}

function nearestEntity(job, dir, limit) {
	let best;
	for (const e of job.entities) {
		if (e.d - 2 > limit) break;
		const hit = rayBox(job.origin, dir, e.min, e.max);
		if (hit && hit.t < limit && (!best || hit.t < best.t)) best = { ...hit, color: e.color };
	}
	return best;
}

/**
 * Sky light at a hit: open sky, dappled under leaves or glass, dim under roofs and in caves.
 * Cached per block face, since neighboring pixels mostly land on the same faces.
 */
function lightAt(job, hit) {
	if (isEmissive(hit.typeId)) return 1;
	if (job.dim.id !== OVERWORLD) return job.light;
	const key = `${hit.block.x},${hit.block.y},${hit.block.z},${hit.face}`;
	const known = job.lightCache.get(key);
	if (known !== undefined) return known;
	const from = add(hit.point, NORMALS[hit.face] ?? NORMALS.Up, 0.05);
	const cover = castRay(job.dim, from, NORMALS.Up, false, SKY_CHECK_DIST, false);
	const light = !cover ? job.light : /leaves|glass/.test(cover.typeId) ? job.light * 0.8 : job.shade;
	job.lightCache.set(key, light);
	return light;
}

/** ±6% per-block brightness so flat fields and walls keep some texture. */
function grain(hit) {
	const x = Math.floor(hit.point.x - (hit.face === "East" ? 0.01 : 0));
	const y = Math.floor(hit.point.y - (hit.face === "Up" ? 0.01 : 0));
	const z = Math.floor(hit.point.z - (hit.face === "South" ? 0.01 : 0));
	let n = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791);
	n = Math.imul(n ^ (n >>> 13), 0x5bd1e995);
	return 0.94 + (((n ^ (n >>> 15)) >>> 0) / 4294967296) * 0.12;
}

function surfaceColor(job, hit) {
	return scale(blockColor(hit.typeId, hit.face), (FACE_SHADE[hit.face] ?? 0.85) * lightAt(job, hit) * grain(hit));
}

function haze(job, color, dist) {
	const t = clamp01((dist - FOG_START) / (MAX_DIST - FOG_START));
	return mix(color, job.fog, t ** 1.5 * 0.9);
}

/** The 0xRRGGBB color seen along `dir`. */
function samplePixel(job, dir) {
	const first = castRay(job.dim, job.origin, dir, true);
	const ent = nearestEntity(job, dir, first?.dist ?? MAX_DIST);
	if (ent) {
		const shade = ent.axis === 1 ? 1 : ent.axis === 0 ? 0.7 : 0.85;
		return haze(job, scale(ent.color, shade * job.light), ent.t);
	}
	if (!first) return skyColor(dir, job.time, job.dim.id);
	if (isWater(first.typeId)) {
		const under = castRay(job.dim, job.origin, dir, false);
		const depth = Math.max(0, (under ? under.dist : first.dist + 24) - first.dist);
		const bed = under ? surfaceColor(job, under) : DEEP_WATER;
		const tint = scale(mix(WATER, DEEP_WATER, clamp01(depth / 24)), job.light);
		return haze(job, mix(bed, tint, Math.min(0.92, 0.4 + depth / 10)), first.dist);
	}
	return haze(job, surfaceColor(job, first), first.dist);
}

/** Camera basis from the player's view: forward, right and up unit vectors. */
function viewBasis(player) {
	const f = norm(player.getViewDirection());
	const yaw = (player.getRotation().y * Math.PI) / 180;
	const r = { x: -Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
	const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
	return { f, r, u: norm(u) };
}

function rayFor(job, i) {
	const x = i % job.size;
	const y = Math.floor(i / job.size);
	const sx = ((x + 0.5) / job.size) * 2 - 1;
	const sy = 1 - ((y + 0.5) / job.size) * 2;
	const { f, r, u } = job.basis;
	return norm(add(add(f, r, sx * job.tan), u, sy * job.tan));
}

function flash(player) {
	try {
		player.camera.fade({
			fadeColor: { red: 1, green: 1, blue: 1 },
			fadeTime: { fadeInTime: 0.05, holdTime: 0.05, fadeOutTime: 0.35 }
		});
		return;
	} catch (_) {
		/* older clients: fall through */
	}
	try {
		player.runCommand("camera @s fade time 0.05 0.05 0.35 color 255 255 255");
		return;
	} catch (_) {
		/* fall through */
	}
	try {
		player.onScreenDisplay.setTitle("§f\u2588\u2588\u2588", { fadeInDuration: 0, stayDuration: 2, fadeOutDuration: 6 });
	} catch (_) {
		/* cosmetic only */
	}
}

function playAt(player, sound, options = {}) {
	try {
		player.dimension.playSound(sound, player.location, options);
	} catch (_) {
		try {
			player.playSound(sound, options);
		} catch (_) {
			/* cosmetic only */
		}
	}
}

/** Shutter: sound, flash, cooldown, then the `size`×`size` capture runs over the next ticks. */
export function snap(player, size = PHOTO_SIZE) {
	const now = system.currentTick;
	if (captures.has(player.id)) return false;
	if (now - (lastShot.get(player.id) ?? -Infinity) < COOLDOWN_TICKS) return false;
	lastShot.set(player.id, now);
	try {
		player.startItemCooldown(COOLDOWN_CATEGORY, COOLDOWN_TICKS);
	} catch (_) {
		/* the script cooldown above still applies */
	}
	playAt(player, "camera.take_picture");
	flash(player);

	const dim = player.dimension;
	const time = world.getTimeOfDay();
	const day = dim.id === OVERWORLD ? 0.3 + 0.7 * daylight(time) : dim.id === "minecraft:nether" ? 0.75 : 0.8;
	const origin = player.getHeadLocation();
	const basis = viewBasis(player);
	const loc = player.location;
	captures.set(player.id, {
		player,
		dim,
		origin,
		basis,
		tan: Math.tan((FOV_DEG / 2) * (Math.PI / 180)),
		time,
		light: day,
		shade: 0.08 + 0.45 * day,
		fog: fogColor(time, dim.id),
		entities: collectEntities(player, dim, origin, basis.f),
		lightCache: new Map(),
		size,
		pixels: new Uint8Array(size * size),
		next: 0,
		shownPercent: -1,
		meta: {
			size,
			by: player.name,
			x: Math.floor(loc.x),
			y: Math.floor(loc.y),
			z: Math.floor(loc.z),
			dim: dim.id,
			day: (typeof world.getDay === "function" ? world.getDay() : Math.floor(world.getAbsoluteTime() / 24000)) + 1,
			time
		}
	});
	return true;
}

const PROGRESS_BARS = 20;

function showProgress(job) {
	const percent = Math.floor((job.next / job.pixels.length) * 100);
	if (percent === job.shownPercent) return;
	job.shownPercent = percent;
	const done = Math.floor((percent / 100) * PROGRESS_BARS);
	job.player.onScreenDisplay?.setActionBar(`§7Developing… §f${"|".repeat(done)}§8${"|".repeat(PROGRESS_BARS - done)} §7${percent}%`);
}

function stepCapture(playerId, job, deadline) {
	if (!job.player.isValid()) {
		captures.delete(playerId);
		return;
	}
	const total = job.pixels.length;
	for (let n = 0; job.next < total && n < MAX_PIXELS_PER_TICK; n++) {
		if (n >= MIN_PIXELS_PER_TICK && Date.now() >= deadline) break;
		let color = 0;
		try {
			color = samplePixel(job, rayFor(job, job.next));
		} catch (err) {
			if (!job.warned) console.warn("[vultrom] camera ray failed:", err);
			job.warned = true;
		}
		job.pixels[job.next++] = nearestColor(color);
	}
	if (job.next < total) {
		showProgress(job);
		return;
	}
	captures.delete(playerId);
	developPhoto(job);
}

function nextPhotoId() {
	const id = (Number(world.getDynamicProperty(COUNTER_PROP)) || 0) + 1;
	world.setDynamicProperty(COUNTER_PROP, id);
	return id;
}

/** @param {string} pixels encoded pixels; the photo's size follows from their count */
export function makePhotoItem(meta, pixels) {
	const item = new ItemStack(PHOTO, 1);
	item.setLore(photoLore({ ...meta, size: Math.round(Math.sqrt(pixels.length)) }));
	item.setDynamicProperty(PHOTO_PROP, JSON.stringify(meta));
	item.setDynamicProperty(PIXELS_PROP, pixels);
	return item;
}

/** Photo from its stored meta and pixels; v0.1.10 photos have no meta.size and 1024 pixels. */
function photoFrom(meta, text) {
	const pixels = decodePixels(text);
	if (!pixels || !meta) return undefined;
	return { meta, pixels, text, size: Math.round(Math.sqrt(pixels.length)) };
}

/** @returns {{ meta: any, pixels: Uint8Array, text: string, size: number } | undefined} */
export function readPhoto(item) {
	if (item?.typeId !== PHOTO) return undefined;
	try {
		return photoFrom(JSON.parse(String(item.getDynamicProperty(PHOTO_PROP))), item.getDynamicProperty(PIXELS_PROP));
	} catch (_) {
		return undefined;
	}
}

function giveItem(player, item) {
	const container = player.getComponent("minecraft:inventory")?.container;
	const leftover = container ? container.addItem(item) : item;
	if (leftover) player.dimension.spawnItem(leftover, player.location);
}

function developPhoto(job) {
	const { player } = job;
	const meta = { id: nextPhotoId(), ...job.meta };
	giveItem(player, makePhotoItem(meta, encodePixels(job.pixels)));
	player.onScreenDisplay?.setActionBar(`§fPhoto #${meta.id} developed§7 — use it to view, or use it on a wall to hang it.`);
	try {
		player.playSound("ui.cartography_table.take_result");
	} catch (_) {
		/* cosmetic only */
	}
}

system.runInterval(() => {
	if (captures.size === 0) return;
	const end = Date.now() + TICK_BUDGET_MS;
	let waiting = captures.size;
	for (const [playerId, job] of captures) {
		const now = Date.now();
		stepCapture(playerId, job, now + Math.max(0, end - now) / waiting--);
	}
}, 1);

// ---------- viewing ----------

/** Players with a Photo form open, so held-down use doesn't stack forms. */
const viewing = new Set();

const QUARTERS = [
	{ label: "Top left", x: 0, y: 0 },
	{ label: "Top right", x: 1, y: 0 },
	{ label: "Bottom left", x: 0, y: 1 },
	{ label: "Bottom right", x: 1, y: 1 }
];

/**
 * Shows a photo. 32×32 photos fit one form; bigger ones open as a half-size overview whose
 * buttons zoom into each quarter at full detail (Back returns to the overview).
 */
export async function viewPhoto(player, photo) {
	if (viewing.has(player.id)) return;
	viewing.add(player.id);
	try {
		const title = `Photo #${photo.meta.id}`;
		const info = photoLore(photo.meta).slice(0, 3);
		if (photo.size <= VIEW_SIZE) {
			await showForm(player, new ActionFormData().title(title).body([...photoLines(photo.pixels), "", ...info].join("\n")).button("Close"));
			return;
		}
		const overview = downsample(photo.pixels, photo.size);
		const part = photo.size / 2;
		for (;;) {
			const form = new ActionFormData().title(title).body([...photoLines(overview), "", ...info, "§7Pick a quarter to see it in full detail."].join("\n"));
			for (const q of QUARTERS) form.button(q.label);
			form.button("Close");
			const choice = await showForm(player, form);
			const quarter = choice.canceled ? undefined : QUARTERS[choice.selection];
			if (!quarter || !player.isValid()) return;
			const zoom = new ActionFormData()
				.title(`${title} · ${quarter.label}`)
				.body(photoLines(crop(photo.pixels, photo.size, quarter.x * part, quarter.y * part, part)).join("\n"))
				.button("Back")
				.button("Close");
			const back = await showForm(player, zoom);
			if (back.canceled || back.selection !== 0 || !player.isValid()) return;
		}
	} finally {
		viewing.delete(player.id);
	}
}

// ---------- framed pictures ----------

function tilesAt(dim, at) {
	try {
		return dim
			.getEntities({ location: { x: at.x, y: at.y + 0.5, z: at.z }, maxDistance: 0.75 })
			.filter((e) => TILE_TYPES.has(e.typeId));
	} catch (_) {
		return [];
	}
}

/** Hangs the selected Photo on `face` of `block`; returns true if it was hung. */
export function hangPhoto(player, block, face) {
	const container = player.getComponent("minecraft:inventory")?.container;
	const slot = player.selectedSlotIndex;
	const item = container?.getItem(slot);
	const photo = readPhoto(item);
	const say = (m) => player.onScreenDisplay?.setActionBar(m);
	if (!photo) {
		say("§7This photo is blank.");
		return false;
	}
	const yaw = FACE_YAW[face];
	if (yaw === undefined) {
		say("§7Hang photos on the side of a block.");
		return false;
	}
	const n = NORMALS[face];
	const dim = block.dimension;
	const spot = { x: block.location.x + n.x, y: block.location.y, z: block.location.z + n.z };
	const space = dim.getBlock(spot);
	if (!space?.isAir) {
		say("§7No room to hang a photo there.");
		return false;
	}
	const at = { x: spot.x + 0.5, y: spot.y, z: spot.z + 0.5 };
	if (tilesAt(dim, at).length > 0) {
		say("§7There's already a photo there.");
		return false;
	}
	const frame = FRAMES[photo.size];
	const frameId = `${photo.meta.id}:${system.currentTick}:${Math.floor(Math.random() * 1e9)}`;
	const spawned = [];
	try {
		for (let t = 0; t < frame.tiles; t++) {
			const tile = dim.spawnEntity(frame.entity, at);
			spawned.push(tile);
			tile.setRotation({ x: 0, y: yaw });
			if (frame.tileProperty) tile.setProperty(frame.tileProperty, t);
			else tile.triggerEvent(`${frame.tileEvent}${t}`);
			tileProperties(photo.pixels, t, photo.size).forEach((v, k) => tile.setProperty(`vultrom:p${k}`, v));
			tile.setDynamicProperty(FRAME_PROP, frameId);
		}
		// Only the first tile keeps the photo itself; the others find it by frame id.
		spawned[0].setDynamicProperty(PHOTO_PROP, JSON.stringify({ meta: photo.meta, pixels: photo.text }));
	} catch (err) {
		console.warn("[vultrom] hanging photo failed:", err);
		for (const tile of spawned) if (tile.isValid()) tile.remove();
		say("§cCouldn't hang the photo — make sure both Vultrom packs are active.");
		return false;
	}
	if (player.getGameMode() !== GameMode.creative && container.getItem(slot)?.typeId === PHOTO) container.setItem(slot, undefined);
	playAt(player, "block.itemframe.place");
	return true;
}

/** The photo a frame tile shows (v0.1.10 frames store it on every tile, newer ones on one). */
function frameRecord(tile) {
	const frameId = tile.getDynamicProperty(FRAME_PROP);
	const holders = [tile, ...tilesAt(tile.dimension, tile.location).filter((t) => t.id !== tile.id && t.getDynamicProperty(FRAME_PROP) === frameId)];
	for (const holder of holders) {
		const stored = holder.getDynamicProperty(PHOTO_PROP);
		if (stored === undefined) continue;
		try {
			const record = JSON.parse(String(stored));
			return photoFrom(record.meta, record.pixels);
		} catch (_) {
			return undefined;
		}
	}
	return undefined;
}

/** Takes down the framed photo `tile` belongs to; drops the Photo unless in creative. */
export function takeDownPhoto(tile, player) {
	const frameId = tile.getDynamicProperty(FRAME_PROP);
	const photo = frameRecord(tile);
	const dim = tile.dimension;
	const at = tile.location;
	for (const other of tilesAt(dim, at)) {
		if (other.getDynamicProperty(FRAME_PROP) === frameId) other.remove();
	}
	if (tile.isValid()) tile.remove();
	if (photo && player?.getGameMode() !== GameMode.creative) {
		dim.spawnItem(makePhotoItem(photo.meta, photo.text), { x: at.x, y: at.y + 0.5, z: at.z });
	}
	try {
		dim.playSound("block.itemframe.break", at);
	} catch (_) {
		/* cosmetic only */
	}
}

// ---------- events ----------

/** Tick of each player's last Photo use on a block, so the same click doesn't also view it. */
const blockUseTick = new Map();

world.afterEvents.itemUse.subscribe((event) => {
	const player = event.source;
	const id = event.itemStack?.typeId;
	if (player?.typeId !== "minecraft:player" || (id !== CAMERA && id !== PHOTO)) return;
	if (id === CAMERA) {
		snap(player);
		return;
	}
	if (system.currentTick - (blockUseTick.get(player.id) ?? -Infinity) < 5) return;
	const photo = readPhoto(event.itemStack);
	if (!photo) {
		player.onScreenDisplay?.setActionBar("§7This photo is blank.");
		return;
	}
	viewPhoto(player, photo).catch((err) => console.warn("[vultrom] photo viewer failed:", err));
});

// Using the Camera on a block takes a photo too (instead of opening or using the block); the
// Gemstone Cutter keeps its menu. A Photo used on a block side hangs; sneak to view instead.
world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
	const { player, block } = event;
	const id = event.itemStack?.typeId;
	if ((id !== CAMERA && id !== PHOTO) || !player || block?.typeId === CUTTER) return;
	event.cancel = true;
	if (!event.isFirstEvent) return;
	blockUseTick.set(player.id, system.currentTick);
	const face = event.blockFace;
	const sneaking = player.isSneaking;
	system.run(() => {
		try {
			if (!player.isValid()) return;
			if (id === CAMERA) {
				snap(player);
				return;
			}
			const held = player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex);
			if (sneaking || FACE_YAW[face] === undefined) {
				const photo = readPhoto(held);
				if (photo) viewPhoto(player, photo).catch((err) => console.warn("[vultrom] photo viewer failed:", err));
				else player.onScreenDisplay?.setActionBar("§7This photo is blank.");
				return;
			}
			if (block.isValid()) hangPhoto(player, block, face);
		} catch (err) {
			console.warn("[vultrom] camera/photo use failed:", err);
		}
	});
});

world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
	const { target, player } = event;
	if (!TILE_TYPES.has(target?.typeId) || !player) return;
	event.cancel = true;
	system.run(() => {
		if (!target.isValid() || !player.isValid()) return;
		const photo = frameRecord(target);
		if (photo) viewPhoto(player, photo).catch((err) => console.warn("[vultrom] photo viewer failed:", err));
	});
});

world.afterEvents.entityHitEntity.subscribe((event) => {
	const { hitEntity, damagingEntity } = event;
	if (!TILE_TYPES.has(hitEntity?.typeId) || damagingEntity?.typeId !== "minecraft:player") return;
	try {
		if (hitEntity.isValid()) takeDownPhoto(hitEntity, damagingEntity);
	} catch (err) {
		console.warn("[vultrom] taking down photo failed:", err);
	}
});
