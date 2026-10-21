package net.vultrom.client.render;

import java.util.ArrayList;
import java.util.List;

import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.model.npc.VillagerModel;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.entity.state.VillagerRenderState;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LightLayer;
import net.minecraft.world.phys.Vec3;

import net.vultrom.Vultrom;
import net.vultrom.entity.SecurityGuardEntity;
import net.vultrom.guard.ArrestState;

/**
 * Vanilla villager model + custom security uniform texture.
 * During escort, fakes a lead rope to the cuffed player.
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

	@Override
	public void extractRenderState(SecurityGuardEntity entity, VillagerRenderState state, float partialTick) {
		super.extractRenderState(entity, state, partialTick);
		if (entity.getSyncedArrestState() != ArrestState.ESCORTING) {
			return;
		}
		int targetId = entity.getSyncedEscortTargetId();
		if (targetId < 0) {
			return;
		}
		Entity target = entity.level().getEntity(targetId);
		if (target == null) {
			return;
		}

		Vec3 guardPos = entity.getPosition(partialTick);
		Vec3 attach = new Vec3(0.0, entity.getBbHeight() * 0.55, 0.0);
		Vec3 start = guardPos.add(attach);
		Vec3 end = target.getPosition(partialTick).add(0.0, target.getBbHeight() * 0.45, 0.0);

		EntityRenderState.LeashState leash = new EntityRenderState.LeashState();
		leash.offset = attach;
		leash.start = start;
		leash.end = end;
		leash.slack = true;
		fillLight(entity.level(), leash, start, end);

		List<EntityRenderState.LeashState> states = new ArrayList<>(1);
		states.add(leash);
		state.leashStates = states;
	}

	private static void fillLight(Level level, EntityRenderState.LeashState leash, Vec3 start, Vec3 end) {
		BlockPos startPos = BlockPos.containing(start);
		BlockPos endPos = BlockPos.containing(end);
		leash.startBlockLight = level.getLightEngine().getLayerListener(LightLayer.BLOCK).getLightValue(startPos);
		leash.endBlockLight = level.getLightEngine().getLayerListener(LightLayer.BLOCK).getLightValue(endPos);
		leash.startSkyLight = level.getLightEngine().getLayerListener(LightLayer.SKY).getLightValue(startPos);
		leash.endSkyLight = level.getLightEngine().getLayerListener(LightLayer.SKY).getLightValue(endPos);
		leash.startBlockLight = Mth.clamp(leash.startBlockLight, 0, 15);
		leash.endBlockLight = Mth.clamp(leash.endBlockLight, 0, 15);
		leash.startSkyLight = Mth.clamp(leash.startSkyLight, 0, 15);
		leash.endSkyLight = Mth.clamp(leash.endSkyLight, 0, 15);
	}
}
