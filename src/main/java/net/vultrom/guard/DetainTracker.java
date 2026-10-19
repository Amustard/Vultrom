package net.vultrom.guard;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.UUID;

import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.phys.Vec3;

/**
 * World-scoped MVP detain state. Logout clears detain; no offline jail.
 */
public final class DetainTracker {
	private static final Map<UUID, DetainRecord> DETAINED = new HashMap<>();

	private DetainTracker() {
	}

	public record DetainRecord(BlockPos holdPos, int ticksRemaining, String reason, BlockPos postPos) {
	}

	public static boolean isDetained(UUID playerId) {
		return DETAINED.containsKey(playerId);
	}

	public static DetainRecord get(UUID playerId) {
		return DETAINED.get(playerId);
	}

	public static void detain(ServerPlayer player, BlockPos holdPos, BlockPos postPos, int seconds, String reason) {
		int ticks = Math.max(20, seconds * 20);
		DETAINED.put(player.getUUID(), new DetainRecord(holdPos.immutable(), ticks, reason, postPos.immutable()));
		player.teleportTo(holdPos.getX() + 0.5, holdPos.getY(), holdPos.getZ() + 0.5);
		player.setDeltaMovement(Vec3.ZERO);
		player.addEffect(new MobEffectInstance(MobEffects.SLOWNESS, ticks, 6, false, false, true));
		player.addEffect(new MobEffectInstance(MobEffects.JUMP_BOOST, ticks, 200, false, false, true));
		player.sendSystemMessage(Component.literal("Detained at Guard Post — " + reason));
		player.sendOverlayMessage(Component.literal("Detained: " + reason));

		if (player.level() instanceof ServerLevel serverLevel) {
			serverLevel.getServer().getPlayerList().broadcastSystemMessage(
					Component.literal("[Vultrom] " + player.getGameProfile().name() + " detained at " + postPos.toShortString() + " (" + reason + ")"),
					false
			);
		}
	}

	public static void release(UUID playerId, ServerLevel level, String message) {
		DetainRecord removed = DETAINED.remove(playerId);
		if (removed == null) {
			return;
		}
		ServerPlayer player = level.getServer().getPlayerList().getPlayer(playerId);
		if (player != null) {
			player.removeEffect(MobEffects.SLOWNESS);
			player.removeEffect(MobEffects.JUMP_BOOST);
			if (message != null) {
				player.sendSystemMessage(Component.literal(message));
			}
		}
	}

	public static void clearOnLogout(UUID playerId) {
		DETAINED.remove(playerId);
	}

	public static void clearOnDeath(UUID playerId) {
		DETAINED.remove(playerId);
	}

	public static void tick(ServerLevel level) {
		Iterator<Map.Entry<UUID, DetainRecord>> it = DETAINED.entrySet().iterator();
		while (it.hasNext()) {
			Map.Entry<UUID, DetainRecord> entry = it.next();
			DetainRecord record = entry.getValue();
			int left = record.ticksRemaining() - 1;
			ServerPlayer player = level.getServer().getPlayerList().getPlayer(entry.getKey());
			if (player == null) {
				it.remove();
				continue;
			}
			if (left <= 0) {
				it.remove();
				player.removeEffect(MobEffects.SLOWNESS);
				player.removeEffect(MobEffects.JUMP_BOOST);
				player.sendSystemMessage(Component.literal("You have been released from the Guard Post."));
				continue;
			}
			DETAINED.put(entry.getKey(), new DetainRecord(record.holdPos(), left, record.reason(), record.postPos()));
			// Soft root: keep near hold point
			BlockPos hold = record.holdPos();
			if (player.distanceToSqr(hold.getX() + 0.5, hold.getY(), hold.getZ() + 0.5) > 4.0) {
				player.teleportTo(hold.getX() + 0.5, hold.getY(), hold.getZ() + 0.5);
			}
			if (player.tickCount % 40 == 0) {
				player.addEffect(new MobEffectInstance(MobEffects.SLOWNESS, 60, 6, false, false, true));
			}
		}
	}
}
