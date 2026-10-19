package net.vultrom.guard;

import net.minecraft.core.registries.Registries;
import net.minecraft.tags.TagKey;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import net.vultrom.Vultrom;

/**
 * Default harmful / grief items. Prefer the {@code #vultrom:grief_tools} tag when present;
 * fall back to a hardcoded vanilla list so the mod works without datapack reload issues.
 */
public final class GriefItems {
	public static final TagKey<Item> GRIEF_TOOLS = TagKey.create(Registries.ITEM, Vultrom.id("grief_tools"));

	public enum Severity {
		SOFT,
		HARD,
		CRITICAL
	}

	private GriefItems() {
	}

	public static boolean isFlagged(ItemStack stack) {
		if (stack.isEmpty()) {
			return false;
		}
		if (stack.is(GRIEF_TOOLS)) {
			return true;
		}
		return severityOf(stack) != null;
	}

	public static Severity severityOf(ItemStack stack) {
		if (stack.isEmpty()) {
			return null;
		}
		Item item = stack.getItem();
		if (item == Items.TNT || item == Items.END_CRYSTAL || item == Items.RESPAWN_ANCHOR) {
			return Severity.CRITICAL;
		}
		if (item == Items.LAVA_BUCKET || item == Items.FLINT_AND_STEEL || item == Items.FIRE_CHARGE) {
			return Severity.HARD;
		}
		if (item == Items.WATER_BUCKET || item == Items.WITHER_SKELETON_SKULL) {
			return Severity.SOFT;
		}
		if (stack.is(GRIEF_TOOLS)) {
			return Severity.HARD;
		}
		return null;
	}
}
