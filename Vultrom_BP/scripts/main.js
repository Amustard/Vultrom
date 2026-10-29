/**
 * Vultrom Bedrock — Gemstone Cutter turns a nearby villager into a Jeweler.
 *
 * Bedrock addons cannot register a true vanilla profession/POI, so right-clicking
 * the Gemstone Cutter replaces the nearest villager_v2 with vultrom:jeweler
 * (gold-robe profession overlay + sapphire trades).
 */
import { world, system } from "@minecraft/server";

const CUTTER = "vultrom:gemstone_cutter";
const JEWELER = "vultrom:jeweler";
const BIND_RADIUS = 5;

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

system.runTimeout(() => {
	console.log("[vultrom] Sapphire / Jeweler scripts loaded.");
}, 1);
