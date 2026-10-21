package net.vultrom.client.screen;

import java.util.List;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

import net.vultrom.client.photo.PhotoTextureCache;
import net.vultrom.component.BookPhotos;
import net.vultrom.component.PhotoData;

/** Flip through photos attached to a Book and Quill. */
public class PhotoAlbumScreen extends Screen {
	private final BookPhotos album;
	private int index;

	public PhotoAlbumScreen(BookPhotos album) {
		super(Component.literal("Photo Album"));
		this.album = album;
		this.index = 0;
	}

	@Override
	protected void init() {
		List<PhotoData> photos = this.album.photos();
		if (photos.isEmpty()) {
			this.onClose();
			return;
		}
		int y = this.height - 36;
		this.addRenderableWidget(Button.builder(Component.literal("< Prev"), b -> this.flip(-1))
				.bounds(this.width / 2 - 120, y, 70, 20)
				.build());
		this.addRenderableWidget(Button.builder(Component.literal("Close"), b -> this.onClose())
				.bounds(this.width / 2 - 35, y, 70, 20)
				.build());
		this.addRenderableWidget(Button.builder(Component.literal("Next >"), b -> this.flip(1))
				.bounds(this.width / 2 + 50, y, 70, 20)
				.build());
	}

	private void flip(int delta) {
		int size = this.album.photos().size();
		if (size == 0) {
			return;
		}
		this.index = Math.floorMod(this.index + delta, size);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float partialTick) {
		this.extractTransparentBackground(graphics);
		List<PhotoData> photos = this.album.photos();
		if (photos.isEmpty()) {
			return;
		}
		PhotoData photo = photos.get(this.index);
		Identifier texture = PhotoTextureCache.getOrRegister(photo);

		int frameW = Math.min(320, this.width - 40);
		int frameH = Math.min(180, this.height - 90);
		int x = (this.width - frameW) / 2;
		int y = (this.height - frameH) / 2 - 16;
		graphics.fill(x - 6, y - 6, x + frameW + 6, y + frameH + 6, 0xF0E8DFC8);
		graphics.fill(x - 4, y - 4, x + frameW + 4, y + frameH + 4, 0xF02A241C);
		graphics.blit(texture, x, y, x + frameW, y + frameH, 0f, 0f, 1f, 1f);
		graphics.centeredText(
				this.font,
				Component.literal("Photo " + (this.index + 1) + " / " + photos.size()),
				this.width / 2,
				y - 22,
				0xF5F0E6
		);
		super.extractRenderState(graphics, mouseX, mouseY, partialTick);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}
}
