package net.vultrom.block.custom;

import org.jspecify.annotations.Nullable;

import net.minecraft.core.BlockPos;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.BaseEntityBlock;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.BlockEntityTicker;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;

import net.vultrom.block.entity.ModBlockEntities;
import net.vultrom.block.entity.custom.GuardPostBlockEntity;

/**
 * Security desk. Placing it does <strong>not</strong> spawn a guard.
 * Right-click opens the villager-like hire / duty UI.
 */
public class GuardPostBlock extends BaseEntityBlock {
	public GuardPostBlock(Properties properties) {
		super(properties);
	}

	@Nullable
	@Override
	public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {
		return new GuardPostBlockEntity(pos, state);
	}

	@Override
	protected RenderShape getRenderShape(BlockState state) {
		return RenderShape.MODEL;
	}

	@Override
	protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
		if (!level.isClientSide() && level.getBlockEntity(pos) instanceof GuardPostBlockEntity post) {
			player.openMenu(post);
		}
		return InteractionResult.SUCCESS;
	}

	@Nullable
	@Override
	public <T extends BlockEntity> BlockEntityTicker<T> getTicker(Level level, BlockState state, BlockEntityType<T> type) {
		return level.isClientSide()
				? null
				: createTickerHelper(type, ModBlockEntities.GUARD_POST, GuardPostBlockEntity::serverTick);
	}

}
