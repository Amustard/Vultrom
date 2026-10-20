package net.vultrom.entity;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.jspecify.annotations.Nullable;

import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
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
import net.vultrom.sound.ModSounds;

/**
 * On-duty security NPC. Vanilla villager proportions; client renderer supplies the custom skin.
 */
public class SecurityGuardEntity extends PathfinderMob {
	private static final int LOST_SIGHT_GIVE_UP_TICKS = 60;
	private static final double CHASE_MAX_RANGE = 64.0;

	private BlockPos postPos = BlockPos.ZERO;
	private EnforcementTone tone = EnforcementTone.BALANCED;
	private PatrolMode patrolMode = PatrolMode.STAND;
	private int patrolDistance = 8;
	private int areaRadius = 16;
	private boolean captureEnabled;
	private int detainSeconds = 60;

	private int scanCooldown;
	private int patrolCooldown;
	private boolean pursuitMode;
	private int lostSightTicks;
	private final Map<UUID, Integer> warnCounts = new HashMap<>();
	private final Map<UUID, Integer> warnCooldowns = new HashMap<>();
	private final Map<UUID, Integer> exemptTips = new HashMap<>();

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
				.add(Attributes.MAX_HEALTH, 40.0)
				.add(Attributes.MOVEMENT_SPEED, 0.38)
				.add(Attributes.ATTACK_DAMAGE, 5.0)
				.add(Attributes.FOLLOW_RANGE, 64.0)
				.add(Attributes.ARMOR, 6.0);
	}

	@Override
	protected void registerGoals() {
		this.goalSelector.addGoal(0, new FloatGoal(this));
		this.goalSelector.addGoal(1, new MeleeAttackGoal(this, 1.25, true));
		this.goalSelector.addGoal(2, new LookAtPlayerGoal(this, Player.class, 10.0f));
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
		this.tickPursuit(serverLevel, post);
		this.tickMovement();
		if (this.scanCooldown-- <= 0) {
			this.scanCooldown = 10;
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
		this.exemptTips.entrySet().removeIf(e -> {
			int left = e.getValue() - 1;
			if (left <= 0) {
				return true;
			}
			e.setValue(left);
			return false;
		});
	}

	private void tickPursuit(ServerLevel level, GuardPostBlockEntity post) {
		LivingEntity target = this.getTarget();
		if (!this.pursuitMode) {
			return;
		}
		if (target == null || !target.isAlive() || this.distanceTo(target) > CHASE_MAX_RANGE) {
			this.clearPursuit();
			return;
		}
		if (this.hasLineOfSight(target)) {
			this.lostSightTicks = 0;
		} else {
			this.lostSightTicks++;
			if (this.lostSightTicks >= LOST_SIGHT_GIVE_UP_TICKS) {
				this.clearPursuit();
				return;
			}
		}
		this.getNavigation().moveTo(target, 1.3);
		if (target instanceof ServerPlayer player && this.captureEnabled && this.distanceTo(player) < 2.5) {
			this.confiscateAll(post, player, level);
			this.detain(post, player, "assaulted a Security Guard");
			this.clearPursuit();
		}
	}

	private void clearPursuit() {
		this.pursuitMode = false;
		this.lostSightTicks = 0;
		this.setTarget(null);
	}

	private void beginPursuit(LivingEntity target) {
		this.pursuitMode = true;
		this.lostSightTicks = 0;
		this.setTarget(target);
		this.playSound(ModSounds.GUARD_NO, 1.0f, 1.0f);
	}

	private void tickMovement() {
		if (this.pursuitMode && this.getTarget() != null) {
			// Boundaries ignored while chasing an attacker.
			return;
		}

		BlockPos post = this.postPos;
		double distSq = this.distanceToSqr(post.getX() + 0.5, post.getY() + 1.0, post.getZ() + 0.5);
		if (this.getTarget() != null) {
			return;
		}

		if (this.patrolMode == PatrolMode.STAND) {
			if (distSq > 2.25) {
				this.getNavigation().moveTo(post.getX() + 0.5, post.getY() + 1.0, post.getZ() + 0.5, 0.9);
			}
			return;
		}

		double max = this.patrolDistance;
		if (distSq > max * max) {
			this.getNavigation().moveTo(post.getX() + 0.5, post.getY() + 1.0, post.getZ() + 0.5, 1.0);
			return;
		}

		if (this.patrolCooldown-- <= 0 && this.getNavigation().isDone()) {
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
			if (DetainTracker.isDetained(player.getUUID())) {
				continue;
			}
			ItemStack flagged = findFlaggedItem(player);
			if (flagged.isEmpty()) {
				continue;
			}
			if (post.isExempt(player)) {
				this.tipExempt(player);
				continue;
			}
			this.handleOffender(level, post, player, flagged);
			break;
		}
	}

	private void tipExempt(ServerPlayer player) {
		if (this.exemptTips.containsKey(player.getUUID())) {
			return;
		}
		this.exemptTips.put(player.getUUID(), 20 * 20);
		if (player.isCreative() || player.isSpectator()) {
			player.sendSystemMessage(Component.literal(
					"Security Guard notices your items but ignores creative/spectator players."
			));
		}
	}

	private static ItemStack findFlaggedItem(Player player) {
		ItemStack main = player.getMainHandItem();
		if (GriefItems.isFlagged(main)) {
			return main;
		}
		ItemStack off = player.getOffhandItem();
		if (GriefItems.isFlagged(off)) {
			return off;
		}
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

		if (severity == GriefItems.Severity.CRITICAL && (this.tone.captureOnCritical() || this.tone == EnforcementTone.STRICT)) {
			this.warn(player, flagged);
			this.confiscateAll(post, player, level);
			this.setTarget(player);
			if (this.captureEnabled) {
				this.detain(post, player, "critical grief item: " + flagged.getHoverName().getString());
			}
			this.warnCounts.put(id, warns + 1);
			this.warnCooldowns.put(id, this.tone.warnCooldownTicks());
			return;
		}

		if (!onCooldown) {
			this.warn(player, flagged);
			this.warnCounts.put(id, warns + 1);
			this.warnCooldowns.put(id, this.tone.warnCooldownTicks());
			if (severity != GriefItems.Severity.SOFT) {
				this.confiscateAll(post, player, level);
			}
			if (this.captureEnabled && warns + 1 > this.tone.warnsBeforeAttack()) {
				this.detain(post, player, "ignored security orders (" + flagged.getHoverName().getString() + ")");
			} else if (warns + 1 > this.tone.warnsBeforeAttack()) {
				this.setTarget(player);
			}
			return;
		}

		this.setTarget(player);
		this.confiscateAll(post, player, level);
		if (this.captureEnabled) {
			this.detain(post, player, "resisting security orders (" + flagged.getHoverName().getString() + ")");
		}
	}

	private void warn(ServerPlayer player, ItemStack flagged) {
		player.sendSystemMessage(Component.literal(
				"Security Guard: Drop or surrender " + flagged.getHoverName().getString() + " — protected area."
		));
		player.sendOverlayMessage(Component.literal("Security warning"));
		this.playSound(ModSounds.GUARD_NO, 1.0f, 1.0f);
		this.getLookControl().setLookAt(player);
	}

	private void confiscateAll(GuardPostBlockEntity post, ServerPlayer player, ServerLevel level) {
		int taken = 0;
		for (int i = 0; i < player.getInventory().getContainerSize(); i++) {
			ItemStack stack = player.getInventory().getItem(i);
			if (!GriefItems.isFlagged(stack)) {
				continue;
			}
			ItemStack removed = stack.copy();
			player.getInventory().setItem(i, ItemStack.EMPTY);
			if (!post.storeEvidence(removed)) {
				this.spawnAtLocation(level, removed, 0.0f);
			}
			taken++;
			player.sendSystemMessage(Component.literal("Security Guard confiscated " + removed.getHoverName().getString() + "."));
		}
		if (taken > 0) {
			this.playSound(ModSounds.GUARD_YES, 1.0f, 1.0f);
			post.notifyOps(level, Component.literal("[Vultrom] Confiscated "
					+ taken
					+ " flagged stack(s) from "
					+ player.getGameProfile().name()
					+ " at "
					+ this.postPos.toShortString()));
		}
	}

	private void detain(GuardPostBlockEntity post, ServerPlayer player, String reason) {
		if (!this.captureEnabled || DetainTracker.isDetained(player.getUUID())) {
			return;
		}
		DetainTracker.detain(player, post.holdPoint(), this.postPos, this.detainSeconds, reason);
		post.markDetained(player.getUUID());
		this.playSound(ModSounds.GUARD_NO, 1.0f, 0.8f);
		this.setTarget(null);
	}

	@Override
	public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
		boolean hurt = super.hurtServer(level, source, amount);
		if (hurt && source.getEntity() instanceof LivingEntity attacker) {
			// Attackers are chased past post boundaries until line of sight is lost.
			this.beginPursuit(attacker);
			if (attacker instanceof ServerPlayer serverPlayer) {
				this.warnCounts.merge(serverPlayer.getUUID(), 2, Integer::sum);
				GuardPostBlockEntity post = this.postEntity();
				if (post != null && this.captureEnabled && !post.isExempt(serverPlayer)) {
					this.confiscateAll(post, serverPlayer, level);
				}
			}
		}
		return hurt;
	}

	@Nullable
	@Override
	protected SoundEvent getAmbientSound() {
		return ModSounds.GUARD_AMBIENT;
	}

	@Override
	protected SoundEvent getHurtSound(DamageSource source) {
		return ModSounds.GUARD_HURT;
	}

	@Override
	protected SoundEvent getDeathSound() {
		return ModSounds.GUARD_DEATH;
	}

	@Override
	public int getAmbientSoundInterval() {
		return 80 + this.random.nextInt(40);
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
