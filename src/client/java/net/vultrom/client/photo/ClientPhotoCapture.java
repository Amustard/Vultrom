package net.vultrom.client.photo;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import com.mojang.blaze3d.platform.NativeImage;

import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.network.chat.Component;

import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents;

import net.vultrom.Vultrom;
import net.vultrom.component.PhotoData;
import net.vultrom.network.SubmitPhotoPayload;

/**
 * Captures the real game view after the level finishes rendering.
 * Immediate capture on packet receipt hits a cleared/sky-colored buffer (blue screen).
 */
public final class ClientPhotoCapture {
	private static final int PHOTO_W = 160;
	private static final int PHOTO_H = 90;
	private static final int MAX_RETRIES = 8;

	private static boolean pending;
	private static boolean inFlight;
	private static int retries;

	private ClientPhotoCapture() {
	}

	public static void register() {
		LevelRenderEvents.END_MAIN.register(context -> tryCaptureAfterLevel());
	}

	/** Queue a capture for the next fully rendered level frame. */
	public static void requestCapture() {
		pending = true;
		inFlight = false;
		retries = 0;
	}

	private static void tryCaptureAfterLevel() {
		if (!pending || inFlight) {
			return;
		}
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null || mc.level == null || mc.gameRenderer == null) {
			pending = false;
			return;
		}
		inFlight = true;
		try {
			Screenshot.takeScreenshot(mc.gameRenderer.mainRenderTarget(), image -> {
				try {
					if (isNearlyUniform(image) && retries < MAX_RETRIES) {
						retries++;
						inFlight = false;
						// keep pending — try again on a later frame
						return;
					}
					byte[] png = encodeDownscaledPng(image);
					pending = false;
					mc.execute(() -> {
						try {
							finishSubmit(mc, png);
						} finally {
							inFlight = false;
						}
					});
				} catch (Exception e) {
					Vultrom.LOGGER.error("Failed to encode photo", e);
					pending = false;
					mc.execute(() -> {
						try {
							if (mc.player != null) {
								mc.player.sendOverlayMessage(Component.literal("Photo encode failed."));
							}
						} finally {
							inFlight = false;
						}
					});
				} finally {
					image.close();
				}
			});
		} catch (Exception e) {
			Vultrom.LOGGER.error("Failed to start photo capture", e);
			pending = false;
			inFlight = false;
			if (mc.player != null) {
				mc.player.sendOverlayMessage(Component.literal("Photo capture failed."));
			}
		}
	}

	private static void finishSubmit(Minecraft mc, byte[] png) {
		if (mc.player == null) {
			return;
		}
		if (png == null || png.length == 0 || png.length > PhotoData.MAX_BYTES || !looksLikePng(png)) {
			mc.player.sendOverlayMessage(Component.literal("Photo failed — try again."));
			return;
		}
		ClientPlayNetworking.send(new SubmitPhotoPayload(png));
	}

	private static boolean looksLikePng(byte[] png) {
		return png.length > 16
				&& png[0] == (byte) 0x89
				&& png[1] == 0x50
				&& png[2] == 0x4E
				&& png[3] == 0x47;
	}

	/**
	 * Cleared framebuffers are an exact flat clear color. Real views (even sky) have
	 * gradients / noise — only reject near-zero range samples.
	 */
	private static boolean isNearlyUniform(NativeImage image) {
		int w = image.getWidth();
		int h = image.getHeight();
		if (w < 4 || h < 4) {
			return true;
		}
		int[] pixels = image.getPixelsABGR();
		int minR = 255;
		int minG = 255;
		int minB = 255;
		int maxR = 0;
		int maxG = 0;
		int maxB = 0;
		int stepY = Math.max(1, h / 10);
		int stepX = Math.max(1, w / 10);
		for (int y = 0; y < h; y += stepY) {
			for (int x = 0; x < w; x += stepX) {
				int p = pixels[y * w + x];
				int r = (p >> 16) & 0xFF;
				int g = (p >> 8) & 0xFF;
				int b = p & 0xFF;
				minR = Math.min(minR, r);
				minG = Math.min(minG, g);
				minB = Math.min(minB, b);
				maxR = Math.max(maxR, r);
				maxG = Math.max(maxG, g);
				maxB = Math.max(maxB, b);
			}
		}
		int range = (maxR - minR) + (maxG - minG) + (maxB - minB);
		return range < 6;
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

		// Manual downsample with matching format — resizeSubRectTo is format-strict and
		// was a failure path that previously fell back to a solid blue placeholder.
		try (NativeImage small = new NativeImage(source.format(), PHOTO_W, PHOTO_H, false)) {
			int[] src = source.getPixelsABGR();
			for (int y = 0; y < PHOTO_H; y++) {
				int sy = y0 + y * cropH / PHOTO_H;
				if (sy >= srcH) {
					sy = srcH - 1;
				}
				for (int x = 0; x < PHOTO_W; x++) {
					int sx = x0 + x * cropW / PHOTO_W;
					if (sx >= srcW) {
						sx = srcW - 1;
					}
					small.setPixelABGR(x, y, src[sy * srcW + sx]);
				}
			}
			byte[] bytes = writePngBytes(small);
			if (bytes.length > PhotoData.MAX_BYTES) {
				try (NativeImage tiny = new NativeImage(source.format(), 96, 54, false)) {
					int[] mid = small.getPixelsABGR();
					for (int y = 0; y < 54; y++) {
						for (int x = 0; x < 96; x++) {
							tiny.setPixelABGR(x, y, mid[(y * PHOTO_H / 54) * PHOTO_W + (x * PHOTO_W / 96)]);
						}
					}
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
