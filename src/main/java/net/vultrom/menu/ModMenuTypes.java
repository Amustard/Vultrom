package net.vultrom.menu;

import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.flag.FeatureFlagSet;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.MenuType;

import net.vultrom.Vultrom;

public final class ModMenuTypes {
	public static final MenuType<GuardPostMenu> GUARD_POST = register("guard_post", GuardPostMenu::new);
	public static final MenuType<TraderDeskMenu> TRADER_DESK = register("trader_desk", TraderDeskMenu::new);

	private ModMenuTypes() {
	}

	public static <T extends AbstractContainerMenu> MenuType<T> register(String name, MenuType.MenuSupplier<T> constructor) {
		return Registry.register(BuiltInRegistries.MENU, Vultrom.id(name), new MenuType<>(constructor, FeatureFlagSet.of()));
	}

	public static void initialize() {
	}
}
