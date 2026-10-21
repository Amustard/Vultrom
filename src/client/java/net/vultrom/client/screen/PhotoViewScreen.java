package net.vultrom.client.screen;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

import net.vultrom.client.photo.PhotoTextureCache;
import net.vultrom.component.PhotoData;

/** Full-screen view of a single developed photo. */
public class PhotoViewScreen extends Screen {
	private final PhotoData photo;
	private Identifier textureId;

	public PhotoViewScreen(PhotoData photo) {
		super(Component.literal("Photo"));
		this.photo = photo;
	}

	@Override
	protected void init() {
		this.textureId = PhotoTextureCache.getOrRegister(this.photo);
		int bw = 100;
		this.addRenderableWidget(Button.builder(Component.literal("Close"), b -> this.onClose())
				.bounds(this.width / 2 - bw / 2, this.height - 36, bw, 20)
				.build());
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
		this.extractTransparentBackground(graphics);
		int frameW = Math.min(320, this.width - 40);
		int frameH = Math.min(180, this.height - 80);
		int x = (this.width - frameW) / 2;
		int y = (this.height - frameH) / 2 - 10;
		graphics.fill(x - 6, y - 6, x + frameW + 6, y + frameH + 6, 0xF0E8DFC8);
		graphics.fill(x - 4, y - 4, x + frameW + 4, y + frameH + 4, 0xF02A241C);
		if (this.textureId != null) {
			graphics.blit(this.textureId, x, y, x + frameW, y + frameH, 0f, 0f, 1f, 1f);
		}
		graphics.centeredText(this.font, this.title, this.width / 2, y - 22, 0xF5F0E6);
		super.extractRenderState(graphics, mouseX, mouseY, partialTick);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}
}
