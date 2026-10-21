package net.vultrom.item;

import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;

import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;

import net.vultrom.network.RequestPhotoCapturePayload;

/**
 * Right-click asks the client to snapshot the view and return a Photo item.
 */
public class CameraItem extends Item {
	public static final int COOLDOWN_TICKS = 40;

	public CameraItem(Properties properties) {
		super(properties);
	}

	@Override
	public InteractionResult use(Level level, Player player, InteractionHand hand) {
		ItemStack stack = player.getItemInHand(hand);
		if (player.getCooldowns().isOnCooldown(stack)) {
			return InteractionResult.FAIL;
		}
		if (!level.isClientSide() && player instanceof ServerPlayer serverPlayer) {
			player.getCooldowns().addCooldown(stack, COOLDOWN_TICKS);
			ServerPlayNetworking.send(serverPlayer, new RequestPhotoCapturePayload());
			serverPlayer.sendOverlayMessage(net.minecraft.network.chat.Component.literal("Shutter…"));
		}
		return InteractionResult.SUCCESS;
	}
}
