package net.vultrom.client.photo;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;

import com.mojang.blaze3d.pipeline.RenderTarget;
import com.mojang.blaze3d.pipeline.TextureTarget;
import com.mojang.blaze3d.platform.NativeImage;
import com.mojang.renderpearl.api.GpuFormat;

import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.network.chat.Component;

import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;

import net.vultrom.Vultrom;
import net.vultrom.component.PhotoData;
import net.vultrom.network.SubmitPhotoPayload;

/**
 * Camera capture (0.3.1):
 * <p>
 * Root cause of solid-color photos: {@link Screenshot#takeScreenshot} does an async
 * GPU copy of the <em>live</em> main target. The rest of the same frame still writes/clears
 * that target (post-FX / GUI), so the readback often landed on a flat clear color.
 * <p>
 * Fix: immediately {@link RenderTarget#copyColorFrom} into a private staging target that
 * nothing else touches, then screenshot <em>that</em>. Reject frames that fail spatial
 * variance / unique-color checks. Always write {@code vultrom_last_capture.png}.
 */
public final class ClientPhotoCapture {
	private static final int PHOTO_W = 160;
	private static final int PHOTO_H = 90;
	private static final double MIN_LUMINANCE_VARIANCE = 80.0;
	private static final int MIN_UNIQUE_COLORS = 48;
	private static final int MIN_CHANNEL_RANGE = 24;
	private static final int MIN_WIDTH = 64;
	private static final int MIN_HEIGHT = 36;
	private static final int MAX_RETRIES = 8;

	private static volatile boolean pending;
	private static volatile boolean inFlight;
	private static volatile int retriesLeft;

	private static TextureTarget staging;

	private ClientPhotoCapture() {
	}

	public static void register() {
		// mixin drives timing
	}

	public static void requestCapture() {
		pending = true;
		retriesLeft = MAX_RETRIES;
	}

	/**
	 * Called from {@link net.vultrom.mixin.GameRendererMixin} on the render thread,
	 * immediately after vanilla's world-screenshot moment (post-{@code renderLevel}).
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
		RenderTarget main = mc.gameRenderer.mainRenderTarget();
		if (main == null || main.getColorTexture() == null || main.width < MIN_WIDTH || main.height < MIN_HEIGHT) {
			return;
		}

		RenderTarget snapshot;
		try {
			snapshot = ensureStaging(main.width, main.height);
			snapshot.copyColorFrom(main);
		} catch (Exception e) {
			Vultrom.LOGGER.error("Camera staging copy failed", e);
			failOrRetry(mc, "Camera staging failed — try again.");
			return;
		}

		inFlight = true;
		pending = false;
		try {
			Screenshot.takeScreenshot(snapshot, 1, image -> {
				try {
					handleCapturedImage(mc, image, snapshot.width, snapshot.height);
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
			failOrRetry(mc, "Shutter misfire — try again.");
		}
	}

	private static RenderTarget ensureStaging(int width, int height) {
		if (staging == null || staging.width != width || staging.height != height) {
			if (staging != null) {
				staging.destroyBuffers();
			}
			staging = new TextureTarget(
					"vultrom_photo_staging",
					width,
					height,
					GpuFormat.RGBA8_UNORM,
					GpuFormat.D32_FLOAT
			);
		}
		return staging;
	}

	private static void failOrRetry(Minecraft mc, String message) {
		if (retriesLeft > 0) {
			retriesLeft--;
			pending = true;
			return;
		}
		pending = false;
		mc.execute(() -> {
			if (mc.player != null) {
				mc.player.sendOverlayMessage(Component.literal(message));
			}
		});
	}

	private static void handleCapturedImage(Minecraft mc, NativeImage image, int fbW, int fbH) throws IOException {
		int w = image.getWidth();
		int h = image.getHeight();
		FrameStats stats = analyze(image);
		Vultrom.LOGGER.info(
				"Camera frame {}x{} (fb {}x{}), var={}, unique={}, range={}",
				w, h, fbW, fbH, stats.variance, stats.uniqueColors, stats.channelRange
		);

		Path debugPath = mc.gameDirectory.toPath().resolve("vultrom_last_capture.png");
		image.writeToFile(debugPath);

		boolean ok = w >= MIN_WIDTH && h >= MIN_HEIGHT
				&& stats.variance >= MIN_LUMINANCE_VARIANCE
				&& stats.uniqueColors >= MIN_UNIQUE_COLORS
				&& stats.channelRange >= MIN_CHANNEL_RANGE;

		if (!ok) {
			Path rejectPath = mc.gameDirectory.toPath().resolve("vultrom_last_reject.png");
			Files.copy(debugPath, rejectPath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
			Vultrom.LOGGER.warn(
					"Rejected flat camera frame (var={}, unique={}, range={}) — wrote {}",
					stats.variance, stats.uniqueColors, stats.channelRange, rejectPath
			);
			failOrRetry(mc, "Shutter misfire (blank frame) — try again.");
			return;
		}

		byte[] png = encodePostcard(image);
		try (NativeImage check = NativeImage.read(png)) {
			FrameStats checkStats = analyze(check);
			if (check.getWidth() < 16 || check.getHeight() < 16
					|| checkStats.variance < MIN_LUMINANCE_VARIANCE * 0.4
					|| checkStats.uniqueColors < MIN_UNIQUE_COLORS / 2) {
				Vultrom.LOGGER.warn(
						"Encoded photo failed verify ({}x{}, var={}, unique={})",
						check.getWidth(), check.getHeight(), checkStats.variance, checkStats.uniqueColors
				);
				failOrRetry(mc, "Photo encode looked empty — try again.");
				return;
			}
		}

		if (png.length > PhotoData.MAX_BYTES) {
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

		retriesLeft = 0;
		byte[] toSend = png;
		mc.execute(() -> {
			if (mc.player != null) {
				ClientPlayNetworking.send(new SubmitPhotoPayload(toSend));
				mc.player.sendOverlayMessage(Component.literal("Shutter! Check vultrom_last_capture.png if unsure."));
			}
		});
	}

	private record FrameStats(double variance, int uniqueColors, int channelRange) {
	}

	private static FrameStats analyze(NativeImage image) {
		int w = image.getWidth();
		int h = image.getHeight();
		int[] pixels = image.getPixelsABGR();
		int stepY = Math.max(1, h / 32);
		int stepX = Math.max(1, w / 32);
		double sum = 0;
		double sumSq = 0;
		int n = 0;
		int minC = 255;
		int maxC = 0;
		Set<Integer> unique = new HashSet<>();
		for (int y = 0; y < h; y += stepY) {
			for (int x = 0; x < w; x += stepX) {
				int p = pixels[y * w + x];
				int c0 = p & 0xFF;
				int c1 = (p >> 8) & 0xFF;
				int c2 = (p >> 16) & 0xFF;
				double lum = 0.2126 * c2 + 0.7152 * c1 + 0.0722 * c0;
				sum += lum;
				sumSq += lum * lum;
				n++;
				minC = Math.min(minC, Math.min(c0, Math.min(c1, c2)));
				maxC = Math.max(maxC, Math.max(c0, Math.max(c1, c2)));
				// quantize a bit so near-solid noise doesn't inflate unique count
				unique.add(((c2 & 0xF8) << 16) | ((c1 & 0xF8) << 8) | (c0 & 0xF8));
			}
		}
		if (n < 2) {
			return new FrameStats(0, unique.size(), 0);
		}
		double mean = sum / n;
		double variance = (sumSq / n) - (mean * mean);
		return new FrameStats(variance, unique.size(), maxC - minC);
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
