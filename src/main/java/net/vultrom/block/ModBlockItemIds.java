package net.vultrom.block;

import net.minecraft.references.BlockItemId;
import net.minecraft.resources.Identifier;

import net.vultrom.Vultrom;

public final class ModBlockItemIds {
	public static final BlockItemId GUARD_POST = create("guard_post");
	public static final BlockItemId TRADER_DESK = create("trader_desk");

	private ModBlockItemIds() {
	}

	private static BlockItemId create(String name) {
		Identifier id = Vultrom.id(name);
		return BlockItemId.create(id, id);
	}
}
