package net.vultrom.block.entity.custom;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.jspecify.annotations.NonNull;
import org.jspecify.annotations.Nullable;

import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Containers;
import net.minecraft.world.MenuProvider;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.npc.villager.Villager;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.util.Prediction;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.AABB;

import net.vultrom.block.entity.ModBlockEntities;
import net.vultrom.market.DeskMerchant;
import net.vultrom.market.MarketListing;
import net.vultrom.market.TraderDeskIndex;
import net.vultrom.menu.TraderDeskMenu;

public class TraderDeskBlockEntity extends BlockEntity implements MenuProvider {
	public static final int MAX_LISTINGS = 12;
	public static final int MIN_PRICE = 1;
	public static final int MAX_PRICE = 64;
	public static final int BIND_RADIUS = 10;

	private final List<MarketListing> listings = new ArrayList<>();
	private final Map<UUID, Integer> credits = new HashMap<>();
	@Nullable
	private UUID boundVillagerUuid;

	public TraderDeskBlockEntity(BlockPos pos, BlockState state) {
		super(ModBlockEntities.TRADER_DESK, pos, state);
	}

	public List<MarketListing> getListings() {
		return List.copyOf(this.listings);
	}

	public int listingCount() {
		return this.listings.size();
	}

	public int getCredits(UUID playerId) {
		return this.credits.getOrDefault(playerId, 0);
	}

	@Nullable
	public UUID getBoundVillagerUuid() {
		return this.boundVillagerUuid;
	}

	public boolean stillValidForTrade(Player player) {
		if (this.level == null || this.level.getBlockEntity(this.worldPosition) != this) {
			return false;
		}
		return player.distanceToSqr(
				this.worldPosition.getX() + 0.5,
				this.worldPosition.getY() + 0.5,
				this.worldPosition.getZ() + 0.5
		) <= 64.0;
	}

	public void openShop(Player player) {
		if (this.level == null || this.level.isClientSide()) {
			return;
		}
		new DeskMerchant(this).openFor(player);
	}

	public boolean tryListItem(ServerPlayer player, ItemStack stack, int priceEmeralds) {
		if (stack.isEmpty()) {
			player.sendSystemMessage(Component.literal("Put an item in the listing slot first."));
			return false;
		}
		if (this.listings.size() >= MAX_LISTINGS) {
			player.sendSystemMessage(Component.literal("This stall is full (" + MAX_LISTINGS + " listings)."));
			return false;
		}
		int price = clamp(priceEmeralds, MIN_PRICE, MAX_PRICE);
		MarketListing listing = new MarketListing(
				UUID.randomUUID(),
				player.getUUID(),
				player.getGameProfile().name(),
				stack.copy(),
				price
		);
		this.listings.add(listing);
		stack.setCount(0);
		this.setChanged();
		player.sendSystemMessage(Component.literal(
				"Listed " + listing.stack().getHoverName().getString()
						+ " x" + listing.stack().getCount()
						+ " for " + price + " emerald" + (price == 1 ? "" : "s") + "."
		));
		return true;
	}

	public void completeListingSale(int listingIndex, int paidEmeralds) {
		if (listingIndex < 0 || listingIndex >= this.listings.size()) {
			return;
		}
		MarketListing listing = this.listings.remove(listingIndex);
		int credit = Math.max(listing.priceEmeralds(), paidEmeralds);
		this.credits.merge(listing.sellerUuid(), credit, Integer::sum);
		this.setChanged();
		if (this.level instanceof ServerLevel serverLevel) {
			ServerPlayer seller = serverLevel.getServer().getPlayerList().getPlayer(listing.sellerUuid());
			if (seller != null) {
				seller.sendSystemMessage(Component.literal(
						"Sold at Trader Desk: +" + credit + " emerald credit. Sneak-use the desk to claim."
				));
			}
		}
	}

	public void claimCredits(ServerPlayer player) {
		int amount = this.credits.getOrDefault(player.getUUID(), 0);
		if (amount <= 0) {
			player.sendSystemMessage(Component.literal("No emerald credit waiting at this desk."));
			return;
		}
		this.credits.remove(player.getUUID());
		this.setChanged();
		giveEmeralds(player, amount);
		player.sendSystemMessage(Component.literal("Claimed " + amount + " emerald" + (amount == 1 ? "" : "s") + "."));
	}

	public void bindNearestVillager(ServerPlayer player) {
		if (!(this.level instanceof ServerLevel serverLevel)) {
			return;
		}
		if (this.boundVillagerUuid != null) {
			player.sendSystemMessage(Component.literal("A Market Trader is already bound. Unbind first."));
			return;
		}
		AABB box = new AABB(this.worldPosition).inflate(BIND_RADIUS);
		List<Villager> nearby = serverLevel.getEntitiesOfClass(Villager.class, box, villager ->
				villager.isAlive() && !villager.isBaby()
						&& TraderDeskIndex.findDesk(serverLevel, villager.getUUID()) == null);
		if (nearby.isEmpty()) {
			player.sendSystemMessage(Component.literal("No free villager within " + BIND_RADIUS + " blocks."));
			return;
		}
		Villager villager = nearby.getFirst();
		this.boundVillagerUuid = villager.getUUID();
		villager.setCustomName(Component.literal("Market Trader"));
		villager.setCustomNameVisible(true);
		TraderDeskIndex.bind(villager.getUUID(), serverLevel.dimension(), this.worldPosition);
		this.setChanged();
		player.sendSystemMessage(Component.literal("Bound Market Trader. Right-click them (or this desk) to trade."));
	}

	public void unbindVillager(ServerPlayer player) {
		if (this.boundVillagerUuid == null) {
			player.sendSystemMessage(Component.literal("No villager bound to this desk."));
			return;
		}
		this.clearBinding(true);
		player.sendSystemMessage(Component.literal("Market Trader unbound."));
	}

	private void clearBinding(boolean clearName) {
		if (this.boundVillagerUuid == null) {
			return;
		}
		UUID id = this.boundVillagerUuid;
		TraderDeskIndex.unbind(id);
		if (clearName && this.level instanceof ServerLevel serverLevel) {
			Entity entity = serverLevel.getEntity(id);
			if (entity instanceof Villager villager) {
				villager.setCustomName(null);
				villager.setCustomNameVisible(false);
			}
		}
		this.boundVillagerUuid = null;
		this.setChanged();
	}

	@Override
	public void preRemoveSideEffects(BlockPos pos, BlockState state) {
		if (this.level != null && !this.level.isClientSide()) {
			this.dropAll(this.level, pos);
			this.clearBinding(true);
			if (this.level instanceof ServerLevel serverLevel) {
				TraderDeskIndex.unbindAt(serverLevel.dimension(), pos);
			}
		}
		super.preRemoveSideEffects(pos, state);
	}

	private void dropAll(Level level, BlockPos pos) {
		for (MarketListing listing : this.listings) {
			Containers.dropItemStack(level, pos.getX(), pos.getY(), pos.getZ(), listing.stack());
		}
		this.listings.clear();
		for (Map.Entry<UUID, Integer> entry : this.credits.entrySet()) {
			int left = entry.getValue();
			while (left > 0) {
				int give = Math.min(64, left);
				Containers.dropItemStack(level, pos.getX(), pos.getY(), pos.getZ(), new ItemStack(Items.EMERALD, give));
				left -= give;
			}
		}
		this.credits.clear();
		this.setChanged();
	}

	private static void giveEmeralds(ServerPlayer player, int amount) {
		int left = amount;
		while (left > 0) {
			int give = Math.min(64, left);
			ItemStack stack = new ItemStack(Items.EMERALD, give);
			if (!player.addItem(stack)) {
				player.drop(stack, false, Prediction.SERVER_ONLY);
			}
			left -= give;
		}
	}

	private static int clamp(int value, int min, int max) {
		return Math.max(min, Math.min(max, value));
	}

	@Override
	@NonNull
	public Component getDisplayName() {
		return Component.translatable("block.vultrom.trader_desk");
	}

	@Nullable
	@Override
	public AbstractContainerMenu createMenu(int containerId, Inventory inventory, Player player) {
		return new TraderDeskMenu(containerId, inventory, this);
	}

	@Override
	protected void saveAdditional(ValueOutput output) {
		super.saveAdditional(output);
		if (this.boundVillagerUuid != null) {
			output.putString("BoundVillager", this.boundVillagerUuid.toString());
		}
		ValueOutput.ValueOutputList listingOut = output.childrenList("Listings");
		for (MarketListing listing : this.listings) {
			listing.save(listingOut.addChild());
		}
		ValueOutput.ValueOutputList creditOut = output.childrenList("Credits");
		for (Map.Entry<UUID, Integer> entry : this.credits.entrySet()) {
			ValueOutput child = creditOut.addChild();
			child.putString("Uuid", entry.getKey().toString());
			child.putInt("Amount", entry.getValue());
		}
	}

	@Override
	protected void loadAdditional(ValueInput input) {
		super.loadAdditional(input);
		this.boundVillagerUuid = parseUuid(input.getStringOr("BoundVillager", ""));
		this.listings.clear();
		for (ValueInput child : input.childrenListOrEmpty("Listings")) {
			MarketListing listing = MarketListing.load(child);
			if (listing != null) {
				this.listings.add(listing);
			}
		}
		this.credits.clear();
		for (ValueInput child : input.childrenListOrEmpty("Credits")) {
			UUID id = parseUuid(child.getStringOr("Uuid", ""));
			int amount = child.getIntOr("Amount", 0);
			if (id != null && amount > 0) {
				this.credits.put(id, amount);
			}
		}
	}

	@Override
	public void setLevel(Level level) {
		super.setLevel(level);
		if (!level.isClientSide() && this.boundVillagerUuid != null && level instanceof ServerLevel serverLevel) {
			TraderDeskIndex.bind(this.boundVillagerUuid, serverLevel.dimension(), this.worldPosition);
		}
	}

	@Nullable
	private static UUID parseUuid(String value) {
		if (value == null || value.isBlank()) {
			return null;
		}
		try {
			return UUID.fromString(value.trim());
		} catch (IllegalArgumentException ignored) {
			return null;
		}
	}

	public String describeBoard(Player player) {
		String bound = this.boundVillagerUuid == null ? "no trader bound" : "Market Trader bound";
		return this.listings.size() + "/" + MAX_LISTINGS + " listings · "
				+ this.getCredits(player.getUUID()) + " emerald credit · " + bound;
	}

	public void pruneEmpty() {
		Iterator<MarketListing> it = this.listings.iterator();
		while (it.hasNext()) {
			if (it.next().stack().isEmpty()) {
				it.remove();
			}
		}
	}
}
