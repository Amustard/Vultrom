package net.vultrom.block.custom;

import org.jspecify.annotations.Nullable;

import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.BaseEntityBlock;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;

import net.vultrom.block.entity.custom.TraderDeskBlockEntity;

/**
 * Market stall workstation. Right-click trades; sneak+right-click opens the listing board.
 */
public class TraderDeskBlock extends BaseEntityBlock {
	public TraderDeskBlock(Properties properties) {
		super(properties);
	}

	@Nullable
	@Override
	public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
		return new TraderDeskBlockEntity(pos, state);
	}

	@Override
	protected RenderShape getRenderShape(BlockState state) {
		return RenderShape.MODEL;
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (level.isClientSide()) {
			return InteractionResult.SUCCESS;
		}
		if (!(level.getBlockEntity(pos) instanceof TraderDeskBlockEntity desk)) {
			return InteractionResult.PASS;
		}
		if (player.isShiftKeyDown()) {
			if (player instanceof ServerPlayer serverPlayer) {
				serverPlayer.sendSystemMessage(Component.literal(
						"SELL BOARD — 1) put your item in the gray slot  2) set emerald price with +/-  3) click List item for sale. Claim pays out sold listings."
				));
			}
			player.openMenu(desk);
		} else {
			if (player instanceof ServerPlayer serverPlayer) {
				serverPlayer.sendSystemMessage(Component.literal(
						"SHOP — buy unique stock + other players' listings here. To SELL your stuff: sneak + right-click this desk."
				));
			}
			desk.openShop(player);
		}
		return InteractionResult.SUCCESS;
	}
}
