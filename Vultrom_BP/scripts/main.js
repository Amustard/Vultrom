/**
 * Vultrom Bedrock — Sapphire and Ruby ore seeding, Fortune bonus drops, Gemstone Cutter →
 * Jeweler bind, and /function vultrom/find_sapphire + vultrom/find_ruby (also chat:
 * !findsapphire / !findruby with Beta APIs).
 *
 * Ore uses Script API placement (no Custom Biomes / feature_rules experiment).
 * Cutter bind: Bedrock addons cannot register a true vanilla profession/POI, so
 * right-clicking the Gemstone Cutter replaces the nearest villager_v2 with
 * vultrom:jeweler (vanilla villager_v2 behavior with the Jeweler profession). Using the
 * cutter while holding Raw Sapphire or Raw Ruby cuts it into the gem (sneak cuts the whole
 * stack). After a player sells him a gem, the Jeweler holds that gem and celebrates for
 * ~8 seconds.
 */
import { world, system, BlockTypes, ItemStack, GameMode } from "@minecraft/server";

const CUTTER = "vultrom:gemstone_cutter";
const JEWELER = "vultrom:jeweler";
const BIND_RADIUS = 5;

const ORE = "vultrom:sapphire_ore";
const RAW = "vultrom:raw_sapphire";
const SAPPHIRE = "vultrom:sapphire";
const SCRAPS = "vultrom:sapphire_scraps";
const RUBY_ORE = "vultrom:ruby_ore";
const DEEPSLATE_RUBY_ORE = "vultrom:deepslate_ruby_ore";
const RAW_RUBY = "vultrom:raw_ruby";
const RUBY = "vultrom:ruby";
const RUBY_SCRAPS = "vultrom:ruby_scraps";
const RAW_GEM_PICKAXES = new Set(["minecraft:diamond_pickaxe", "minecraft:netherite_pickaxe"]);
/** Ore block → its raw gem (diamond/netherite pickaxe) and its scraps (anything else). */
const ORE_DROPS = new Map([
	[ORE, { raw: RAW, scraps: SCRAPS }],
	[RUBY_ORE, { raw: RAW_RUBY, scraps: RUBY_SCRAPS }],
	[DEEPSLATE_RUBY_ORE, { raw: RAW_RUBY, scraps: RUBY_SCRAPS }]
]);
/** Gemstone Cutter recipes: raw gem → cut gem, 1:1. */
const CUTS = new Map([
	[RAW, { gem: SAPPHIRE, rawName: "Raw Sapphire", gemName: "§3Sapphire" }],
	[RAW_RUBY, { gem: RUBY, rawName: "Raw Ruby", gemName: "§cRuby" }]
]);
const DEEPSLATE_HOSTS = new Set(["minecraft:deepslate", "minecraft:tuff"]);
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
const FIND_CHUNK_RADIUS = 12;
const FIND_SCAN_RADIUS = 8;

/**
 * Script-seeded gem ores. Each gem walks its own deterministic vein RNG (`salt`), so adding
 * ruby left every sapphire vein where it was. `place` picks the ore for a host block id, or
 * undefined to leave it alone.
 */
const GEMS = [
	{
		label: "Sapphire",
		color: "§b",
		salt: 0x5a7f31,
		ores: new Set([ORE]),
		place: (host) => (REPLACEABLE.has(host) ? ORE : undefined),
		findTag: "vultrom_find_sapphire",
		chat: new Set(["!findsapphire", "/findsapphire"])
	},
	{
		label: "Ruby",
		color: "§c",
		salt: 0x3c6ef3,
		ores: new Set([RUBY_ORE, DEEPSLATE_RUBY_ORE]),
		place: (host) => (!REPLACEABLE.has(host) ? undefined : DEEPSLATE_HOSTS.has(host) ? DEEPSLATE_RUBY_ORE : RUBY_ORE),
		findTag: "vultrom_find_ruby",
		chat: new Set(["!findruby", "/findruby"])
	}
];

/** @type {Set<string>} */
const seededChunks = new Set();
let placeErrorLogged = false;

function gemRegistered(gem) {
	for (const ore of gem.ores) {
		if (BlockTypes.get(ore) === undefined) return false;
	}
	return true;
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

const CUTTER_HINT = "§bGemstone Cutter§r: right-click with §3Raw Sapphire§r or §cRaw Ruby§r to cut, sneak to cut all.";

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

/** Cuts the raw gem in the player's selected slot: one, or the whole stack. */
function cutRawGem(player, wholeStack) {
	const container = player.getComponent("minecraft:inventory")?.container;
	if (!container) return;
	const slot = player.selectedSlotIndex;
	const held = container.getItem(slot);
	const cut = held && CUTS.get(held.typeId);
	if (!cut) return;

	const count = wholeStack ? held.amount : 1;
	if (held.amount > count) {
		held.amount -= count;
		container.setItem(slot, held);
	} else {
		container.setItem(slot, undefined);
	}
	const leftover = container.addItem(new ItemStack(cut.gem, count));
	if (leftover) player.dimension.spawnItem(leftover, player.location);

	try {
		player.playSound("block.stonecutter.use");
	} catch (_) {
		/* cosmetic only */
	}
	player.onScreenDisplay?.setActionBar(
		`§bGemstone Cutter§r: cut ${count} ${cut.rawName} into ${cut.gemName} ×${count}§r.`
	);
}

// The cutter is deliberately not an interactive block (no crafting_table or custom
// component): on interactive blocks a plain right-click runs the block's interaction
// instead of this event, which left v0.1.5 cutting only while sneaking.
world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
	const { block, player } = event;
	if (block?.typeId !== CUTTER || !player) return;
	const holdingRaw = CUTS.has(event.itemStack?.typeId);
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
				cutRawGem(player, sneaking);
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

// The Jeweler holds the gem he was last sold (bones "held_sapphire" / "held_ruby", synced
// int property HELD_GEM) only after a player has sold him one. Bedrock has no trade event,
// so each player who opens his trade screen gets a session that watches their gem and
// emerald counts: a gem count going down while emeralds go up is a sale. When that player
// closes the screen, the Jeweler celebrates (CELEBRATING: hops, strolls fast, cheers,
// raises the gem).
const HELD_GEM = "vultrom:held_gem";
const CELEBRATING = "vultrom:celebrating";
const EMERALD = "minecraft:emerald";
const NO_GEM = 0;
const GEM_SAPPHIRE = 1;
const GEM_RUBY = 2;
// The trade screen freezes the player, so the first move or turn after it settles means
// the screen was closed.
const TRADE_SETTLE_TICKS = 6;
const TRADE_MAX_MOVE = 0.2;
const TRADE_MAX_TURN_DEG = 3;
const TRADE_MAX_DIST = 8;
// Items left in the trade slots (or on the cursor) return to the inventory on close.
const TRADE_CLOSE_RECHECK_TICKS = 4;
const TRADE_SWEEP_RADIUS = 48;
const CELEBRATION_TICKS = 160;

/** @typedef {{ sapphires: number, rubies: number, emeralds: number }} TradeCounts */
/**
 * Open trade screens, keyed by player id. `ref` is the inventory at the last sale (or at
 * opening); `prev` is the inventory at the last poll.
 * @type {Map<string, { player: import("@minecraft/server").Player, jeweler: import("@minecraft/server").Entity, jewelerId: string, ref: TradeCounts, prev: TradeCounts, lastDrop: { [gem: number]: number }, gem: number, saleTick: number, settleTick: number, base?: { loc: import("@minecraft/server").Vector3, rot: import("@minecraft/server").Vector2 } }>}
 */
const sessions = new Map();
/**
 * Running celebrations, keyed by jeweler id.
 * @type {Map<string, { jeweler: import("@minecraft/server").Entity, gem: number, endTick: number, nextHop: number, nextCheer: number, nextSparkle: number }>}
 */
const celebrations = new Map();

function setFlag(jeweler, name, value) {
	try {
		if (jeweler.isValid() && jeweler.getProperty(name) !== value) jeweler.setProperty(name, value);
	} catch (err) {
		console.warn(`[vultrom] jeweler ${name} failed:`, err);
	}
}

function distance(a, b) {
	return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function turned(a, b) {
	const yaw = Math.abs((((a.y - b.y) % 360) + 540) % 360 - 180);
	return yaw > TRADE_MAX_TURN_DEG || Math.abs(a.x - b.x) > TRADE_MAX_TURN_DEG;
}

function countTradeItems(player) {
	const counts = { sapphires: 0, rubies: 0, emeralds: 0 };
	const container = player.getComponent("minecraft:inventory")?.container;
	if (!container) return counts;
	for (let slot = 0; slot < container.size; slot++) {
		const item = container.getItem(slot);
		if (!item) continue;
		if (item.typeId === SAPPHIRE) counts.sapphires += item.amount;
		else if (item.typeId === RUBY) counts.rubies += item.amount;
		else if (item.typeId === EMERALD) counts.emeralds += item.amount;
	}
	return counts;
}

/** Records a sale in `session` if one happened since the last one; returns true if so. */
function checkSale(session) {
	const now = countTradeItems(session.player);
	const tick = system.currentTick;
	if (now.sapphires < session.prev.sapphires) session.lastDrop[GEM_SAPPHIRE] = tick;
	if (now.rubies < session.prev.rubies) session.lastDrop[GEM_RUBY] = tick;
	session.prev = now;
	const { ref } = session;
	const soldSapphire = now.sapphires < ref.sapphires;
	const soldRuby = now.rubies < ref.rubies;
	if (now.emeralds <= ref.emeralds || (!soldSapphire && !soldRuby)) return false;
	// The trade screen moves a gem into its input slot when its trade is selected, so with
	// both counts down the gem that left the inventory most recently is the one sold.
	if (soldSapphire && soldRuby) {
		session.gem = (session.lastDrop[GEM_RUBY] ?? -1) > (session.lastDrop[GEM_SAPPHIRE] ?? -1) ? GEM_RUBY : GEM_SAPPHIRE;
	} else {
		session.gem = soldRuby ? GEM_RUBY : GEM_SAPPHIRE;
	}
	session.saleTick = tick;
	session.ref = now;
	return true;
}

function refreshHold(jeweler, jewelerId) {
	if (!jeweler.isValid()) return;
	let gem = celebrations.get(jewelerId)?.gem ?? NO_GEM;
	if (gem === NO_GEM) {
		let latest = -1;
		for (const session of sessions.values()) {
			if (session.gem !== NO_GEM && session.jewelerId === jewelerId && session.saleTick > latest) {
				latest = session.saleTick;
				gem = session.gem;
			}
		}
	}
	setFlag(jeweler, HELD_GEM, gem);
}

function endSession(playerId, session) {
	sessions.delete(playerId);
	system.runTimeout(() => {
		try {
			if (session.player.isValid()) checkSale(session);
		} catch (err) {
			console.warn("[vultrom] jeweler sale check failed:", err);
		}
		if (session.gem !== NO_GEM && session.jeweler.isValid()) startCelebration(session.jeweler, session.jewelerId, session.gem);
		else refreshHold(session.jeweler, session.jewelerId);
	}, TRADE_CLOSE_RECHECK_TICKS);
}

function playSoundAt(jeweler, sound, pitch) {
	const options = { pitch, volume: 1 };
	if (typeof jeweler.dimension.playSound === "function") jeweler.dimension.playSound(sound, jeweler.location, options);
	else world.playSound(sound, jeweler.location, options);
}

function sparkle(jeweler, count) {
	const { x, y, z } = jeweler.location;
	for (let i = 0; i < count; i++) {
		jeweler.dimension.spawnParticle("minecraft:villager_happy", {
			x: x + (Math.random() - 0.5) * 1.2,
			y: y + 1.6 + Math.random() * 0.8,
			z: z + (Math.random() - 0.5) * 1.2
		});
	}
}

function startCelebration(jeweler, jewelerId, gem) {
	const now = system.currentTick;
	const running = celebrations.get(jewelerId);
	if (running) {
		running.endTick = now + CELEBRATION_TICKS;
		running.gem = gem;
		setFlag(jeweler, HELD_GEM, gem);
		return;
	}
	celebrations.set(jewelerId, { jeweler, gem, endTick: now + CELEBRATION_TICKS, nextHop: now + 4, nextCheer: now + 30, nextSparkle: now + 6 });
	try {
		jeweler.triggerEvent("vultrom:start_sale_celebration");
	} catch (err) {
		console.warn("[vultrom] jeweler celebration start failed:", err);
	}
	setFlag(jeweler, HELD_GEM, gem);
	setFlag(jeweler, CELEBRATING, true);
	try {
		playSoundAt(jeweler, "mob.villager.yes", 1.1);
		sparkle(jeweler, 8);
	} catch (err) {
		console.warn("[vultrom] jeweler celebration effects failed:", err);
	}
}

/** Jewelers whose AI was reset since the script (re)loaded, by id. */
const aiReset = new Set();

/**
 * Puts the Jeweler back to normal villager AI. Removing a component group deletes every
 * component it defines, base ones included, so vultrom:stop_sale_celebration re-adds the
 * normal wander goal and restarts the schedule (which re-adds the work/gather/home/bed group).
 */
function resetJeweler(jeweler, jewelerId) {
	try {
		jeweler.triggerEvent("vultrom:stop_sale_celebration");
	} catch (err) {
		console.warn("[vultrom] jeweler AI reset failed:", err);
		return;
	}
	if (aiReset.size > 4096) aiReset.clear();
	aiReset.add(jewelerId);
	setFlag(jeweler, CELEBRATING, false);
}

function stopCelebration(jeweler, jewelerId) {
	celebrations.delete(jewelerId);
	if (!jeweler.isValid()) return;
	resetJeweler(jeweler, jewelerId);
	refreshHold(jeweler, jewelerId);
}

function tickCelebration(jewelerId, party, now) {
	const { jeweler } = party;
	if (!jeweler.isValid()) {
		celebrations.delete(jewelerId);
		return;
	}
	if (now >= party.endTick) {
		stopCelebration(jeweler, jewelerId);
		return;
	}
	try {
		if (now >= party.nextSparkle) {
			sparkle(jeweler, 2);
			party.nextSparkle = now + 6;
		}
		if (now >= party.nextCheer) {
			playSoundAt(jeweler, "mob.villager.yes", 0.9 + Math.random() * 0.4);
			party.nextCheer = now + 30 + Math.floor(Math.random() * 16);
		}
		if (now >= party.nextHop && jeweler.isOnGround) {
			jeweler.applyImpulse({ x: (Math.random() - 0.5) * 0.3, y: 0.42, z: (Math.random() - 0.5) * 0.3 });
			party.nextHop = now + 14 + Math.floor(Math.random() * 11);
		}
	} catch (err) {
		console.warn("[vultrom] jeweler celebration tick failed:", err);
	}
}

world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
	const { target, player } = event;
	if (target?.typeId !== JEWELER || !player) return;
	system.run(() => {
		if (!target.isValid() || !player.isValid()) return;
		const jewelerId = target.id;
		// Trading again ends the outburst; the next sale starts a new one.
		if (celebrations.has(jewelerId)) stopCelebration(target, jewelerId);
		const settleTick = system.currentTick + TRADE_SETTLE_TICKS;
		const open = sessions.get(player.id);
		if (open?.jewelerId === jewelerId) {
			open.settleTick = settleTick;
			open.base = undefined;
			return;
		}
		if (open) endSession(player.id, open);
		const counts = countTradeItems(player);
		sessions.set(player.id, {
			player,
			jeweler: target,
			jewelerId,
			ref: counts,
			prev: counts,
			lastDrop: {},
			gem: NO_GEM,
			saleTick: -1,
			settleTick
		});
	});
});

system.runInterval(() => {
	const now = system.currentTick;
	for (const [playerId, session] of sessions) {
		const { jeweler, player } = session;
		if (!jeweler.isValid() || !player.isValid()) {
			endSession(playerId, session);
			continue;
		}
		if (checkSale(session)) setFlag(jeweler, HELD_GEM, session.gem);
		if (now < session.settleTick) continue;
		const pose = { loc: player.location, rot: player.getRotation() };
		if (!session.base) {
			session.base = pose;
			continue;
		}
		if (
			distance(pose.loc, session.base.loc) > TRADE_MAX_MOVE ||
			turned(pose.rot, session.base.rot) ||
			distance(player.location, jeweler.location) > TRADE_MAX_DIST
		) {
			endSession(playerId, session);
		}
	}
	for (const [jewelerId, party] of celebrations) tickCelebration(jewelerId, party, now);
}, 2);

// A world closed mid-sale or mid-outburst saves the properties (and the celebration group),
// and v0.1.6–0.1.7 left Jewelers without their wander goal after an outburst. So every
// Jeweler gets one AI reset after a (re)load, plus another whenever CELEBRATING is stale.
function resetLoadedJeweler(entity) {
	if (entity?.typeId !== JEWELER) return;
	system.run(() => {
		try {
			if (!entity.isValid() || celebrations.has(entity.id)) return;
			resetJeweler(entity, entity.id);
			setFlag(entity, HELD_GEM, NO_GEM);
		} catch (err) {
			console.warn("[vultrom] jeweler load reset failed:", err);
		}
	});
}

try {
	world.afterEvents.entityLoad.subscribe((event) => resetLoadedJeweler(event.entity));
} catch (err) {
	console.warn("[vultrom] entityLoad unavailable, relying on the Jeweler sweep:", err);
}

system.runInterval(() => {
	const soldTo = new Set();
	for (const session of sessions.values()) {
		if (session.gem !== NO_GEM) soldTo.add(session.jewelerId);
	}
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
			if (celebrations.has(jeweler.id)) continue;
			try {
				if (!aiReset.has(jeweler.id) || jeweler.getProperty(CELEBRATING)) resetJeweler(jeweler, jeweler.id);
			} catch (err) {
				console.warn("[vultrom] jeweler reset failed:", err);
			}
			if (!soldTo.has(jeweler.id)) setFlag(jeweler, HELD_GEM, NO_GEM);
		}
	}
}, 40);

/** Vanilla ore Fortune: count × (1 + max(0, rand[0, level+1] − 1)); returns the extra items. */
function fortuneBonus(level) {
	if (level <= 0) return 0;
	return Math.max(0, Math.floor(Math.random() * (level + 2)) - 1);
}

// The loot table drops 1 raw gem and Silk Touch drops the ore block (the engine skips
// minecraft:loot for Silk Touch). Loot tables cannot read Fortune III, so Fortune is applied here.
/** Removes the `ore` item Silk Touch dropped at `center`; returns false if it isn't there yet. */
function removeSilkTouchOreDrop(dimension, center, ore) {
	for (const entity of dimension.getEntities({ location: center, maxDistance: 1.5, type: "minecraft:item" })) {
		if (entity.getComponent("minecraft:item")?.itemStack?.typeId === ore) {
			entity.remove();
			return true;
		}
	}
	return false;
}

// Only diamond and netherite pickaxes get the raw gem (the loot tables' match_tool pools);
// anything else, including lower-tier Silk Touch, gets the gem's scraps instead.
// Mining time is block data only: a fixed hardness with no tool tag, so every tool takes the
// same time (see the ore block files).
world.afterEvents.playerBreakBlock.subscribe((event) => {
	try {
		const ore = event.brokenBlockPermutation.type.id;
		const drops = ORE_DROPS.get(ore);
		if (!drops) return;
		if (event.player.getGameMode() === GameMode.creative) return;
		const tool = event.itemStackBeforeBreak;
		const enchantable = /** @type {import("@minecraft/server").ItemEnchantableComponent | undefined} */ (
			tool?.getComponent("minecraft:enchantable")
		);
		const silkTouch = !!enchantable?.getEnchantment("silk_touch");
		const { x, y, z } = event.block.location;
		const center = { x: x + 0.5, y: y + 0.5, z: z + 0.5 };
		const dimension = event.dimension;

		if (tool && RAW_GEM_PICKAXES.has(tool.typeId)) {
			if (silkTouch) return;
			const bonus = fortuneBonus(enchantable?.getEnchantment("fortune")?.level ?? 0);
			if (bonus > 0) dimension.spawnItem(new ItemStack(drops.raw, bonus), center);
			return;
		}

		if (silkTouch && !removeSilkTouchOreDrop(dimension, center, ore)) {
			system.run(() => removeSilkTouchOreDrop(dimension, center, ore));
		}
		const scraps = new ItemStack(drops.scraps, 1);
		scraps.setLore(["Sad to look at"]);
		dimension.spawnItem(scraps, center);
	} catch (err) {
		console.warn("[vultrom] gem ore drop failed:", err);
	}
});

function hash32(n) {
	n |= 0;
	n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
	n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
	return (n ^ (n >>> 16)) >>> 0;
}

function chunkRng(cx, cz, salt) {
	return hash32(cx * 374761393 + cz * 668265263 + salt);
}

function nextRng(state) {
	return hash32(state + 0x9e3779b9);
}

/** All ore attempt positions for one gem in a chunk (the seedChunk placement walk). */
function orePositionsForChunk(cx, cz, salt) {
	const originX = cx << 4;
	const originZ = cz << 4;
	const positions = [];
	let rng = chunkRng(cx, cz, salt);
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

function tryPlaceOre(dimension, gem, loc) {
	try {
		const block = dimension.getBlock(loc);
		if (!block) return;
		const ore = gem.place(block.typeId);
		if (ore) dimension.setBlockType(loc, ore);
	} catch (err) {
		if (!placeErrorLogged) {
			placeErrorLogged = true;
			console.warn(`[vultrom] ${gem.label.toLowerCase()} ore placement failed:`, err);
		}
	}
}

/**
 * Deterministic, idempotent vein placement for one chunk, sapphire first, then ruby.
 * Re-running is safe: only replaces stone-type blocks.
 */
function seedChunk(dimension, cx, cz) {
	const key = `${cx},${cz}`;
	if (seededChunks.has(key)) return;

	const probe = { x: (cx << 4) + 8, y: 64, z: (cz << 4) + 8 };
	try {
		if (!dimension.getBlock(probe)) return;
	} catch (_) {
		return;
	}

	for (const gem of GEMS) {
		if (!gemRegistered(gem)) continue;
		for (const loc of orePositionsForChunk(cx, cz, gem.salt)) tryPlaceOre(dimension, gem, loc);
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
 * Prefer deterministic vein positions (same RNG as seeding), then confirm the block.
 * Falls back to a short loaded-chunk scan if none of the predicted veins exist yet.
 */
function findNearestOre(player, gem) {
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
			for (const pos of orePositionsForChunk(cx, cz, gem.salt)) {
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
			if (block && gem.ores.has(block.typeId)) {
				return { x: c.x, y: c.y, z: c.z, typeId: block.typeId, dist: Math.sqrt(c.d) };
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
					if (!block || !gem.ores.has(block.typeId)) continue;
					const d = distSq(px, py, pz, x + 0.5, y + 0.5, z + 0.5);
					if (d < bestD) {
						bestD = d;
						best = { x, y, z, typeId: block.typeId, dist: Math.sqrt(d) };
					}
				} catch (_) {
					/* ignore */
				}
			}
		}
	}
	return best;
}

function reportFind(player, gem) {
	const name = `${gem.color}${gem.label}§r`;
	try {
		if (player.dimension.id !== OVERWORLD) {
			player.sendMessage(`${name}: only searches the Overworld.`);
			return;
		}
		if (!gemRegistered(gem)) {
			player.sendMessage(
				`§c${gem.label}§r: the ${gem.label} Ore block failed to load, so none can generate. Re-import the Vultrom behavior pack and check the content log.`
			);
			return;
		}
		const hit = findNearestOre(player, gem);
		if (!hit) {
			player.sendMessage(
				`${name}: none found within ${FIND_CHUNK_RADIUS * 16} blocks. Ore only seeds in loaded chunks (Y ${Y_MIN}…${Y_MAX}) — explore, then try again.`
			);
			return;
		}
		const dx = hit.x + 0.5 - player.location.x;
		const dz = hit.z + 0.5 - player.location.z;
		const horiz = Math.sqrt(dx * dx + dz * dz);
		const block = hit.typeId === DEEPSLATE_RUBY_ORE ? "Deepslate Ruby Ore" : `${gem.label} Ore`;
		player.sendMessage(
			`${gem.color}${block}§r at §e${hit.x} ${hit.y} ${hit.z}§r (§a${Math.round(hit.dist)}m§r away, §a${Math.round(horiz)}m§r horizontal).`
		);
	} catch (err) {
		console.warn(`[vultrom] find ${gem.label.toLowerCase()} failed:`, err);
		player.sendMessage(`§c${gem.label}§r: search failed.`);
	}
}

system.runInterval(() => {
	for (const player of world.getAllPlayers()) {
		for (const gem of GEMS) {
			try {
				if (!player.hasTag(gem.findTag)) continue;
				player.removeTag(gem.findTag);
				reportFind(player, gem);
			} catch (_) {
				/* ignore */
			}
		}
	}
}, 1);

try {
	world.beforeEvents.chatSend.subscribe((event) => {
		const msg = (event.message || "").trim().toLowerCase();
		const gem = GEMS.find((g) => g.chat.has(msg));
		if (!gem) return;
		event.cancel = true;
		const player = event.sender;
		system.run(() => reportFind(player, gem));
	});
} catch (err) {
	console.warn("[vultrom] chat !findsapphire / !findruby unavailable:", err);
}

system.runInterval(seedAroundPlayers, SEED_INTERVAL_TICKS);

system.runTimeout(() => {
	for (const gem of GEMS) {
		if (!gemRegistered(gem)) {
			console.warn(`[vultrom] ${[...gem.ores].join(" / ")} not registered — ${gem.label.toLowerCase()} ore cannot generate.`);
		}
	}
	console.log(
		"[vultrom] Sapphire + Ruby ore, Jeweler, find_sapphire + find_ruby loaded. Commands: /function vultrom/find_sapphire, /function vultrom/find_ruby (or chat !findsapphire / !findruby)."
	);
}, 1);
