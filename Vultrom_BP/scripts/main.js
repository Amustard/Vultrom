/**
 * Vultrom Bedrock — Sapphire ore seeding + Gemstone Cutter → Jeweler bind.
 *
 * Ore uses Script API placement (no Custom Biomes / feature_rules experiment).
 * Cutter bind: Bedrock addons cannot register a true vanilla profession/POI, so
 * right-clicking the Gemstone Cutter replaces the nearest villager_v2 with
 * vultrom:jeweler (gold-robe overlay + sapphire trades).
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
		if (!entity.isValid) continue;
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

world.afterEvents.playerInteractWithBlock.subscribe((event) => {
	try {
		const block = event.block;
		if (!block || block.typeId !== CUTTER) return;
		if (event.player?.isSneaking) return;

		const dim = block.dimension;
		const loc = {
			x: block.location.x + 0.5,
			y: block.location.y + 0.5,
			z: block.location.z + 0.5
		};

		const villager = nearestVillager(dim, loc);
		if (!villager) {
			event.player.sendMessage(
				`§bGemstone Cutter§r: no villager within ${BIND_RADIUS} blocks. Move a villager closer, then right-click the cutter.`
			);
			return;
		}

		const spawnAt = {
			x: villager.location.x,
			y: villager.location.y,
			z: villager.location.z
		};
		villager.remove();
		const jeweler = dim.spawnEntity(JEWELER, spawnAt);
		if (jeweler) {
			try {
				jeweler.nameTag = "Jeweler";
			} catch (_) {
				/* ignore */
			}
			event.player.sendMessage(
				"§bGemstone Cutter§r: that villager is now a §3Jeweler§r. Right-click them — sell 1 Sapphire for §a40–80 emeralds§r."
			);
		} else {
			event.player.sendMessage("§cGemstone Cutter§r: failed to spawn Jeweler.");
		}
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

system.runInterval(seedAroundPlayers, SEED_INTERVAL_TICKS);

system.runTimeout(() => {
	console.log("[vultrom] Sapphire ore seeding + Jeweler scripts loaded (no Custom Biomes required).");
}, 1);
