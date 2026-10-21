package net.vultrom.client.photo;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

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
 * Screenshot readback is async — must submit inside the callback.
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
		try {
			Screenshot.takeScreenshot(mc.gameRenderer.mainRenderTarget(), image -> {
				byte[] png = null;
				try {
					png = encodeDownscaledPng(image);
				} catch (Exception e) {
					Vultrom.LOGGER.error("Failed to encode photo", e);
				} finally {
					image.close();
				}
				byte[] toSend = png;
				mc.execute(() -> finishSubmit(mc, toSend));
			});
		} catch (Exception e) {
			Vultrom.LOGGER.error("Failed to start photo capture", e);
			mc.execute(() -> finishSubmit(mc, makeFallbackPngSafe()));
		}
	}

	private static void finishSubmit(Minecraft mc, byte[] png) {
		if (mc.player == null) {
			return;
		}
		byte[] bytes = png;
		if (bytes == null || bytes.length == 0 || bytes.length > PhotoData.MAX_BYTES || !looksLikePng(bytes)) {
			bytes = makeFallbackPngSafe();
			if (bytes == null) {
				mc.player.sendOverlayMessage(Component.literal("Photo failed."));
				return;
			}
			mc.player.sendOverlayMessage(Component.literal("Capture glitched — placeholder photo."));
		}
		ClientPlayNetworking.send(new SubmitPhotoPayload(bytes));
	}

	private static boolean looksLikePng(byte[] png) {
		return png.length > 16
				&& png[0] == (byte) 0x89
				&& png[1] == 0x50
				&& png[2] == 0x4E
				&& png[3] == 0x47;
	}

	private static byte[] makeFallbackPngSafe() {
		try {
			return makeFallbackPng();
		} catch (Exception e) {
			Vultrom.LOGGER.error("Fallback photo failed", e);
			return null;
		}
	}

	private static byte[] makeFallbackPng() throws IOException {
		try (NativeImage img = new NativeImage(PHOTO_W, PHOTO_H, false)) {
			img.fillRect(0, 0, PHOTO_W, PHOTO_H, 0xFF5A7A98);
			img.fillRect(8, 8, PHOTO_W - 16, PHOTO_H - 16, 0xFF2E4050);
			return writePngBytes(img);
		}
	}

	private static byte[] encodeDownscaledPng(NativeImage source) throws IOException {
		int srcW = source.getWidth();
		int srcH = source.getHeight();
		if (srcW <= 0 || srcH <= 0) {
			throw new IOException("empty framebuffer");
		}
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
		int x0 = Math.max(0, (srcW - cropW) / 2);
		int y0 = Math.max(0, (srcH - cropH) / 2);

		try (NativeImage small = new NativeImage(PHOTO_W, PHOTO_H, false)) {
			source.resizeSubRectTo(x0, y0, cropW, cropH, small);
			byte[] bytes = writePngBytes(small);
			if (bytes.length > PhotoData.MAX_BYTES) {
				try (NativeImage tiny = new NativeImage(96, 54, false)) {
					small.resizeSubRectTo(0, 0, PHOTO_W, PHOTO_H, tiny);
					bytes = writePngBytes(tiny);
				}
			}
			return bytes;
		}
	}

	private static byte[] writePngBytes(NativeImage image) throws IOException {
		Path tmp = Files.createTempFile("vultrom-photo-", ".png");
		try {
			image.writeToFile(tmp);
			return Files.readAllBytes(tmp);
		} finally {
			Files.deleteIfExists(tmp);
		}
	}
}
