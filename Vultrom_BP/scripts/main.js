/**
 * Vultrom Bedrock — Sapphire ore seeding, Fortune bonus drops, Gemstone Cutter → Jeweler
 * bind, and /function vultrom/find_sapphire (also chat: !findsapphire with Beta APIs).
 *
 * Ore uses Script API placement (no Custom Biomes / feature_rules experiment).
 * Cutter bind: Bedrock addons cannot register a true vanilla profession/POI, so
 * right-clicking the Gemstone Cutter replaces the nearest villager_v2 with
 * vultrom:jeweler (vanilla villager_v2 behavior with the Jeweler profession). Using the
 * cutter while holding Raw Sapphire cuts it into Sapphire (sneak cuts the whole stack).
 * The Jeweler shows a sapphire in his arms while a player trades with him.
 */
import { world, system, BlockTypes, ItemStack, GameMode } from "@minecraft/server";

const CUTTER = "vultrom:gemstone_cutter";
const JEWELER = "vultrom:jeweler";
const BIND_RADIUS = 5;

const ORE = "vultrom:sapphire_ore";
const RAW = "vultrom:raw_sapphire";
const SAPPHIRE = "vultrom:sapphire";
const SCRAPS = "vultrom:sapphire_scraps";
const RAW_SAPPHIRE_PICKAXES = new Set(["minecraft:diamond_pickaxe", "minecraft:netherite_pickaxe"]);
const REPLACEABLE = new Set([
	"minecraft:stone",
	"minecraft:deepslate",
	"minecraft:granite",
	"minecraft:diorite",
	"minecraft:andesite",
	"minecraft:tuff"
]);
// Y range and ORE_PER_VEIN feed the deterministic walk: changing them moves every
// existing vein. Raising VEINS_PER_CHUNK only appends veins, so older ore stays findable.
const Y_MIN = -48;
const Y_MAX = 32;
const VEINS_PER_CHUNK = 5;
const ORE_PER_VEIN = 3;
const CHUNK_RADIUS = 4;
const SEED_INTERVAL_TICKS = 20;
const OVERWORLD = "minecraft:overworld";
const FIND_TAG = "vultrom_find_sapphire";
const FIND_CHUNK_RADIUS = 12;
const FIND_SCAN_RADIUS = 8;
const FIND_CHAT = "!findsapphire";

/** @type {Set<string>} */
const seededChunks = new Set();
let placeErrorLogged = false;

function oreRegistered() {
	return BlockTypes.get(ORE) !== undefined;
}

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

const CUTTER_HINT = "§bGemstone Cutter§r: right-click with §3Raw Sapphire§r to cut, sneak to cut all.";

/** Converts the nearest villager into this cutter's Jeweler; returns false if nobody was converted. */
function bindJeweler(player, block) {
	const dim = block.dimension;
	const loc = {
		x: block.location.x + 0.5,
		y: block.location.y + 0.5,
		z: block.location.z + 0.5
	};

	// Like a vanilla workstation, one cutter employs one Jeweler; using the cutter again
	// must not convert the next villager that wanders by.
	const claimed = dim.getEntities({ location: loc, maxDistance: BIND_RADIUS, type: JEWELER });
	if (claimed.length > 0) {
		player?.onScreenDisplay?.setActionBar(CUTTER_HINT);
		return false;
	}

	const villager = nearestVillager(dim, loc);
	if (!villager) {
		player?.onScreenDisplay?.setActionBar(
			`${CUTTER_HINT}\nBring a villager within ${BIND_RADIUS} blocks to train a §3Jeweler§r.`
		);
		return false;
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
	return true;
}

/** Cuts the Raw Sapphire in the player's selected slot: one, or the whole stack. */
function cutRawSapphire(player, wholeStack) {
	const container = player.getComponent("minecraft:inventory")?.container;
	if (!container) return;
	const slot = player.selectedSlotIndex;
	const held = container.getItem(slot);
	if (!held || held.typeId !== RAW) return;

	const count = wholeStack ? held.amount : 1;
	if (held.amount > count) {
		held.amount -= count;
		container.setItem(slot, held);
	} else {
		container.setItem(slot, undefined);
	}
	const leftover = container.addItem(new ItemStack(SAPPHIRE, count));
	if (leftover) player.dimension.spawnItem(leftover, player.location);

	try {
		player.playSound("block.stonecutter.use");
	} catch (_) {
		/* cosmetic only */
	}
	player.onScreenDisplay?.setActionBar(
		`§bGemstone Cutter§r: cut ${count} Raw Sapphire into §3${count} Sapphire§r.`
	);
}

// The cutter is deliberately not an interactive block (no crafting_table or custom
// component): on interactive blocks a plain right-click runs the block's interaction
// instead of this event, which left v0.1.5 cutting only while sneaking.
world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
	const { block, player } = event;
	if (block?.typeId !== CUTTER || !player) return;
	const holdingRaw = event.itemStack?.typeId === RAW;
	const sneaking = player.isSneaking;
	// Behave like a workstation: a plain click never places or uses the held item on the
	// cutter; sneak-clicking with a block still places it against the cutter.
	if (holdingRaw || !sneaking) event.cancel = true;
	if (!event.isFirstEvent) return;
	const holdingOther = !holdingRaw && event.itemStack !== undefined;
	if (sneaking && holdingOther) return;

	system.run(() => {
		try {
			if (!player.isValid() || !block.isValid() || block.typeId !== CUTTER) return;
			if (holdingRaw) {
				cutRawSapphire(player, sneaking);
			} else if (sneaking) {
				player.onScreenDisplay?.setActionBar(CUTTER_HINT);
			} else {
				bindJeweler(player, block);
			}
		} catch (err) {
			console.warn("[vultrom] gemstone cutter failed:", err);
		}
	});
});

// While a player trades with a Jeweler, the client shows a sapphire in his crossed arms
// (bone "trade_sapphire", visible when this synced property is true).
const TRADING = "vultrom:trading";
// The trade screen freezes the player, so the first move or turn after it settles means
// the screen was closed.
const TRADE_SETTLE_TICKS = 6;
const TRADE_MAX_MOVE = 0.2;
const TRADE_MAX_TURN_DEG = 3;
const TRADE_MAX_DIST = 8;
const TRADE_SWEEP_RADIUS = 48;

/** @type {Map<string, { jeweler: import("@minecraft/server").Entity, player: import("@minecraft/server").Player, settleTick: number, base?: { loc: import("@minecraft/server").Vector3, rot: import("@minecraft/server").Vector2 } }>} */
const trades = new Map();

function setTrading(jeweler, on) {
	try {
		if (jeweler.isValid() && jeweler.getProperty(TRADING) !== on) jeweler.setProperty(TRADING, on);
	} catch (err) {
		console.warn("[vultrom] jeweler trade pose failed:", err);
	}
}

function distance(a, b) {
	return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function turned(a, b) {
	const yaw = Math.abs((((a.y - b.y) % 360) + 540) % 360 - 180);
	return yaw > TRADE_MAX_TURN_DEG || Math.abs(a.x - b.x) > TRADE_MAX_TURN_DEG;
}

world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
	const { target, player } = event;
	if (target?.typeId !== JEWELER || !player) return;
	system.run(() => {
		if (!target.isValid() || !player.isValid()) return;
		trades.set(target.id, { jeweler: target, player, settleTick: system.currentTick + TRADE_SETTLE_TICKS });
		setTrading(target, true);
	});
});

system.runInterval(() => {
	for (const [id, trade] of trades) {
		const { jeweler, player } = trade;
		if (!jeweler.isValid() || !player.isValid()) {
			trades.delete(id);
			setTrading(jeweler, false);
			continue;
		}
		if (system.currentTick < trade.settleTick) continue;
		const pose = { loc: player.location, rot: player.getRotation() };
		if (!trade.base) {
			trade.base = pose;
			continue;
		}
		if (
			distance(pose.loc, trade.base.loc) > TRADE_MAX_MOVE ||
			turned(pose.rot, trade.base.rot) ||
			distance(player.location, jeweler.location) > TRADE_MAX_DIST
		) {
			trades.delete(id);
			setTrading(jeweler, false);
		}
	}
}, 2);

// A world closed mid-trade saves the property as true; drop the sapphire on reload.
system.runInterval(() => {
	for (const player of world.getAllPlayers()) {
		let nearby;
		try {
			nearby = player.dimension.getEntities({
				location: player.location,
				maxDistance: TRADE_SWEEP_RADIUS,
				type: JEWELER
			});
		} catch (_) {
			continue;
		}
		for (const jeweler of nearby) {
			if (!trades.has(jeweler.id)) setTrading(jeweler, false);
		}
	}
}, 40);

/** Vanilla ore Fortune: count × (1 + max(0, rand[0, level+1] − 1)); returns the extra items. */
function fortuneBonus(level) {
	if (level <= 0) return 0;
	return Math.max(0, Math.floor(Math.random() * (level + 2)) - 1);
}

// The loot table drops 1 raw sapphire and Silk Touch drops the ore block (the engine skips
// minecraft:loot for Silk Touch). Loot tables cannot read Fortune III, so Fortune is applied here.
/** Removes the ore item Silk Touch dropped at `center`; returns false if it isn't there yet. */
function removeSilkTouchOreDrop(dimension, center) {
	for (const entity of dimension.getEntities({ location: center, maxDistance: 1.5, type: "minecraft:item" })) {
		if (entity.getComponent("minecraft:item")?.itemStack?.typeId === ORE) {
			entity.remove();
			return true;
		}
	}
	return false;
}

// Only diamond and netherite pickaxes get Raw Sapphire (the loot table's match_tool pools);
// anything else, including lower-tier Silk Touch, gets Sapphire Scraps instead.
world.afterEvents.playerBreakBlock.subscribe((event) => {
	try {
		if (event.brokenBlockPermutation.type.id !== ORE) return;
		if (event.player.getGameMode() === GameMode.creative) return;
		const tool = event.itemStackBeforeBreak;
		const enchantable = /** @type {import("@minecraft/server").ItemEnchantableComponent | undefined} */ (
			tool?.getComponent("minecraft:enchantable")
		);
		const silkTouch = !!enchantable?.getEnchantment("silk_touch");
		const { x, y, z } = event.block.location;
		const center = { x: x + 0.5, y: y + 0.5, z: z + 0.5 };
		const dimension = event.dimension;

		if (tool && RAW_SAPPHIRE_PICKAXES.has(tool.typeId)) {
			if (silkTouch) return;
			const bonus = fortuneBonus(enchantable?.getEnchantment("fortune")?.level ?? 0);
			if (bonus > 0) dimension.spawnItem(new ItemStack(RAW, bonus), center);
			return;
		}

		if (silkTouch && !removeSilkTouchOreDrop(dimension, center)) {
			system.run(() => removeSilkTouchOreDrop(dimension, center));
		}
		const scraps = new ItemStack(SCRAPS, 1);
		scraps.setLore(["Sad to look at"]);
		dimension.spawnItem(scraps, center);
	} catch (err) {
		console.warn("[vultrom] sapphire ore drop failed:", err);
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
	} catch (err) {
		if (!placeErrorLogged) {
			placeErrorLogged = true;
			console.warn("[vultrom] sapphire ore placement failed:", err);
		}
	}
}

/**
 * Deterministic, idempotent vein placement for one chunk.
 * Re-running is safe: only replaces stone-type blocks.
 */
function seedChunk(dimension, cx, cz) {
	const key = `${cx},${cz}`;
	if (seededChunks.has(key)) return;
	if (!oreRegistered()) return;

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

	// Fallback: hand-placed ore near the player. Kept small so one tick stays well under the
	// script watchdog limit.
	const r = FIND_SCAN_RADIUS;
	let best = undefined;
	let bestD = Number.POSITIVE_INFINITY;
	const x0 = Math.floor(px) - r;
	const x1 = Math.floor(px) + r;
	const z0 = Math.floor(pz) - r;
	const z1 = Math.floor(pz) + r;
	const y0 = Math.floor(py) - r;
	const y1 = Math.floor(py) + r;
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
		if (!oreRegistered()) {
			player.sendMessage(
				"§cSapphire§r: the Sapphire Ore block failed to load, so none can generate. Re-import the Vultrom behavior pack and check the content log."
			);
			return;
		}
		const hit = findNearestSapphire(player);
		if (!hit) {
			player.sendMessage(
				`§bSapphire§r: none found within ${FIND_CHUNK_RADIUS * 16} blocks. Ore only seeds in loaded chunks (Y ${Y_MIN}…${Y_MAX}) — explore, then try again.`
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
	if (!oreRegistered()) {
		console.warn(`[vultrom] ${ORE} is not registered — sapphire ore cannot generate.`);
	}
	console.log(
		"[vultrom] Sapphire ore + Jeweler + find_sapphire loaded. Command: /function vultrom/find_sapphire (or chat !findsapphire)."
	);
}, 1);
