package net.vultrom.market;

import java.util.Optional;

import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.trading.ItemCost;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.item.trading.MerchantOffers;

import net.vultrom.item.ModItems;

/**
 * Desk stock — trades vanilla villagers do not normally offer (or price oddly).
 */
public final class UniqueCatalog {
	private UniqueCatalog() {
	}

	public static MerchantOffers createOffers() {
		MerchantOffers offers = new MerchantOffers();
		offers.add(buy(5, new ItemStack(Items.NAME_TAG)));
		offers.add(buy(12, new ItemStack(Items.SADDLE)));
		offers.add(buy(8, new ItemStack(Items.ECHO_SHARD)));
		offers.add(buy(10, new ItemStack(Items.HEART_OF_THE_SEA)));
		offers.add(buy(6, new ItemStack(Items.SPYGLASS)));
		offers.add(buy(16, new ItemStack(Items.TRIDENT)));
		offers.add(buy(24, new ItemStack(Items.TOTEM_OF_UNDYING)));
		offers.add(buy(14, new ItemStack(Items.MUSIC_DISC_PIGSTEP)));
		offers.add(buy(7, new ItemStack(Items.BUNDLE)));
		offers.add(buy(3, new ItemStack(Items.ENDER_PEARL, 4)));
		offers.add(buy(8, new ItemStack(ModItems.CAMERA)));
		offers.add(buyTwo(4, Items.AMETHYST_SHARD, 3, new ItemStack(Items.DIAMOND)));
		offers.add(buyTwo(32, Items.PHANTOM_MEMBRANE, 2, new ItemStack(Items.ELYTRA)));
		offers.add(buy(20, new ItemStack(Items.ENCHANTED_GOLDEN_APPLE)));
		offers.add(buy(18, new ItemStack(Items.SNIFFER_EGG)));
		offers.add(buy(9, new ItemStack(Items.GOAT_HORN)));
		offers.add(buy(11, new ItemStack(Items.HEAVY_CORE)));
		offers.add(buy(5, new ItemStack(Items.WIND_CHARGE, 8)));
		offers.add(buy(13, new ItemStack(Items.OMINOUS_BOTTLE)));
		offers.add(buy(15, new ItemStack(Items.TRIAL_KEY)));
		return offers;
	}

	private static MerchantOffer buy(int emeralds, ItemStack result) {
		return new MerchantOffer(
				new ItemCost(Items.EMERALD, emeralds),
				result,
				12,
				8,
				0.05f
		);
	}

	private static MerchantOffer buyTwo(int emeralds, net.minecraft.world.item.Item second, int secondCount, ItemStack result) {
		return new MerchantOffer(
				new ItemCost(Items.EMERALD, emeralds),
				Optional.of(new ItemCost(second, secondCount)),
				result,
				6,
				12,
				0.05f
		);
	}
}
