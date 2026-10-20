package net.vultrom;

import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.LivingEntity;

import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;

import net.vultrom.entity.SecurityGuardEntity;
import net.vultrom.guard.ArrestState;
import net.vultrom.guard.DetainTracker;

/**
 * Lifecycle hooks: detain clear on logout/death, and no PvE beatdowns while cuffed/held.
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

		// Detained / escorted players can't deal damage; guards won't damage held/cuffed targets.
		ServerLivingEntityEvents.ALLOW_DAMAGE.register((entity, source, amount) -> {
			if (entity instanceof ServerPlayer victim && DetainTracker.isDetained(victim.getUUID())) {
				if (source.getEntity() instanceof SecurityGuardEntity) {
					return false;
				}
			}
			if (source.getEntity() instanceof ServerPlayer attacker) {
				if (DetainTracker.isDetained(attacker.getUUID())) {
					return false;
				}
			}
			if (source.getEntity() instanceof SecurityGuardEntity guard) {
				ArrestState state = guard.getArrestState();
				if (state == ArrestState.RESTRAINING || state == ArrestState.ESCORTING || state == ArrestState.HELD) {
					return false;
				}
				if (entity instanceof ServerPlayer player && DetainTracker.isDetained(player.getUUID())) {
					return false;
				}
			}
			return true;
		});
	}
}
