package net.vultrom.client.screen;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Inventory;

import net.vultrom.guard.EnforcementTone;
import net.vultrom.guard.PatrolMode;
import net.vultrom.menu.GuardPostMenu;

/**
 * Villager-like desk dialogue — offers / standing orders, not a Spawn button.
 */
public class GuardPostScreen extends AbstractContainerScreen<GuardPostMenu> {
	private Button hireButton;
	private Button dismissButton;
	private Button toneButton;
	private Button patrolButton;
	private Button captureButton;
	private Button releaseButton;
	private Component header = Component.literal("Guard Post desk");

	public GuardPostScreen(GuardPostMenu menu, Inventory inventory, Component title) {
		super(menu, inventory, title, 220, 186);
		this.inventoryLabelY = 10000; // hide player inventory label (no slots)
	}

	@Override
	protected void init() {
		super.init();
		int x = this.leftPos + 10;
		int y = this.topPos + 28;

		this.hireButton = this.addRenderableWidget(Button.builder(Component.literal("Hire security"), b -> this.press(GuardPostMenu.BTN_HIRE))
				.bounds(x, y, 200, 20).build());
		this.dismissButton = this.addRenderableWidget(Button.builder(Component.literal("Dismiss guard"), b -> this.press(GuardPostMenu.BTN_DISMISS))
				.bounds(x, y, 200, 20).build());

		this.toneButton = this.addRenderableWidget(Button.builder(Component.literal("Tone"), b -> this.press(GuardPostMenu.BTN_CYCLE_TONE))
				.bounds(x, y + 24, 200, 20).build());
		this.patrolButton = this.addRenderableWidget(Button.builder(Component.literal("Duty"), b -> this.press(GuardPostMenu.BTN_TOGGLE_PATROL))
				.bounds(x, y + 48, 98, 20).build());
		this.addRenderableWidget(Button.builder(Component.literal("Patrol -"), b -> this.press(GuardPostMenu.BTN_PATROL_DOWN))
				.bounds(x + 102, y + 48, 48, 20).build());
		this.addRenderableWidget(Button.builder(Component.literal("Patrol +"), b -> this.press(GuardPostMenu.BTN_PATROL_UP))
				.bounds(x + 152, y + 48, 48, 20).build());

		this.addRenderableWidget(Button.builder(Component.literal("Area -"), b -> this.press(GuardPostMenu.BTN_AREA_DOWN))
				.bounds(x, y + 72, 98, 20).build());
		this.addRenderableWidget(Button.builder(Component.literal("Area +"), b -> this.press(GuardPostMenu.BTN_AREA_UP))
				.bounds(x + 102, y + 72, 98, 20).build());

		this.captureButton = this.addRenderableWidget(Button.builder(Component.literal("Capture"), b -> this.press(GuardPostMenu.BTN_TOGGLE_CAPTURE))
				.bounds(x, y + 96, 98, 20).build());
		this.addRenderableWidget(Button.builder(Component.literal("Hold -"), b -> this.press(GuardPostMenu.BTN_DETAIN_DOWN))
				.bounds(x + 102, y + 96, 48, 20).build());
		this.addRenderableWidget(Button.builder(Component.literal("Hold +"), b -> this.press(GuardPostMenu.BTN_DETAIN_UP))
				.bounds(x + 152, y + 96, 48, 20).build());

		this.releaseButton = this.addRenderableWidget(Button.builder(Component.literal("Release detainee"), b -> this.press(GuardPostMenu.BTN_RELEASE))
				.bounds(x, y + 120, 200, 20).build());
	}

	private void press(int buttonId) {
		if (this.minecraft == null || this.minecraft.gameMode == null) {
			return;
		}
		this.minecraft.gameMode.handleInventoryButtonClick(this.menu.containerId, buttonId);
	}

	@Override
	protected void containerTick() {
		super.containerTick();
		boolean hired = this.menu.getData().get(GuardPostMenu.DATA_HIRED) == 1;
		boolean hasDetainee = this.menu.getData().get(GuardPostMenu.DATA_HAS_DETAINEE) == 1;
		EnforcementTone tone = EnforcementTone.byId(this.menu.getData().get(GuardPostMenu.DATA_TONE));
		PatrolMode mode = PatrolMode.byId(this.menu.getData().get(GuardPostMenu.DATA_PATROL_MODE));
		int patrol = this.menu.getData().get(GuardPostMenu.DATA_PATROL_DISTANCE);
		int area = this.menu.getData().get(GuardPostMenu.DATA_AREA_RADIUS);
		boolean capture = this.menu.getData().get(GuardPostMenu.DATA_CAPTURE) == 1;
		int hold = this.menu.getData().get(GuardPostMenu.DATA_DETAIN_SECONDS);

		this.hireButton.visible = !hired;
		this.dismissButton.visible = hired;
		this.toneButton.visible = hired;
		this.patrolButton.visible = hired;
		this.captureButton.visible = hired;
		this.releaseButton.active = hired && hasDetainee;
		this.releaseButton.visible = hired;

		if (hired) {
			this.toneButton.setMessage(Component.literal("Tone: " + tone.label()));
			this.patrolButton.setMessage(Component.literal(mode.label() + " · " + patrol + "m"));
			this.captureButton.setMessage(Component.literal("Capture: " + (capture ? "ON" : "OFF") + " · " + hold + "s"));
			this.dismissButton.setMessage(Component.literal("Dismiss guard"));
			this.header = Component.literal("Standing orders · area " + area);
		} else {
			this.header = Component.literal("Guard Post desk");
		}
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float delta) {
		int x = this.leftPos;
		int y = this.topPos;
		graphics.fill(x, y, x + this.imageWidth, y + this.imageHeight, 0xF0101018);
		graphics.fill(x + 2, y + 2, x + this.imageWidth - 2, y + this.imageHeight - 2, 0xF02A3344);
		graphics.fill(x + 6, y + 18, x + this.imageWidth - 6, y + 20, 0xFFC8A84B);
	}

	@Override
	protected void extractLabels(GuiGraphicsExtractor graphics, int mouseX, int mouseY) {
		graphics.text(this.font, this.header, this.titleLabelX, this.titleLabelY, 0xE8E2D4, false);
		boolean hired = this.menu.getData().get(GuardPostMenu.DATA_HIRED) == 1;
		String hint = hired
				? "Talk through duty options below."
				: "This desk is unmanned. Hire security to begin.";
		graphics.text(this.font, hint, this.titleLabelX, this.titleLabelY + 12, 0xA8B0BC, false);
	}
}
