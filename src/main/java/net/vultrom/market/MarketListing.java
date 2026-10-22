package net.vultrom.market;

import java.util.UUID;

import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * One player sell listing parked at a Trader Desk.
 */
public final class MarketListing {
	private final UUID id;
	private final UUID sellerUuid;
	private final String sellerName;
	private final ItemStack stack;
	private final int priceEmeralds;

	public MarketListing(UUID id, UUID sellerUuid, String sellerName, ItemStack stack, int priceEmeralds) {
		this.id = id;
		this.sellerUuid = sellerUuid;
		this.sellerName = sellerName == null ? "Seller" : sellerName;
		this.stack = stack.copy();
		this.priceEmeralds = Math.max(1, priceEmeralds);
	}

	public UUID id() {
		return this.id;
	}

	public UUID sellerUuid() {
		return this.sellerUuid;
	}

	public String sellerName() {
		return this.sellerName;
	}

	public ItemStack stack() {
		return this.stack.copy();
	}

	public int priceEmeralds() {
		return this.priceEmeralds;
	}

	public void save(ValueOutput output) {
		output.putString("Id", this.id.toString());
		output.putString("SellerUuid", this.sellerUuid.toString());
		output.putString("SellerName", this.sellerName);
		output.putInt("Price", this.priceEmeralds);
		output.store("Stack", ItemStack.CODEC, this.stack);
	}

	public static MarketListing load(ValueInput input) {
		UUID id = parseUuid(input.getStringOr("Id", ""));
		UUID seller = parseUuid(input.getStringOr("SellerUuid", ""));
		if (id == null || seller == null) {
			return null;
		}
		ItemStack stack = input.read("Stack", ItemStack.CODEC).orElse(ItemStack.EMPTY);
		if (stack.isEmpty()) {
			return null;
		}
		return new MarketListing(
				id,
				seller,
				input.getStringOr("SellerName", "Seller"),
				stack,
				input.getIntOr("Price", 1)
		);
	}

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
}
