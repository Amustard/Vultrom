package net.vultrom.client.photo;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import com.mojang.blaze3d.pipeline.RenderTarget;
import com.mojang.blaze3d.platform.NativeImage;

import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.network.chat.Component;

import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;

import net.vultrom.Vultrom;
import net.vultrom.component.PhotoData;
import net.vultrom.network.SubmitPhotoPayload;

/**
 * Camera capture rehaul (0.2.0):
 * <ul>
 *   <li>Triggered from a GameRenderer mixin at the same point as vanilla F2 / world screenshots
 *       (right after {@code tryTakeScreenshotIfNeeded()}).</li>
 *   <li>Uses {@link Screenshot#takeScreenshot} and waits for the native GPU callback.</li>
 *   <li>Verifies PNG size + spatial luminance variance before packaging a Photo.</li>
 *   <li>Writes {@code vultrom_last_capture.png} in the game directory for eyeball checks.</li>
 * </ul>
 */
public final class ClientPhotoCapture {
	private static final int PHOTO_W = 160;
	private static final int PHOTO_H = 90;
	/** Flat washes / 1×1 averages sit near 0; real scenes are much higher. */
	private static final double MIN_LUMINANCE_VARIANCE = 40.0;
	private static final int MIN_WIDTH = 64;
	private static final int MIN_HEIGHT = 36;

	private static volatile boolean pending;
	private static volatile boolean inFlight;

	private ClientPhotoCapture() {
	}

	/** No tick/render-event registration — mixin drives capture timing. */
	public static void register() {
		// intentionally empty
	}

	public static void requestCapture() {
		pending = true;
	}

	/**
	 * Called from {@link net.vultrom.mixin.GameRendererMixin} on the render thread
	 * at the proven vanilla screenshot moment.
	 */
	public static void captureAtVanillaScreenshotMoment() {
		if (!pending || inFlight) {
			return;
		}
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null || mc.level == null || mc.gameRenderer == null) {
			pending = false;
			return;
		}
		RenderTarget target = mc.gameRenderer.mainRenderTarget();
		if (target == null || target.getColorTexture() == null || target.width < MIN_WIDTH || target.height < MIN_HEIGHT) {
			return; // keep pending; try next frame
		}

		inFlight = true;
		pending = false;
		int downscale = 1; // full framebuffer — downsample ourselves after verify
		try {
			Screenshot.takeScreenshot(target, downscale, image -> {
				try {
					handleCapturedImage(mc, image, target.width, target.height);
				} catch (Exception e) {
					Vultrom.LOGGER.error("Camera capture failed", e);
					mc.execute(() -> {
						if (mc.player != null) {
							mc.player.sendOverlayMessage(Component.literal("Camera capture failed."));
						}
					});
				} finally {
					image.close();
					inFlight = false;
				}
			});
		} catch (Exception e) {
			Vultrom.LOGGER.error("Camera Screenshot.takeScreenshot failed", e);
			inFlight = false;
			pending = true; // retry next frame
		}
	}

	private static void handleCapturedImage(Minecraft mc, NativeImage image, int fbW, int fbH) throws IOException {
		int w = image.getWidth();
		int h = image.getHeight();
		double variance = luminanceVariance(image);
		Vultrom.LOGGER.info("Camera frame {}x{} (fb {}x{}), luminanceVar={}", w, h, fbW, fbH, variance);

		if (w < MIN_WIDTH || h < MIN_HEIGHT || variance < MIN_LUMINANCE_VARIANCE) {
			Vultrom.LOGGER.warn("Rejected flat/tiny camera frame (var={})", variance);
			mc.execute(() -> {
				if (mc.player != null) {
					mc.player.sendOverlayMessage(Component.literal("Shutter misfire — try again."));
				}
			});
			pending = true; // allow an immediate retry on next good frame
			return;
		}

		// Eyeball artifact in .minecraft for Mason
		Path debugPath = mc.gameDirectory.toPath().resolve("vultrom_last_capture.png");
		image.writeToFile(debugPath);

		byte[] png = encodePostcard(image);
		// Re-verify encoded bytes
		try (NativeImage check = NativeImage.read(png)) {
			double checkVar = luminanceVariance(check);
			if (check.getWidth() < 16 || check.getHeight() < 16 || checkVar < MIN_LUMINANCE_VARIANCE * 0.5) {
				Vultrom.LOGGER.warn("Encoded photo failed verify ({}x{}, var={})", check.getWidth(), check.getHeight(), checkVar);
				mc.execute(() -> {
					if (mc.player != null) {
						mc.player.sendOverlayMessage(Component.literal("Photo encode looked empty — try again."));
					}
				});
				return;
			}
		}

		if (png.length > PhotoData.MAX_BYTES) {
			// Emergency shrink
			png = encodeTiny(image);
		}
		if (png.length > PhotoData.MAX_BYTES || !looksLikePng(png)) {
			mc.execute(() -> {
				if (mc.player != null) {
					mc.player.sendOverlayMessage(Component.literal("Photo too large — try again."));
				}
			});
			return;
		}

		byte[] toSend = png;
		mc.execute(() -> {
			if (mc.player != null) {
				ClientPlayNetworking.send(new SubmitPhotoPayload(toSend));
				mc.player.sendOverlayMessage(Component.literal("Shutter!"));
			}
		});
	}

	private static double luminanceVariance(NativeImage image) {
		int w = image.getWidth();
		int h = image.getHeight();
		int[] pixels = image.getPixelsABGR();
		int stepY = Math.max(1, h / 24);
		int stepX = Math.max(1, w / 24);
		double sum = 0;
		double sumSq = 0;
		int n = 0;
		for (int y = 0; y < h; y += stepY) {
			for (int x = 0; x < w; x += stepX) {
				int p = pixels[y * w + x];
				int r = (p) & 0xFF;         // ABGR: B in low bits? Wait - ABGR byte order
				int g = (p >> 8) & 0xFF;
				int b = (p >> 16) & 0xFF;
				// NativeImage ABGR packing: bits are A B G R in memory on little-endian as int...
				// getPixelsABGR documentation - Screenshot uses setPixelABGR with getInt from RGBA.
				// Use relative luminance with the three channels regardless of swap:
				int c0 = p & 0xFF;
				int c1 = (p >> 8) & 0xFF;
				int c2 = (p >> 16) & 0xFF;
				double lum = 0.2126 * c2 + 0.7152 * c1 + 0.0722 * c0;
				sum += lum;
				sumSq += lum * lum;
				n++;
			}
		}
		if (n < 2) {
			return 0;
		}
		double mean = sum / n;
		return (sumSq / n) - (mean * mean);
	}

	private static byte[] encodePostcard(NativeImage source) throws IOException {
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
		int x0 = Math.max(0, (srcW - cropW) / 2);
		int y0 = Math.max(0, (srcH - cropH) / 2);

		try (NativeImage small = new NativeImage(source.format(), PHOTO_W, PHOTO_H, false)) {
			int[] src = source.getPixelsABGR();
			for (int y = 0; y < PHOTO_H; y++) {
				int sy = y0 + (int) ((y + 0.5f) * cropH / (float) PHOTO_H);
				sy = Math.min(srcH - 1, Math.max(0, sy));
				for (int x = 0; x < PHOTO_W; x++) {
					int sx = x0 + (int) ((x + 0.5f) * cropW / (float) PHOTO_W);
					sx = Math.min(srcW - 1, Math.max(0, sx));
					small.setPixelABGR(x, y, src[sy * srcW + sx]);
				}
			}
			return writePngBytes(small);
		}
	}

	private static byte[] encodeTiny(NativeImage source) throws IOException {
		int tw = 96;
		int th = 54;
		int srcW = source.getWidth();
		int srcH = source.getHeight();
		try (NativeImage tiny = new NativeImage(source.format(), tw, th, false)) {
			int[] src = source.getPixelsABGR();
			for (int y = 0; y < th; y++) {
				int sy = Math.min(srcH - 1, y * srcH / th);
				for (int x = 0; x < tw; x++) {
					int sx = Math.min(srcW - 1, x * srcW / tw);
					tiny.setPixelABGR(x, y, src[sy * srcW + sx]);
				}
			}
			return writePngBytes(tiny);
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

	private static boolean looksLikePng(byte[] png) {
		return png.length > 16
				&& png[0] == (byte) 0x89
				&& png[1] == 0x50
				&& png[2] == 0x4E
				&& png[3] == 0x47;
	}
}
