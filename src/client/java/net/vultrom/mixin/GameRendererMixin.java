package net.vultrom.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import net.minecraft.client.renderer.GameRenderer;

import net.vultrom.client.photo.ClientPhotoCapture;

/**
 * Hook the exact moment vanilla takes world screenshots: immediately after
 * {@code renderLevel()} / {@code tryTakeScreenshotIfNeeded()}.
 * <p>
 * Capture code copies the main color buffer into a private staging target before
 * the rest of this frame mutates the live target (post-FX / GUI).
 */
@Mixin(GameRenderer.class)
public class GameRendererMixin {
	@Inject(
			method = "render",
			at = @At(
					value = "INVOKE",
					target = "Lnet/minecraft/client/renderer/GameRenderer;tryTakeScreenshotIfNeeded()V",
					shift = At.Shift.AFTER
			)
	)
	private void vultrom$afterVanillaScreenshotMoment(CallbackInfo ci) {
		ClientPhotoCapture.captureAtVanillaScreenshotMoment();
	}
}
