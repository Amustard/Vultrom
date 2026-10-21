package net.vultrom.network;

import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Prediction;
import net.minecraft.world.item.ItemStack;

import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;

import net.vultrom.component.ModComponents;
import net.vultrom.component.PhotoData;
import net.vultrom.item.ModItems;

public final class ModNetworking {
	private ModNetworking() {
	}

	public static void registerPayloads() {
		PayloadTypeRegistry.clientboundPlay().register(RequestPhotoCapturePayload.TYPE, RequestPhotoCapturePayload.CODEC);
		PayloadTypeRegistry.serverboundPlay().registerLarge(
				SubmitPhotoPayload.TYPE,
				SubmitPhotoPayload.CODEC,
				PhotoData.MAX_BYTES + 256
		);
	}

	public static void registerServerReceivers() {
		ServerPlayNetworking.registerGlobalReceiver(SubmitPhotoPayload.TYPE, (payload, context) -> {
			byte[] png = payload.png();
			context.server().execute(() -> givePhoto(context.player(), png));
		});
	}

	private static void givePhoto(ServerPlayer player, byte[] png) {
		if (!isHoldingCamera(player)) {
			player.sendOverlayMessage(Component.literal("Hold the Camera to develop a photo."));
			return;
		}
		if (!looksLikePng(png) || png.length > PhotoData.MAX_BYTES) {
			player.sendOverlayMessage(Component.literal("Camera failed — bad image data."));
			return;
		}
		ItemStack photo = new ItemStack(ModItems.PHOTO);
		photo.set(ModComponents.PHOTO, new PhotoData(png));
		photo.set(DataComponents.CUSTOM_NAME, Component.literal("Photo"));
		boolean added = player.getInventory().add(photo);
		if (!added && !photo.isEmpty()) {
			player.drop(photo, false, Prediction.SERVER_ONLY);
		}
		player.getInventory().setChanged();
		player.containerMenu.broadcastChanges();
		player.sendOverlayMessage(Component.literal("Photo developed"));
		player.sendSystemMessage(Component.literal(
				"Hold the photo and a Book and Quill to insert it. Sneak + use the book to view photos."
		));
	}

	private static boolean isHoldingCamera(ServerPlayer player) {
		return player.getMainHandItem().is(ModItems.CAMERA) || player.getOffhandItem().is(ModItems.CAMERA);
	}

	private static boolean looksLikePng(byte[] png) {
		return png != null
				&& png.length > 16
				&& png[0] == (byte) 0x89
				&& png[1] == 0x50
				&& png[2] == 0x4E
				&& png[3] == 0x47;
	}
}
