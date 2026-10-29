/**
 * Vultrom Bedrock — Sapphire ore seeding, Gemstone Cutter → Jeweler bind,
 * and /function vultrom/find_sapphire (also chat: !findsapphire).
 *
 * Ore uses Script API placement (no Custom Biomes / feature_rules experiment).
 * Cutter bind: Bedrock addons cannot register a true vanilla profession/POI, so
 * right-clicking the Gemstone Cutter replaces the nearest villager_v2 with
 * vultrom:jeweler (baked gold-robe villager skin + sapphire trades).
 */
import { world, system } from "@minecraft/server";

const CUTTER = "vultrom:gemstone_cutter";
const JEWELER = "vultrom:jeweler";
const BIND_RADIUS = 5;

const ORE = "vultrom:sapphire_ore";
const REPLACEABLE = new Set(["minecraft:stone", "minecraft:deepslate"]);
const Y_MIN = -48;
const Y_MAX = 32;
const VEINS_PER_CHUNK = 2;
const ORE_PER_VEIN = 3;
const CHUNK_RADIUS = 2;
const SEED_INTERVAL_TICKS = 40;
const OVERWORLD = "minecraft:overworld";
const FIND_TAG = "vultrom_find_sapphire";
const FIND_CHUNK_RADIUS = 8;
const FIND_CHAT = "!findsapphire";

/** @type {Set<string>} */
const seededChunks = new Set();

function nearestVillager(dimension, location) {
	const candidates = dimension.getEntities({
		location,
		maxDistance: BIND_RADIUS,
		type: "minecraft:villager_v2"
	});
	let best = undefined;
	let bestDist = Number.POSITIVE_INFINITY;
	for (const entity of candidates) {
		if (!entity.isValid()) continue;
		const dx = entity.location.x - location.x;
		const dy = entity.location.y - location.y;
		const dz = entity.location.z - location.z;
		const d = dx * dx + dy * dy + dz * dz;
		if (d < bestDist) {
			bestDist = d;
			best = entity;
		}
	}
	return best;
}

function confirmJeweler(player) {
	// vultrom.rp_check is defined only in the RP lang file: a raw key in chat means the
	// client is not running the matching resource pack (stale or missing RP).
	player?.sendMessage({
		rawtext: [
			{
				text: "§bGemstone Cutter§r: that villager is now a §3Jeweler§r. Right-click them — sell 1 Sapphire for §a40–80 emeralds§r. "
			},
			{ translate: "vultrom.rp_check" }
		]
	});
}

function bindJeweler(player, block) {
	const dim = block.dimension;
	const loc = {
		x: block.location.x + 0.5,
		y: block.location.y + 0.5,
		z: block.location.z + 0.5
	};

	const villager = nearestVillager(dim, loc);
	if (!villager) {
		player?.sendMessage(
			`§bGemstone Cutter§r: no villager within ${BIND_RADIUS} blocks. Move a villager closer, then right-click the cutter.`
		);
		return;
	}

	const spawnAt = {
		x: villager.location.x,
		y: villager.location.y,
		z: villager.location.z
	};
	const yaw = villager.getRotation?.()?.y;

	// Spawn before removing so a failed spawn never deletes the villager.
	system.run(() => {
		let jeweler;
		try {
			jeweler = dim.spawnEntity(JEWELER, spawnAt);
		} catch (err) {
			console.warn("[vultrom] jeweler spawn failed:", err);
		}
		if (!jeweler?.isValid()) {
			player?.sendMessage(
				"§cGemstone Cutter§r: could not spawn a Jeweler — the villager was left in place. Make sure both Vultrom packs (BP + RP) are active."
			);
			return;
		}
		try {
			jeweler.nameTag = "Jeweler";
			if (typeof yaw === "number") jeweler.setRotation({ x: 0, y: yaw });
		} catch (_) {
			/* cosmetic only */
		}
		try {
			if (villager.isValid()) villager.remove();
		} catch (_) {
			/* already gone */
		}
		confirmJeweler(player);
	});
}

world.afterEvents.playerInteractWithBlock.subscribe((event) => {
	try {
		const block = event.block;
		if (!block || block.typeId !== CUTTER) return;
		if (event.player?.isSneaking) return;
		bindJeweler(event.player, block);
	} catch (err) {
		console.warn("[vultrom] gemstone cutter bind failed:", err);
	}
});

function hash32(n) {
	n |= 0;
	n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
	n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
	return (n ^ (n >>> 16)) >>> 0;
}

function chunkRng(cx, cz) {
	return hash32(cx * 374761393 + cz * 668265263 + 0x5a7f31);
}

function nextRng(state) {
	return hash32(state + 0x9e3779b9);
}

/** All ore attempt positions for a chunk (matches seedChunk placement walk). */
function orePositionsForChunk(cx, cz) {
	const originX = cx << 4;
	const originZ = cz << 4;
	const positions = [];
	let rng = chunkRng(cx, cz);
	for (let v = 0; v < VEINS_PER_CHUNK; v++) {
		rng = nextRng(rng);
		let x = originX + (rng % 16);
		rng = nextRng(rng);
		let z = originZ + (rng % 16);
		rng = nextRng(rng);
		let y = Y_MIN + (rng % (Y_MAX - Y_MIN + 1));

		for (let i = 0; i < ORE_PER_VEIN; i++) {
			positions.push({ x, y, z });
			rng = nextRng(rng);
			const dir = rng % 6;
			if (dir === 0) x += 1;
			else if (dir === 1) x -= 1;
			else if (dir === 2) y += 1;
			else if (dir === 3) y -= 1;
			else if (dir === 4) z += 1;
			else z -= 1;
			if (y < Y_MIN) y = Y_MIN;
			if (y > Y_MAX) y = Y_MAX;
		}
	}
	return positions;
}

function tryPlaceOre(dimension, x, y, z) {
	try {
		const loc = { x, y, z };
		const block = dimension.getBlock(loc);
		if (!block) return;
		const id = block.typeId;
		if (id === ORE) return;
		if (!REPLACEABLE.has(id)) return;
		dimension.setBlockType(loc, ORE);
	} catch (_) {
		/* unloaded / out of bounds */
	}
}

/**
 * Deterministic, idempotent vein placement for one chunk.
 * Re-running is safe: only replaces stone/deepslate.
 */
function seedChunk(dimension, cx, cz) {
	const key = `${cx},${cz}`;
	if (seededChunks.has(key)) return;

	const originX = cx << 4;
	const originZ = cz << 4;
	const probe = { x: originX + 8, y: 64, z: originZ + 8 };
	try {
		if (!dimension.getBlock(probe)) return;
	} catch (_) {
		return;
	}

	let rng = chunkRng(cx, cz);
	for (let v = 0; v < VEINS_PER_CHUNK; v++) {
		rng = nextRng(rng);
		let x = originX + (rng % 16);
		rng = nextRng(rng);
		let z = originZ + (rng % 16);
		rng = nextRng(rng);
		let y = Y_MIN + (rng % (Y_MAX - Y_MIN + 1));

		for (let i = 0; i < ORE_PER_VEIN; i++) {
			tryPlaceOre(dimension, x, y, z);
			rng = nextRng(rng);
			const dir = rng % 6;
			if (dir === 0) x += 1;
			else if (dir === 1) x -= 1;
			else if (dir === 2) y += 1;
			else if (dir === 3) y -= 1;
			else if (dir === 4) z += 1;
			else z -= 1;
			if (y < Y_MIN) y = Y_MIN;
			if (y > Y_MAX) y = Y_MAX;
		}
	}

	seededChunks.add(key);
	if (seededChunks.size > 4096) {
		seededChunks.clear();
	}
}

function seedAroundPlayers() {
	let overworld;
	try {
		overworld = world.getDimension(OVERWORLD);
	} catch (_) {
		return;
	}

	for (const player of world.getAllPlayers()) {
		try {
			if (player.dimension.id !== OVERWORLD) continue;
			const cx = Math.floor(player.location.x / 16);
			const cz = Math.floor(player.location.z / 16);
			for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx++) {
				for (let dz = -CHUNK_RADIUS; dz <= CHUNK_RADIUS; dz++) {
					seedChunk(overworld, cx + dx, cz + dz);
				}
			}
		} catch (err) {
			console.warn("[vultrom] ore seed around player failed:", err);
		}
	}
}

function distSq(ax, ay, az, bx, by, bz) {
	const dx = ax - bx;
	const dy = ay - by;
	const dz = az - bz;
	return dx * dx + dy * dy + dz * dz;
}

/**
 * Prefer deterministic vein origins (same RNG as seeding), then confirm block.
 * Falls back to a short loaded-chunk scan if none of the predicted veins exist yet.
 */
function findNearestSapphire(player) {
	const dim = player.dimension;
	const px = player.location.x;
	const py = player.location.y;
	const pz = player.location.z;
	const pcx = Math.floor(px / 16);
	const pcz = Math.floor(pz / 16);

	/** @type {{ x: number, y: number, z: number, d: number }[]} */
	const candidates = [];

	for (let dx = -FIND_CHUNK_RADIUS; dx <= FIND_CHUNK_RADIUS; dx++) {
		for (let dz = -FIND_CHUNK_RADIUS; dz <= FIND_CHUNK_RADIUS; dz++) {
			const cx = pcx + dx;
			const cz = pcz + dz;
			seedChunk(dim, cx, cz);
			for (const pos of orePositionsForChunk(cx, cz)) {
				candidates.push({
					x: pos.x,
					y: pos.y,
					z: pos.z,
					d: distSq(px, py, pz, pos.x + 0.5, pos.y + 0.5, pos.z + 0.5)
				});
			}
		}
	}

	candidates.sort((a, b) => a.d - b.d);

	for (const c of candidates) {
		try {
			const block = dim.getBlock({ x: c.x, y: c.y, z: c.z });
			if (block && block.typeId === ORE) {
				return { x: c.x, y: c.y, z: c.z, dist: Math.sqrt(c.d) };
			}
		} catch (_) {
			/* unloaded */
		}
	}

	// Fallback: scan a small box around the player for already-placed ore.
	const r = 24;
	let best = undefined;
	let bestD = Number.POSITIVE_INFINITY;
	const x0 = Math.floor(px) - r;
	const x1 = Math.floor(px) + r;
	const z0 = Math.floor(pz) - r;
	const z1 = Math.floor(pz) + r;
	const y0 = Math.max(Y_MIN, Math.floor(py) - 32);
	const y1 = Math.min(Y_MAX, Math.floor(py) + 32);
	for (let x = x0; x <= x1; x++) {
		for (let z = z0; z <= z1; z++) {
			for (let y = y0; y <= y1; y++) {
				try {
					const block = dim.getBlock({ x, y, z });
					if (!block || block.typeId !== ORE) continue;
					const d = distSq(px, py, pz, x + 0.5, y + 0.5, z + 0.5);
					if (d < bestD) {
						bestD = d;
						best = { x, y, z, dist: Math.sqrt(d) };
					}
				} catch (_) {
					/* ignore */
				}
			}
		}
	}
	return best;
}

function reportSapphireFind(player) {
	try {
		if (player.dimension.id !== OVERWORLD) {
			player.sendMessage("§bSapphire§r: only searches the Overworld.");
			return;
		}
		const hit = findNearestSapphire(player);
		if (!hit) {
			player.sendMessage(
				"§bSapphire§r: none found nearby. Explore further (ore seeds in loaded chunks, Y -48…32), then try again."
			);
			return;
		}
		const dx = hit.x + 0.5 - player.location.x;
		const dz = hit.z + 0.5 - player.location.z;
		const horiz = Math.sqrt(dx * dx + dz * dz);
		player.sendMessage(
			`§bSapphire Ore§r at §e${hit.x} ${hit.y} ${hit.z}§r (§a${Math.round(hit.dist)}m§r away, §a${Math.round(horiz)}m§r horizontal).`
		);
	} catch (err) {
		console.warn("[vultrom] find sapphire failed:", err);
		player.sendMessage("§cSapphire§r: search failed.");
	}
}

system.runInterval(() => {
	for (const player of world.getAllPlayers()) {
		try {
			if (!player.hasTag(FIND_TAG)) continue;
			player.removeTag(FIND_TAG);
			reportSapphireFind(player);
		} catch (_) {
			/* ignore */
		}
	}
}, 1);

try {
	world.beforeEvents.chatSend.subscribe((event) => {
		const msg = (event.message || "").trim().toLowerCase();
		if (msg !== FIND_CHAT && msg !== "/findsapphire") return;
		event.cancel = true;
		const player = event.sender;
		system.run(() => reportSapphireFind(player));
	});
} catch (err) {
	console.warn("[vultrom] chat !findsapphire unavailable:", err);
}

system.runInterval(seedAroundPlayers, SEED_INTERVAL_TICKS);

system.runTimeout(() => {
	console.log(
		"[vultrom] Sapphire ore + Jeweler + find_sapphire loaded. Command: /function vultrom/find_sapphire (or chat !findsapphire)."
	);
}, 1);
