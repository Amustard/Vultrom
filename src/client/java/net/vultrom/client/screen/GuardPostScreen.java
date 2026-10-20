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
 * Desk dialogue — clear status + simple standing-order buttons.
 */
public class GuardPostScreen extends AbstractContainerScreen<GuardPostMenu> {
	private static final int PANEL_W = 260;
	private static final int PANEL_H = 230;

	private Button hireButton;
	private Button dismissButton;
	private Button toneButton;
	private Button patrolButton;
	private Button patrolDown;
	private Button patrolUp;
	private Button areaDown;
	private Button areaUp;
	private Button captureButton;
	private Button holdDown;
	private Button holdUp;
	private Button releaseButton;

	private Component header = Component.literal("Guard Post");
	private Component statusLine = Component.literal("Unmanned desk");
	private Component tipLine = Component.literal("Hire security to begin.");

	public GuardPostScreen(GuardPostMenu menu, Inventory inventory, Component title) {
		super(menu, inventory, title, PANEL_W, PANEL_H);
		this.inventoryLabelY = 10000;
		this.titleLabelY = 8;
	}

	@Override
	protected void init() {
		super.init();
		int x = this.leftPos + 12;
		int y = this.topPos + 52;
		int wide = PANEL_W - 24;

		this.hireButton = button(x, y, wide, 22, "Hire security", GuardPostMenu.BTN_HIRE);
		this.dismissButton = button(x, y, wide, 22, "Dismiss guard", GuardPostMenu.BTN_DISMISS);

		this.toneButton = button(x, y + 28, wide, 22, "Enforcement tone", GuardPostMenu.BTN_CYCLE_TONE);
		this.patrolButton = button(x, y + 56, 120, 22, "Duty mode", GuardPostMenu.BTN_TOGGLE_PATROL);
		this.patrolDown = button(x + 124, y + 56, 54, 22, "Patrol -", GuardPostMenu.BTN_PATROL_DOWN);
		this.patrolUp = button(x + 182, y + 56, 54, 22, "Patrol +", GuardPostMenu.BTN_PATROL_UP);

		this.areaDown = button(x, y + 84, 120, 22, "Area smaller", GuardPostMenu.BTN_AREA_DOWN);
		this.areaUp = button(x + 124, y + 84, 112, 22, "Area larger", GuardPostMenu.BTN_AREA_UP);

		this.captureButton = button(x, y + 112, wide, 22, "Capture / detain", GuardPostMenu.BTN_TOGGLE_CAPTURE);
		this.holdDown = button(x, y + 140, 120, 22, "Hold shorter", GuardPostMenu.BTN_DETAIN_DOWN);
		this.holdUp = button(x + 124, y + 140, 112, 22, "Hold longer", GuardPostMenu.BTN_DETAIN_UP);

		this.releaseButton = button(x, y + 168, wide, 22, "Release detainee", GuardPostMenu.BTN_RELEASE);
	}

	private Button button(int x, int y, int w, int h, String label, int id) {
		return this.addRenderableWidget(Button.builder(Component.literal(label), b -> this.press(id))
				.bounds(x, y, w, h)
				.build());
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
		this.patrolDown.visible = hired && mode == PatrolMode.PATROL;
		this.patrolUp.visible = hired && mode == PatrolMode.PATROL;
		this.areaDown.visible = hired;
		this.areaUp.visible = hired;
		this.captureButton.visible = hired;
		this.holdDown.visible = hired && capture;
		this.holdUp.visible = hired && capture;
		this.releaseButton.visible = hired;
		this.releaseButton.active = hasDetainee;

		if (!hired) {
			this.header = Component.literal("Guard Post");
			this.statusLine = Component.literal("Status: Unmanned");
			this.tipLine = Component.literal("Right-click options feel like talking to a desk clerk.");
			return;
		}

		this.header = Component.literal("Standing orders");
		this.statusLine = Component.literal(
				"On duty  |  " + tone.label()
						+ "  |  " + mode.label()
						+ (mode == PatrolMode.PATROL ? (" " + patrol + "m") : "")
						+ "  |  Area " + area + "m"
						+ "  |  Capture " + (capture ? "ON (" + hold + "s)" : "OFF")
		);
		this.tipLine = Component.literal(capture
				? "Capture is ON — flagged players can be detained at this post."
				: "Tip: turn Capture ON if you want guards to detain people.");

		this.toneButton.setMessage(Component.literal("Tone: " + tone.label() + "  (click to change)"));
		this.patrolButton.setMessage(Component.literal(mode == PatrolMode.STAND
				? "Duty: Stand at post"
				: "Duty: Patrol (" + patrol + "m)"));
		this.captureButton.setMessage(Component.literal(capture
				? "Capture / detain: ON  (" + hold + "s)  — click to turn OFF"
				: "Capture / detain: OFF  — click to turn ON"));
		this.areaDown.setMessage(Component.literal("Watch area: " + area + "m  (−)"));
		this.areaUp.setMessage(Component.literal("Watch area (+)"));
		this.releaseButton.setMessage(Component.literal(hasDetainee
				? "Release current detainee"
				: "No one is detained"));
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float delta) {
		int x = this.leftPos;
		int y = this.topPos;
		graphics.fill(x, y, x + this.imageWidth, y + this.imageHeight, 0xF0080C12);
		graphics.fill(x + 2, y + 2, x + this.imageWidth - 2, y + this.imageHeight - 2, 0xF01E2836);
		graphics.fill(x + 8, y + 6, x + this.imageWidth - 8, y + 28, 0xF02E3A4C);
		graphics.fill(x + 8, y + 30, x + this.imageWidth - 8, y + 48, 0xE0141A24);
		boolean capture = this.menu.getData().get(GuardPostMenu.DATA_CAPTURE) == 1;
		boolean hired = this.menu.getData().get(GuardPostMenu.DATA_HIRED) == 1;
		int accent = (!hired) ? 0xFFC8A84B : (capture ? 0xFF5CBF7A : 0xFFD4A017);
		graphics.fill(x + 8, y + 28, x + this.imageWidth - 8, y + 30, accent);
	}

	@Override
	protected void extractLabels(GuiGraphicsExtractor graphics, int mouseX, int mouseY) {
		graphics.text(this.font, this.header, this.titleLabelX, 8, 0xF5F0E6, false);
		graphics.text(this.font, this.statusLine, this.titleLabelX, 32, 0xE8E2D4, false);
		graphics.text(this.font, this.tipLine, this.titleLabelX, this.imageHeight - 16, 0xA8B4C4, false);
	}
}
