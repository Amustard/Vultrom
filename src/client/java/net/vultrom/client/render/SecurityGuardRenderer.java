package net.vultrom.client.render;

import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.model.npc.VillagerModel;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.client.renderer.entity.state.VillagerRenderState;
import net.minecraft.resources.Identifier;

import net.vultrom.Vultrom;
import net.vultrom.entity.SecurityGuardEntity;

/**
 * Vanilla villager model + custom security uniform texture.
 */
public class SecurityGuardRenderer extends MobRenderer<SecurityGuardEntity, VillagerRenderState, VillagerModel> {
	private static final Identifier TEXTURE = Vultrom.id("textures/entity/security_guard.png");

	public SecurityGuardRenderer(EntityRendererProvider.Context context) {
		super(context, new VillagerModel(context.bakeLayer(ModelLayers.VILLAGER)), 0.5f);
	}

	@Override
	public VillagerRenderState createRenderState() {
		return new VillagerRenderState();
	}

	@Override
	public Identifier getTextureLocation(VillagerRenderState state) {
		return TEXTURE;
	}
}
