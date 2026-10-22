package net.vultrom.client.photo;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;

import com.mojang.blaze3d.platform.NativeImage;
import com.mojang.blaze3d.pipeline.RenderTarget;

import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.network.chat.Component;

import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;

import net.vultrom.Vultrom;
import net.vultrom.component.PhotoData;
import net.vultrom.network.SubmitPhotoPayload;

/**
 * Captures the last fully presented frame — same window as vanilla F2.
 * <p>
 * Capturing during {@code LevelRenderEvents.END_MAIN} hit an intermediate /
 * tiny averaged buffer, so photos became a flat wash of whatever you were
 * looking at (sky → blue, dirt → green).
 */
public final class ClientPhotoCapture {
	private static final int PHOTO_W = 160;
	private static final int PHOTO_H = 90;

	private static boolean pending;
	private static boolean inFlight;

	private ClientPhotoCapture() {
	}

	public static void register() {
		// Tick runs before renderFrame in runTick — mainRenderTarget still holds
		// the previous completed frame (world + HUD), matching F2 timing.
		ClientTickEvents.END_CLIENT_TICK.register(client -> tryCaptureBetweenFrames());
	}

	/** Queue a capture on the next end-of-tick (previous finished frame). */
	public static void requestCapture() {
		pending = true;
		inFlight = false;
	}

	private static void tryCaptureBetweenFrames() {
		if (!pending || inFlight) {
			return;
		}
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null || mc.level == null || mc.gameRenderer == null) {
			pending = false;
			return;
		}
		RenderTarget target = mc.gameRenderer.mainRenderTarget();
		if (target == null || target.width < 16 || target.height < 16 || target.getColorTexture() == null) {
			// Frame not ready yet — keep pending for a later tick.
			return;
		}

		inFlight = true;
		int downscale = chooseDownscale(target.width, target.height);
		try {
			Screenshot.takeScreenshot(target, downscale, image -> {
				try {
					int w = image.getWidth();
					int h = image.getHeight();
					int unique = countUniqueColors(image, 64);
					Vultrom.LOGGER.info(
							"Camera capture {}x{} (fb {}x{}, downscale {}, unique~{})",
							w, h, target.width, target.height, downscale, unique
					);
					if (w < 8 || h < 8 || unique < 4) {
						// Still a flat wash / tiny buffer — retry next tick.
						inFlight = false;
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

	/** Largest downscale that evenly divides both axes (Screenshot requirement). */
	private static int chooseDownscale(int width, int height) {
		int maxBySize = Math.max(1, Math.min(width / PHOTO_W, height / PHOTO_H));
		for (int d = maxBySize; d >= 1; d--) {
			if (width % d == 0 && height % d == 0) {
				return d;
			}
		}
		return 1;
	}

	private static int countUniqueColors(NativeImage image, int budget) {
		int w = image.getWidth();
		int h = image.getHeight();
		int[] pixels = image.getPixelsABGR();
		Set<Integer> seen = new HashSet<>();
		int stepY = Math.max(1, h / 16);
		int stepX = Math.max(1, w / 16);
		for (int y = 0; y < h && seen.size() < budget; y += stepY) {
			for (int x = 0; x < w && seen.size() < budget; x += stepX) {
				seen.add(pixels[y * w + x] & 0x00FFFFFF);
			}
		}
		return seen.size();
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

	private static byte[] encodeDownscaledPng(NativeImage source) throws IOException {
		int srcW = source.getWidth();
		int srcH = source.getHeight();
		if (srcW <= 0 || srcH <= 0) {
			throw new IOException("empty framebuffer");
		}

		// Already small enough from GPU downscale — just crop to postcard aspect.
		if (srcW <= PHOTO_W * 2 && srcH <= PHOTO_H * 2) {
			return writePngBytes(source);
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

		try (NativeImage small = new NativeImage(source.format(), PHOTO_W, PHOTO_H, false)) {
			int[] src = source.getPixelsABGR();
			for (int y = 0; y < PHOTO_H; y++) {
				int sy = y0 + (int) ((y + 0.5f) * cropH / PHOTO_H);
				if (sy >= srcH) {
					sy = srcH - 1;
				}
				for (int x = 0; x < PHOTO_W; x++) {
					int sx = x0 + (int) ((x + 0.5f) * cropW / PHOTO_W);
					if (sx >= srcW) {
						sx = srcW - 1;
					}
					small.setPixelABGR(x, y, src[sy * srcW + sx]);
				}
			}
			byte[] bytes = writePngBytes(small);
			if (bytes.length > PhotoData.MAX_BYTES) {
				return writePngBytes(source); // fall back to GPU-downscaled full capture
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
