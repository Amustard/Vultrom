package net.vultrom.menu;

import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ContainerData;
import net.minecraft.world.inventory.ContainerLevelAccess;
import net.minecraft.world.inventory.SimpleContainerData;
import net.minecraft.world.item.ItemStack;

import net.vultrom.block.ModBlocks;
import net.vultrom.block.entity.custom.GuardPostBlockEntity;

/**
 * Desk dialogue menu — no trade slots. Button actions map to hire / duty / release / dismiss.
 */
public class GuardPostMenu extends AbstractContainerMenu {
	public static final int DATA_SIZE = 8;
	public static final int DATA_HIRED = 0;
	public static final int DATA_TONE = 1;
	public static final int DATA_PATROL_MODE = 2;
	public static final int DATA_PATROL_DISTANCE = 3;
	public static final int DATA_AREA_RADIUS = 4;
	public static final int DATA_CAPTURE = 5;
	public static final int DATA_DETAIN_SECONDS = 6;
	public static final int DATA_HAS_DETAINEE = 7;

	public static final int BTN_HIRE = 0;
	public static final int BTN_DISMISS = 1;
	public static final int BTN_CYCLE_TONE = 2;
	public static final int BTN_TOGGLE_PATROL = 3;
	public static final int BTN_PATROL_UP = 4;
	public static final int BTN_PATROL_DOWN = 5;
	public static final int BTN_AREA_UP = 6;
	public static final int BTN_AREA_DOWN = 7;
	public static final int BTN_TOGGLE_CAPTURE = 8;
	public static final int BTN_DETAIN_UP = 9;
	public static final int BTN_DETAIN_DOWN = 10;
	public static final int BTN_RELEASE = 11;

	private final GuardPostBlockEntity post;
	private final ContainerLevelAccess access;
	private final ContainerData data;

	/** Client constructor. */
	public GuardPostMenu(int containerId, Inventory inventory) {
		this(containerId, inventory, null, new SimpleContainerData(DATA_SIZE), ContainerLevelAccess.NULL);
	}

	/** Server constructor. */
	public GuardPostMenu(int containerId, Inventory inventory, GuardPostBlockEntity post) {
		this(
				containerId,
				inventory,
				post,
				createServerData(post),
				ContainerLevelAccess.create(post.getLevel(), post.getBlockPos())
		);
	}

	private GuardPostMenu(
			int containerId,
			Inventory inventory,
			GuardPostBlockEntity post,
			ContainerData data,
			ContainerLevelAccess access
	) {
		super(ModMenuTypes.GUARD_POST, containerId);
		this.post = post;
		this.access = access;
		this.data = data;
		this.addDataSlots(this.data);
	}

	private static ContainerData createServerData(GuardPostBlockEntity post) {
		return new ContainerData() {
			@Override
			public int get(int index) {
				return switch (index) {
					case DATA_HIRED -> post.isHired() ? 1 : 0;
					case DATA_TONE -> post.getTone().ordinal();
					case DATA_PATROL_MODE -> post.getPatrolMode().ordinal();
					case DATA_PATROL_DISTANCE -> post.getPatrolDistance();
					case DATA_AREA_RADIUS -> post.getAreaRadius();
					case DATA_CAPTURE -> post.isCaptureEnabled() ? 1 : 0;
					case DATA_DETAIN_SECONDS -> post.getDetainSeconds();
					case DATA_HAS_DETAINEE -> post.getDetaineeUuid() != null ? 1 : 0;
					default -> 0;
				};
			}

			@Override
			public void set(int index, int value) {
			}

			@Override
			public int getCount() {
				return DATA_SIZE;
			}
		};
	}

	public ContainerData getData() {
		return this.data;
	}

	@Override
	public boolean clickMenuButton(Player player, int id) {
		if (!(player instanceof ServerPlayer serverPlayer) || this.post == null) {
			return false;
		}
		return switch (id) {
			case BTN_HIRE -> {
				this.post.hire(serverPlayer);
				yield true;
			}
			case BTN_DISMISS -> {
				this.post.dismiss(serverPlayer);
				yield true;
			}
			case BTN_CYCLE_TONE -> {
				this.post.cycleTone(serverPlayer);
				yield true;
			}
			case BTN_TOGGLE_PATROL -> {
				this.post.togglePatrolMode(serverPlayer);
				yield true;
			}
			case BTN_PATROL_UP -> {
				this.post.adjustPatrolDistance(serverPlayer, 2);
				yield true;
			}
			case BTN_PATROL_DOWN -> {
				this.post.adjustPatrolDistance(serverPlayer, -2);
				yield true;
			}
			case BTN_AREA_UP -> {
				this.post.adjustAreaRadius(serverPlayer, 2);
				yield true;
			}
			case BTN_AREA_DOWN -> {
				this.post.adjustAreaRadius(serverPlayer, -2);
				yield true;
			}
			case BTN_TOGGLE_CAPTURE -> {
				this.post.toggleCapture(serverPlayer);
				yield true;
			}
			case BTN_DETAIN_UP -> {
				this.post.adjustDetainSeconds(serverPlayer, 15);
				yield true;
			}
			case BTN_DETAIN_DOWN -> {
				this.post.adjustDetainSeconds(serverPlayer, -15);
				yield true;
			}
			case BTN_RELEASE -> {
				this.post.releaseDetainee(serverPlayer);
				yield true;
			}
			default -> false;
		};
	}

	@Override
	public ItemStack quickMoveStack(Player player, int index) {
		return ItemStack.EMPTY;
	}

	@Override
	public boolean stillValid(Player player) {
		return stillValid(this.access, player, ModBlocks.GUARD_POST);
	}
}
