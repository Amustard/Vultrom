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
 * Held-at-post state after a successful escort. Logout / death clears hold.
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

	public static void holdAtPost(ServerPlayer player, BlockPos holdPos, BlockPos postPos, int seconds, String reason) {
		int ticks = Math.max(20, seconds * 20);
		DETAINED.put(player.getUUID(), new DetainRecord(holdPos.immutable(), ticks, reason, postPos.immutable()));
		player.teleportTo(holdPos.getX() + 0.5, holdPos.getY(), holdPos.getZ() + 0.5);
		player.setDeltaMovement(Vec3.ZERO);
		applyCuffs(player, ticks);
		player.sendSystemMessage(Component.literal("Detained at Guard Post — " + reason));
		player.sendOverlayMessage(Component.literal("Detained at post"));

		if (player.level() instanceof ServerLevel serverLevel) {
			serverLevel.getServer().getPlayerList().broadcastSystemMessage(
					Component.literal("[Vultrom] " + player.getGameProfile().name()
							+ " detained at " + postPos.toShortString() + " (" + reason + ")"),
					false
			);
		}
	}

	/** Soft “handcuffs”: slow, no jump, weak swings, no digging. */
	public static void applyCuffs(ServerPlayer player, int ticks) {
		player.addEffect(new MobEffectInstance(MobEffects.SLOWNESS, ticks, 4, false, false, true));
		player.addEffect(new MobEffectInstance(MobEffects.JUMP_BOOST, ticks, 200, false, false, true));
		player.addEffect(new MobEffectInstance(MobEffects.WEAKNESS, ticks, 2, false, false, true));
		player.addEffect(new MobEffectInstance(MobEffects.MINING_FATIGUE, ticks, 3, false, false, true));
	}

	public static void applyEscortCuffs(ServerPlayer player) {
		applyCuffs(player, 40);
	}

	public static void clearCuffEffects(ServerPlayer player) {
		player.removeEffect(MobEffects.SLOWNESS);
		player.removeEffect(MobEffects.JUMP_BOOST);
		player.removeEffect(MobEffects.WEAKNESS);
		player.removeEffect(MobEffects.MINING_FATIGUE);
	}

	public static void release(UUID playerId, ServerLevel level, String message) {
		DetainRecord removed = DETAINED.remove(playerId);
		if (removed == null) {
			return;
		}
		ServerPlayer player = level.getServer().getPlayerList().getPlayer(playerId);
		if (player != null) {
			clearCuffEffects(player);
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
				clearCuffEffects(player);
				player.sendSystemMessage(Component.literal("You have been released from the Guard Post."));
				continue;
			}
			DETAINED.put(entry.getKey(), new DetainRecord(record.holdPos(), left, record.reason(), record.postPos()));
			BlockPos hold = record.holdPos();
			if (player.distanceToSqr(hold.getX() + 0.5, hold.getY(), hold.getZ() + 0.5) > 4.0) {
				player.teleportTo(hold.getX() + 0.5, hold.getY(), hold.getZ() + 0.5);
			}
			if (player.tickCount % 40 == 0) {
				applyCuffs(player, 60);
			}
		}
	}
}
