package net.vultrom.menu;

import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.SimpleContainer;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ContainerData;
import net.minecraft.world.inventory.ContainerLevelAccess;
import net.minecraft.world.inventory.SimpleContainerData;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;

import net.vultrom.block.ModBlocks;
import net.vultrom.block.entity.custom.TraderDeskBlockEntity;

/**
 * Listing board — put an item up for sale, set emerald price, claim credit, bind villager.
 */
public class TraderDeskMenu extends AbstractContainerMenu {
	public static final int DATA_SIZE = 4;
	public static final int DATA_PRICE = 0;
	public static final int DATA_LISTINGS = 1;
	public static final int DATA_CREDITS = 2;
	public static final int DATA_BOUND = 3;

	public static final int BTN_PRICE_UP = 0;
	public static final int BTN_PRICE_DOWN = 1;
	public static final int BTN_LIST = 2;
	public static final int BTN_CLAIM = 3;
	public static final int BTN_BIND = 4;
	public static final int BTN_UNBIND = 5;

	private final TraderDeskBlockEntity desk;
	private final ContainerLevelAccess access;
	private final ContainerData data;
	private final SimpleContainer input = new SimpleContainer(1);
	private int listPrice = 8;

	/** Client constructor. */
	public TraderDeskMenu(int containerId, Inventory inventory) {
		this(containerId, inventory, null, ContainerLevelAccess.NULL);
	}

	/** Server constructor. */
	public TraderDeskMenu(int containerId, Inventory inventory, TraderDeskBlockEntity desk) {
		this(
				containerId,
				inventory,
				desk,
				ContainerLevelAccess.create(desk.getLevel(), desk.getBlockPos())
		);
	}

	private TraderDeskMenu(
			int containerId,
			Inventory inventory,
			TraderDeskBlockEntity desk,
			ContainerLevelAccess access
	) {
		super(ModMenuTypes.TRADER_DESK, containerId);
		this.desk = desk;
		this.access = access;
		this.data = desk == null ? new SimpleContainerData(DATA_SIZE) : this.createServerData(inventory.player);
		this.addSlot(new Slot(this.input, 0, 80, 28));
		this.addStandardInventorySlots(inventory, 8, 102);
		this.addDataSlots(this.data);
	}

	private ContainerData createServerData(Player player) {
		return new ContainerData() {
			@Override
			public int get(int index) {
				return switch (index) {
					case DATA_PRICE -> TraderDeskMenu.this.listPrice;
					case DATA_LISTINGS -> TraderDeskMenu.this.desk.listingCount();
					case DATA_CREDITS -> TraderDeskMenu.this.desk.getCredits(player.getUUID());
					case DATA_BOUND -> TraderDeskMenu.this.desk.getBoundVillagerUuid() != null ? 1 : 0;
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
		if (this.desk == null || !(player instanceof ServerPlayer serverPlayer)) {
			return false;
		}
		return switch (id) {
			case BTN_PRICE_UP -> {
				this.listPrice = Math.min(TraderDeskBlockEntity.MAX_PRICE, this.listPrice + 1);
				yield true;
			}
			case BTN_PRICE_DOWN -> {
				this.listPrice = Math.max(TraderDeskBlockEntity.MIN_PRICE, this.listPrice - 1);
				yield true;
			}
			case BTN_LIST -> {
				ItemStack stack = this.input.getItem(0);
				if (this.desk.tryListItem(serverPlayer, stack, this.listPrice)) {
					this.input.setItem(0, ItemStack.EMPTY);
				}
				yield true;
			}
			case BTN_CLAIM -> {
				this.desk.claimCredits(serverPlayer);
				yield true;
			}
			case BTN_BIND -> {
				this.desk.bindNearestVillager(serverPlayer);
				yield true;
			}
			case BTN_UNBIND -> {
				this.desk.unbindVillager(serverPlayer);
				yield true;
			}
			default -> false;
		};
	}

	@Override
	public void removed(Player player) {
		super.removed(player);
		this.clearContainer(player, this.input);
	}

	@Override
	public ItemStack quickMoveStack(Player player, int index) {
		ItemStack result = ItemStack.EMPTY;
		Slot slot = this.slots.get(index);
		if (slot != null && slot.hasItem()) {
			ItemStack stack = slot.getItem();
			result = stack.copy();
			if (index == 0) {
				if (!this.moveItemStackTo(stack, 1, this.slots.size(), true)) {
					return ItemStack.EMPTY;
				}
			} else if (!this.moveItemStackTo(stack, 0, 1, false)) {
				return ItemStack.EMPTY;
			}
			if (stack.isEmpty()) {
				slot.setByPlayer(ItemStack.EMPTY);
			} else {
				slot.setChanged();
			}
		}
		return result;
	}

	@Override
	public boolean stillValid(Player player) {
		return stillValid(this.access, player, ModBlocks.TRADER_DESK);
	}
}
