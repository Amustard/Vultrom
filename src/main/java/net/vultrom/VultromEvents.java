package net.vultrom;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.LivingEntity;

import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;

import net.vultrom.guard.DetainTracker;

/**
 * Lifecycle hooks for MVP detain rules (logout / death clear hold).
 */
public final class VultromEvents {
	private VultromEvents() {
	}

	public static void register() {
		ServerPlayConnectionEvents.DISCONNECT.register((handler, server) -> {
			DetainTracker.clearOnLogout(handler.getPlayer().getUUID());
		});

		ServerLivingEntityEvents.AFTER_DEATH.register((LivingEntity entity, DamageSource damageSource) -> {
			if (entity instanceof ServerPlayer player) {
				DetainTracker.clearOnDeath(player.getUUID());
			}
		});

		ServerTickEvents.END_LEVEL_TICK.register((ServerLevel level) -> DetainTracker.tick(level));
	}
}
