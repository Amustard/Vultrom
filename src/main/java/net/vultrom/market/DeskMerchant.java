package net.vultrom.market;

import org.jspecify.annotations.Nullable;

import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.trading.ItemCost;
import net.minecraft.world.item.trading.Merchant;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.item.trading.MerchantOffers;

import net.vultrom.block.entity.custom.TraderDeskBlockEntity;

/**
 * Desk-backed merchant: unique catalog first, then player listings as one-shot emerald buys.
 */
public class DeskMerchant implements Merchant {
	private final TraderDeskBlockEntity desk;
	private final MerchantOffers offers = new MerchantOffers();
	private final int catalogCount;
	@Nullable
	private Player tradingPlayer;

	public DeskMerchant(TraderDeskBlockEntity desk) {
		this.desk = desk;
		MerchantOffers catalog = UniqueCatalog.createOffers();
		this.catalogCount = catalog.size();
		this.offers.addAll(catalog);
		for (MarketListing listing : desk.getListings()) {
			this.offers.add(toOffer(listing));
		}
	}

	private static MerchantOffer toOffer(MarketListing listing) {
		return new MerchantOffer(
				new ItemCost(Items.EMERALD, listing.priceEmeralds()),
				listing.stack(),
				1,
				0,
				0.0f
		);
	}

	public void openFor(Player player) {
		this.openTradingScreen(player, this.desk.shopTitle(), 1);
	}

	@Override
	public void setTradingPlayer(@Nullable Player player) {
		this.tradingPlayer = player;
	}

	@Nullable
	@Override
	public Player getTradingPlayer() {
		return this.tradingPlayer;
	}

	@Override
	public MerchantOffers getOffers() {
		return this.offers;
	}

	@Override
	public void overrideOffers(MerchantOffers offers) {
	}

	@Override
	public void notifyTrade(MerchantOffer offer) {
		int index = this.offers.indexOf(offer);
		if (index < 0) {
			for (int i = this.catalogCount; i < this.offers.size(); i++) {
				if (sameListingTrade(this.offers.get(i), offer)) {
					index = i;
					break;
				}
			}
		}
		if (index >= this.catalogCount) {
			int listingIndex = index - this.catalogCount;
			this.desk.completeListingSale(listingIndex, offer.getCostA().getCount());
		}
	}

	private static boolean sameListingTrade(MerchantOffer a, MerchantOffer b) {
		return ItemStack.isSameItemSameComponents(a.getResult(), b.getResult())
				&& a.getCostA().getCount() == b.getCostA().getCount()
				&& a.getMaxUses() == 1
				&& b.getMaxUses() == 1;
	}

	@Override
	public void notifyTradeUpdated(ItemStack stack) {
	}

	@Override
	public int getVillagerXp() {
		return 0;
	}

	@Override
	public void overrideXp(int xp) {
	}

	@Override
	public boolean showProgressBar() {
		return false;
	}

	@Override
	public SoundEvent getNotifyTradeSound() {
		return SoundEvents.VILLAGER_YES;
	}

	@Override
	public boolean isClientSide() {
		return this.desk.getLevel() != null && this.desk.getLevel().isClientSide();
	}

	@Override
	public boolean stillValid(Player player) {
		return this.desk.stillValidForTrade(player);
	}
}
