package net.vultrom.client.screen;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Inventory;

import net.vultrom.menu.TraderDeskMenu;

/**
 * Listing board UI for the Trader Desk.
 */
public class TraderDeskScreen extends AbstractContainerScreen<TraderDeskMenu> {
	private static final int PANEL_W = 176;
	private static final int PANEL_H = 184;

	public TraderDeskScreen(TraderDeskMenu menu, Inventory inventory, Component title) {
		super(menu, inventory, title, PANEL_W, PANEL_H);
		this.inventoryLabelY = 90;
		this.titleLabelY = 6;
	}

	@Override
	protected void init() {
		super.init();
		int x = this.leftPos;
		int y = this.topPos;

		this.addRenderableWidget(Button.builder(Component.literal("-"), b -> this.press(TraderDeskMenu.BTN_PRICE_DOWN))
				.bounds(x + 26, y + 26, 20, 20)
				.build());
		this.addRenderableWidget(Button.builder(Component.literal("+"), b -> this.press(TraderDeskMenu.BTN_PRICE_UP))
				.bounds(x + 130, y + 26, 20, 20)
				.build());
		this.addRenderableWidget(Button.builder(Component.literal("List for sale"), b -> this.press(TraderDeskMenu.BTN_LIST))
				.bounds(x + 26, y + 50, 124, 18)
				.build());
		this.addRenderableWidget(Button.builder(Component.literal("Claim emeralds"), b -> this.press(TraderDeskMenu.BTN_CLAIM))
				.bounds(x + 8, y + 72, 78, 16)
				.build());
		this.addRenderableWidget(Button.builder(Component.literal("Bind"), b -> this.press(TraderDeskMenu.BTN_BIND))
				.bounds(x + 90, y + 72, 38, 16)
				.build());
		this.addRenderableWidget(Button.builder(Component.literal("Unbind"), b -> this.press(TraderDeskMenu.BTN_UNBIND))
				.bounds(x + 130, y + 72, 38, 16)
				.build());
	}

	private void press(int buttonId) {
		if (this.minecraft == null || this.minecraft.gameMode == null) {
			return;
		}
		this.minecraft.gameMode.handleInventoryButtonClick(this.menu.containerId, buttonId);
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float delta) {
		int x = this.leftPos;
		int y = this.topPos;
		graphics.fill(x, y, x + PANEL_W, y + PANEL_H, 0xF01E2836);
		graphics.fill(x + 2, y + 2, x + PANEL_W - 2, y + PANEL_H - 2, 0xF02A3444);
		graphics.fill(x + 78, y + 26, x + 98, y + 46, 0xFF8B8B8B);
		graphics.fill(x + 8, y + 100, x + PANEL_W - 8, y + PANEL_H - 8, 0xE0141A24);
	}

	@Override
	protected void extractLabels(GuiGraphicsExtractor graphics, int mouseX, int mouseY) {
		int price = this.menu.getData().get(TraderDeskMenu.DATA_PRICE);
		int listings = this.menu.getData().get(TraderDeskMenu.DATA_LISTINGS);
		int credits = this.menu.getData().get(TraderDeskMenu.DATA_CREDITS);
		boolean bound = this.menu.getData().get(TraderDeskMenu.DATA_BOUND) == 1;

		graphics.text(this.font, Component.literal("Trader Desk"), this.titleLabelX, 6, 0xF5F0E6, false);
		graphics.text(this.font, Component.literal(price + " emeralds"), 52, 16, 0xE8E2D4, false);
		graphics.text(
				this.font,
				Component.literal(listings + "/12 listed · credit " + credits + (bound ? " · bound" : "")),
				8,
				this.imageHeight - 12,
				0xA8B4C4,
				false
		);
	}
}
