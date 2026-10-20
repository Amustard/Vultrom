package net.vultrom.guard;

import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

/**
 * Default harmful / grief items — hardcoded vanilla IDs for reliable detection.
 */
public final class GriefItems {
	public enum Severity {
		SOFT,
		HARD,
		CRITICAL
	}

	private GriefItems() {
	}

	public static boolean isFlagged(ItemStack stack) {
		return severityOf(stack) != null;
	}

	public static Severity severityOf(ItemStack stack) {
		if (stack.isEmpty()) {
			return null;
		}
		Item item = stack.getItem();
		if (item == Items.TNT
				|| item == Items.TNT_MINECART
				|| item == Items.END_CRYSTAL
				|| item == Items.RESPAWN_ANCHOR) {
			return Severity.CRITICAL;
		}
		if (item == Items.LAVA_BUCKET
				|| item == Items.FLINT_AND_STEEL
				|| item == Items.FIRE_CHARGE) {
			return Severity.HARD;
		}
		if (item == Items.WATER_BUCKET || item == Items.WITHER_SKELETON_SKULL) {
			return Severity.SOFT;
		}
		return null;
	}
}
