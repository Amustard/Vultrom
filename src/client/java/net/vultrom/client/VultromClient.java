package net.vultrom.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.MenuScreens;
import net.minecraft.client.renderer.entity.EntityRenderers;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.event.player.UseItemCallback;

import net.vultrom.client.photo.ClientPhotoCapture;
import net.vultrom.client.render.SecurityGuardRenderer;
import net.vultrom.client.screen.GuardPostScreen;
import net.vultrom.client.screen.PhotoAlbumScreen;
import net.vultrom.client.screen.PhotoViewScreen;
import net.vultrom.component.BookPhotos;
import net.vultrom.component.ModComponents;
import net.vultrom.component.PhotoData;
import net.vultrom.entity.ModEntityTypes;
import net.vultrom.item.ModItems;
import net.vultrom.menu.ModMenuTypes;
import net.vultrom.network.RequestPhotoCapturePayload;

public class VultromClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		MenuScreens.register(ModMenuTypes.GUARD_POST, GuardPostScreen::new);
		EntityRenderers.register(ModEntityTypes.SECURITY_GUARD, SecurityGuardRenderer::new);
		ClientPhotoCapture.register();

		ClientPlayNetworking.registerGlobalReceiver(RequestPhotoCapturePayload.TYPE, (payload, context) -> {
			// Capture on next end-of-tick (previous finished frame) — same timing as F2.
			context.client().execute(ClientPhotoCapture::requestCapture);
		});

		UseItemCallback.EVENT.register((player, level, hand) -> {
			if (!level.isClientSide()) {
				return InteractionResult.PASS;
			}
			ItemStack stack = player.getItemInHand(hand);
			Minecraft mc = Minecraft.getInstance();

			if (stack.is(ModItems.PHOTO) && !holdingWritableBook(player, hand)) {
				PhotoData data = stack.get(ModComponents.PHOTO);
				if (data != null) {
					mc.execute(() -> mc.setScreenAndShow(new PhotoViewScreen(data)));
					return InteractionResult.SUCCESS;
				}
			}

			if (stack.is(Items.WRITABLE_BOOK) && player.isShiftKeyDown()) {
				BookPhotos album = stack.get(ModComponents.BOOK_PHOTOS);
				if (album != null && !album.photos().isEmpty()) {
					mc.execute(() -> mc.setScreenAndShow(new PhotoAlbumScreen(album)));
					return InteractionResult.SUCCESS;
				}
			}

			return InteractionResult.PASS;
		});
	}

	private static boolean holdingWritableBook(net.minecraft.world.entity.player.Player player, net.minecraft.world.InteractionHand hand) {
		net.minecraft.world.InteractionHand other =
				hand == net.minecraft.world.InteractionHand.MAIN_HAND
						? net.minecraft.world.InteractionHand.OFF_HAND
						: net.minecraft.world.InteractionHand.MAIN_HAND;
		return player.getItemInHand(other).is(Items.WRITABLE_BOOK);
	}
}
