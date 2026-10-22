package net.vultrom.market;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.jspecify.annotations.Nullable;

import net.minecraft.core.BlockPos;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.Level;

/**
 * Server-side lookup: bound villager UUID → desk position.
 */
public final class TraderDeskIndex {
	private record DeskRef(ResourceKey<Level> dimension, BlockPos pos) {
	}

	private static final Map<UUID, DeskRef> BY_VILLAGER = new ConcurrentHashMap<>();

	private TraderDeskIndex() {
	}

	public static void bind(UUID villagerId, ResourceKey<Level> dimension, BlockPos pos) {
		BY_VILLAGER.put(villagerId, new DeskRef(dimension, pos.immutable()));
	}

	public static void unbind(UUID villagerId) {
		BY_VILLAGER.remove(villagerId);
	}

	public static void unbindAt(ResourceKey<Level> dimension, BlockPos pos) {
		BY_VILLAGER.entrySet().removeIf(entry ->
				entry.getValue().dimension().equals(dimension) && entry.getValue().pos().equals(pos));
	}

	@Nullable
	public static BlockPos findDesk(ServerLevel level, UUID villagerId) {
		DeskRef ref = BY_VILLAGER.get(villagerId);
		if (ref == null || !ref.dimension().equals(level.dimension())) {
			return null;
		}
		return ref.pos();
	}
}
