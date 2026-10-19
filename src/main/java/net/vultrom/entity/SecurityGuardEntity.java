package net.vultrom.entity;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.jspecify.annotations.Nullable;

import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.AABB;

import net.vultrom.block.entity.custom.GuardPostBlockEntity;
import net.vultrom.guard.DetainTracker;
import net.vultrom.guard.EnforcementTone;
import net.vultrom.guard.GriefItems;
import net.vultrom.guard.PatrolMode;

/**
 * On-duty security NPC. Vanilla villager proportions; client renderer supplies the custom skin.
 */
public class SecurityGuardEntity extends PathfinderMob {
	private BlockPos postPos = BlockPos.ZERO;
	private EnforcementTone tone = EnforcementTone.BALANCED;
	private PatrolMode patrolMode = PatrolMode.STAND;
	private int patrolDistance = 8;
	private int areaRadius = 16;
	private boolean captureEnabled;
	private int detainSeconds = 60;

	private int scanCooldown;
	private int patrolCooldown;
	private final Map<UUID, Integer> warnCounts = new HashMap<>();
	private final Map<UUID, Integer> warnCooldowns = new HashMap<>();

	public SecurityGuardEntity(Level level) {
		this(ModEntityTypes.SECURITY_GUARD, level);
	}

	public SecurityGuardEntity(EntityType<? extends SecurityGuardEntity> type, Level level) {
		super(type, level);
		this.setPersistenceRequired();
		this.setCustomName(Component.literal("Security Guard"));
		this.setCustomNameVisible(true);
	}

	public static AttributeSupplier.Builder createAttributes() {
		return PathfinderMob.createMobAttributes()
				.add(Attributes.MAX_HEALTH, 30.0)
				.add(Attributes.MOVEMENT_SPEED, 0.35)
				.add(Attributes.ATTACK_DAMAGE, 4.0)
				.add(Attributes.FOLLOW_RANGE, 32.0)
				.add(Attributes.ARMOR, 4.0);
	}

	@Override
	protected void registerGoals() {
		this.goalSelector.addGoal(0, new FloatGoal(this));
		this.goalSelector.addGoal(1, new MeleeAttackGoal(this, 1.15, false));
		this.goalSelector.addGoal(2, new LookAtPlayerGoal(this, Player.class, 8.0f));
		this.goalSelector.addGoal(3, new RandomLookAroundGoal(this));
		this.targetSelector.addGoal(1, new HurtByTargetGoal(this));
	}

	public void bindToPost(BlockPos pos) {
		this.postPos = pos.immutable();
	}

	public void applyDuty(
			EnforcementTone tone,
			PatrolMode patrolMode,
			int patrolDistance,
			int areaRadius,
			boolean captureEnabled,
			int detainSeconds
	) {
		this.tone = tone;
		this.patrolMode = patrolMode;
		this.patrolDistance = patrolDistance;
		this.areaRadius = areaRadius;
		this.captureEnabled = captureEnabled;
		this.detainSeconds = detainSeconds;
	}

	public BlockPos getPostPos() {
		return this.postPos;
	}

	@Nullable
	private GuardPostBlockEntity postEntity() {
		if (this.level() == null) {
			return null;
		}
		BlockEntity be = this.level().getBlockEntity(this.postPos);
		return be instanceof GuardPostBlockEntity post ? post : null;
	}

	@Override
	public void tick() {
		super.tick();
		if (this.level().isClientSide() || !(this.level() instanceof ServerLevel serverLevel)) {
			return;
		}

		GuardPostBlockEntity post = this.postEntity();
		if (post == null || !post.isHired()) {
			this.discard();
			return;
		}

		this.tickWarnCooldowns();
		this.tickMovement();
		if (this.scanCooldown-- <= 0) {
			this.scanCooldown = 20;
			this.scanArea(serverLevel, post);
		}
	}

	private void tickWarnCooldowns() {
		this.warnCooldowns.entrySet().removeIf(e -> {
			int left = e.getValue() - 1;
			if (left <= 0) {
				return true;
			}
			e.setValue(left);
			return false;
		});
	}

	private void tickMovement() {
		BlockPos post = this.postPos;
		double distSq = this.distanceToSqr(post.getX() + 0.5, post.getY() + 1.0, post.getZ() + 0.5);
		if (this.patrolMode == PatrolMode.STAND) {
			if (distSq > 2.25 && this.getTarget() == null) {
				this.getNavigation().moveTo(post.getX() + 0.5, post.getY() + 1.0, post.getZ() + 0.5, 0.9);
			}
			return;
		}

		double max = this.patrolDistance;
		if (distSq > max * max) {
			this.getNavigation().moveTo(post.getX() + 0.5, post.getY() + 1.0, post.getZ() + 0.5, 1.0);
			return;
		}

		if (this.patrolCooldown-- <= 0 && this.getTarget() == null && this.getNavigation().isDone()) {
			this.patrolCooldown = 40 + this.random.nextInt(60);
			double angle = this.random.nextDouble() * Math.PI * 2;
			double radius = 2 + this.random.nextDouble() * Math.max(1, max - 2);
			double x = post.getX() + 0.5 + Math.cos(angle) * radius;
			double z = post.getZ() + 0.5 + Math.sin(angle) * radius;
			this.getNavigation().moveTo(x, post.getY() + 1.0, z, 0.85);
		}
	}

	private void scanArea(ServerLevel level, GuardPostBlockEntity post) {
		AABB area = new AABB(this.postPos).inflate(this.areaRadius);
		for (ServerPlayer player : level.getEntitiesOfClass(ServerPlayer.class, area)) {
			if (post.isExempt(player) || DetainTracker.isDetained(player.getUUID())) {
				continue;
			}
			ItemStack flagged = findFlaggedItem(player);
			if (flagged.isEmpty()) {
				continue;
			}
			this.handleOffender(level, post, player, flagged);
			break;
		}
	}

	private static ItemStack findFlaggedItem(Player player) {
		for (int i = 0; i < player.getInventory().getContainerSize(); i++) {
			ItemStack stack = player.getInventory().getItem(i);
			if (GriefItems.isFlagged(stack)) {
				return stack;
			}
		}
		return ItemStack.EMPTY;
	}

	private void handleOffender(ServerLevel level, GuardPostBlockEntity post, ServerPlayer player, ItemStack flagged) {
		UUID id = player.getUUID();
		GriefItems.Severity severity = GriefItems.severityOf(flagged);
		if (severity == null) {
			severity = GriefItems.Severity.HARD;
		}

		boolean onCooldown = this.warnCooldowns.containsKey(id);
		int warns = this.warnCounts.getOrDefault(id, 0);

		if (severity == GriefItems.Severity.CRITICAL && this.tone.captureOnCritical() && this.captureEnabled) {
			this.confiscate(post, player, flagged, level);
			this.detain(post, player, "critical grief item: " + flagged.getHoverName().getString());
			return;
		}

		if (!onCooldown && warns <= this.tone.warnsBeforeAttack()) {
			this.warn(player, flagged);
			this.warnCounts.put(id, warns + 1);
			this.warnCooldowns.put(id, this.tone.warnCooldownTicks());
			if (severity != GriefItems.Severity.SOFT) {
				this.confiscate(post, player, flagged, level);
			}
			return;
		}

		if (warns > this.tone.warnsBeforeAttack() || (onCooldown && severity != GriefItems.Severity.SOFT)) {
			this.setTarget(player);
			this.confiscate(post, player, flagged, level);
			if (this.captureEnabled && (warns >= this.tone.warnsBeforeAttack() + 1 || severity == GriefItems.Severity.CRITICAL)) {
				this.detain(post, player, "resisting security orders (" + flagged.getHoverName().getString() + ")");
			}
		}
	}

	private void warn(ServerPlayer player, ItemStack flagged) {
		player.sendSystemMessage(Component.literal(
				"Security Guard: Drop or surrender " + flagged.getHoverName().getString() + " — you are in a protected area."
		));
		player.sendOverlayMessage(Component.literal("Security warning"));
		this.getLookControl().setLookAt(player);
	}

	private void confiscate(GuardPostBlockEntity post, ServerPlayer player, ItemStack sample, ServerLevel level) {
		ItemStack removed = ItemStack.EMPTY;
		for (int i = 0; i < player.getInventory().getContainerSize(); i++) {
			ItemStack stack = player.getInventory().getItem(i);
			if (GriefItems.isFlagged(stack) && ItemStack.isSameItemSameComponents(stack, sample)) {
				removed = stack.copy();
				player.getInventory().setItem(i, ItemStack.EMPTY);
				break;
			}
		}
		if (removed.isEmpty()) {
			return;
		}
		if (!post.storeEvidence(removed)) {
			this.spawnAtLocation(level, removed, 0.0f);
		}
		player.sendSystemMessage(Component.literal("Security Guard confiscated " + removed.getHoverName().getString() + "."));
		post.notifyOps(level, Component.literal("[Vultrom] Confiscated "
				+ removed.getHoverName().getString()
				+ " from "
				+ player.getGameProfile().name()
				+ " at "
				+ this.postPos.toShortString()));
	}

	private void detain(GuardPostBlockEntity post, ServerPlayer player, String reason) {
		if (!this.captureEnabled || DetainTracker.isDetained(player.getUUID())) {
			return;
		}
		DetainTracker.detain(player, post.holdPoint(), this.postPos, this.detainSeconds, reason);
		post.markDetained(player.getUUID());
		this.setTarget(null);
	}

	@Override
	public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
		boolean hurt = super.hurtServer(level, source, amount);
		if (hurt && source.getEntity() instanceof ServerPlayer serverPlayer) {
			GuardPostBlockEntity post = this.postEntity();
			if (post != null && !post.isExempt(serverPlayer)) {
				this.setTarget(serverPlayer);
				this.warnCounts.merge(serverPlayer.getUUID(), 2, Integer::sum);
			}
		}
		return hurt;
	}

	@Override
	protected void addAdditionalSaveData(ValueOutput output) {
		super.addAdditionalSaveData(output);
		output.putInt("PostX", this.postPos.getX());
		output.putInt("PostY", this.postPos.getY());
		output.putInt("PostZ", this.postPos.getZ());
		output.putInt("Tone", this.tone.ordinal());
		output.putInt("PatrolMode", this.patrolMode.ordinal());
		output.putInt("PatrolDistance", this.patrolDistance);
		output.putInt("AreaRadius", this.areaRadius);
		output.putBoolean("CaptureEnabled", this.captureEnabled);
		output.putInt("DetainSeconds", this.detainSeconds);
	}

	@Override
	protected void readAdditionalSaveData(ValueInput input) {
		super.readAdditionalSaveData(input);
		this.postPos = new BlockPos(
				input.getIntOr("PostX", 0),
				input.getIntOr("PostY", 0),
				input.getIntOr("PostZ", 0)
		);
		this.tone = EnforcementTone.byId(input.getIntOr("Tone", EnforcementTone.BALANCED.ordinal()));
		this.patrolMode = PatrolMode.byId(input.getIntOr("PatrolMode", PatrolMode.STAND.ordinal()));
		this.patrolDistance = input.getIntOr("PatrolDistance", 8);
		this.areaRadius = input.getIntOr("AreaRadius", 16);
		this.captureEnabled = input.getBooleanOr("CaptureEnabled", false);
		this.detainSeconds = input.getIntOr("DetainSeconds", 60);
	}

	@Override
	public boolean removeWhenFarAway(double distanceToClosestPlayer) {
		return false;
	}

	@Override
	protected void dropFromLootTable(ServerLevel level, DamageSource damageSource, boolean causedByPlayer) {
		// No loot — post remains authority.
	}

	@Override
	public boolean canBeLeashed() {
		return false;
	}
}
