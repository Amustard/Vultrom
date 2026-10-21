package net.vultrom.client.photo;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicReference;

import com.mojang.blaze3d.platform.NativeImage;

import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.network.chat.Component;

import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;

import net.vultrom.Vultrom;
import net.vultrom.component.PhotoData;
import net.vultrom.network.SubmitPhotoPayload;

/**
 * Grabs the framebuffer, downscales to a postcard, and uploads PNG bytes.
 */
public final class ClientPhotoCapture {
	private static final int PHOTO_W = 160;
	private static final int PHOTO_H = 90;

	private ClientPhotoCapture() {
	}

	public static void captureAndSubmit() {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null || mc.level == null) {
			return;
		}
		AtomicReference<byte[]> pngRef = new AtomicReference<>();
		Screenshot.takeScreenshot(mc.gameRenderer.mainRenderTarget(), image -> {
			try {
				pngRef.set(encodeDownscaledPng(image));
			} catch (Exception e) {
				Vultrom.LOGGER.error("Failed to encode photo", e);
			} finally {
				image.close();
			}
		});
		byte[] png = pngRef.get();
		if (png == null || png.length == 0 || png.length > PhotoData.MAX_BYTES) {
			mc.player.sendOverlayMessage(Component.literal("Photo too large or failed."));
			return;
		}
		ClientPlayNetworking.send(new SubmitPhotoPayload(png));
	}

	private static byte[] encodeDownscaledPng(NativeImage source) throws IOException {
		int srcW = source.getWidth();
		int srcH = source.getHeight();
		float targetAspect = PHOTO_W / (float) PHOTO_H;
		float srcAspect = srcW / (float) srcH;
		int cropW;
		int cropH;
		if (srcAspect > targetAspect) {
			cropH = srcH;
			cropW = Math.max(1, Math.round(srcH * targetAspect));
		} else {
			cropW = srcW;
			cropH = Math.max(1, Math.round(srcW / targetAspect));
		}
		int x0 = (srcW - cropW) / 2;
		int y0 = (srcH - cropH) / 2;

		try (NativeImage small = new NativeImage(PHOTO_W, PHOTO_H, false)) {
			source.resizeSubRectTo(x0, y0, cropW, cropH, small);
			Path tmp = Files.createTempFile("vultrom-photo-", ".png");
			try {
				small.writeToFile(tmp);
				byte[] bytes = Files.readAllBytes(tmp);
				if (bytes.length > PhotoData.MAX_BYTES) {
					try (NativeImage tiny = new NativeImage(96, 54, false)) {
						small.resizeSubRectTo(0, 0, PHOTO_W, PHOTO_H, tiny);
						tiny.writeToFile(tmp);
						bytes = Files.readAllBytes(tmp);
					}
				}
				return bytes;
			} finally {
				Files.deleteIfExists(tmp);
			}
		}
	}
}
