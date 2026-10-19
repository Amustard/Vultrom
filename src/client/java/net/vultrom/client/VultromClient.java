package net.vultrom.client;

import net.minecraft.client.gui.screens.MenuScreens;
import net.minecraft.client.renderer.entity.EntityRenderers;

import net.fabricmc.api.ClientModInitializer;

import net.vultrom.client.render.SecurityGuardRenderer;
import net.vultrom.client.screen.GuardPostScreen;
import net.vultrom.entity.ModEntityTypes;
import net.vultrom.menu.ModMenuTypes;

public class VultromClient implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		MenuScreens.register(ModMenuTypes.GUARD_POST, GuardPostScreen::new);
		EntityRenderers.register(ModEntityTypes.SECURITY_GUARD, SecurityGuardRenderer::new);
	}
}
