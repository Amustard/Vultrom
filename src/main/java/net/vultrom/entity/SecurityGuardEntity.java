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
import net.minecraft.world.entity.Entity;
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
import net.minecraft.world.phys.Vec3;

import net.vultrom.block.entity.custom.GuardPostBlockEntity;
import net.vultrom.guard.ArrestState;
import net.vultrom.guard.DetainTracker;
import net.vultrom.guard.EnforcementTone;
import net.vultrom.guard.GriefItems;
import net.vultrom.guard.PatrolMode;
import net.vultrom.sound.ModSounds;

/**
 * On-duty security NPC. Capture is chase → restrain → escort → hold (escapable).
 */
public class SecurityGuardEntity extends PathfinderMob {
	private static final int LOST_SIGHT_GIVE_UP_TICKS = 60;
	private static final double CHASE_MAX_RANGE = 64.0;
	private static final int RESTRAIN_TICKS_NEEDED = 45; // ~2.25s in melee
	private static final double RESTRAIN_RANGE = 2.75;
	private static final double RESTRAIN_BREAK_RANGE = 4.0;
	private static final int ESCORT_HITS_TO_BREAK = 3;
	private static final double ESCORT_BREAK_DISTANCE = 14.0;

	private BlockPos postPos = BlockPos.ZERO;
	private EnforcementTone tone = EnforcementTone.BALANCED;
	private PatrolMode patrolMode = PatrolMode.STAND;
	private int patrolDistance = 8;
	private int areaRadius = 16;
	private boolean captureEnabled;
	private int detainSeconds = 60;

	private int scanCooldown;
	private int patrolCooldown;
	private ArrestState arrestState = ArrestState.NONE;
	private int lostSightTicks;
	private int restrainProgress;
	private int escortHitsTaken;
	@Nullable
	private String arrestReason;

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

	public ArrestState getArrestState() {
		return this.arrestState;
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
		this.tickArrest(serverLevel, post);
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

	private void tickArrest(ServerLevel level, GuardPostBlockEntity post) {
		if (this.arrestState == ArrestState.NONE || this.arrestState == ArrestState.HELD) {
			return;
		}

		LivingEntity target = this.getTarget();
		if (!(target instanceof ServerPlayer player) || !player.isAlive() || this.distanceTo(player) > CHASE_MAX_RANGE) {
			this.breakArrest(playerOrNull(target), "Security Guard lost you.");
			return;
		}
		if (DetainTracker.isDetained(player.getUUID())) {
			this.clearArrest(false);
			return;
		}

		switch (this.arrestState) {
			case CHASE -> this.tickChase(player);
			case RESTRAINING -> this.tickRestrain(level, post, player);
			case ESCORTING -> this.tickEscort(level, post, player);
			default -> {
			}
		}
	}

	private void tickChase(ServerPlayer player) {
		if (this.hasLineOfSight(player)) {
			this.lostSightTicks = 0;
		} else {
			this.lostSightTicks++;
			if (this.lostSightTicks >= LOST_SIGHT_GIVE_UP_TICKS) {
				this.breakArrest(player, "You lost the Security Guard.");
				return;
			}
		}
		this.getNavigation().moveTo(player, 1.3);
		if (this.captureEnabled && this.distanceTo(player) <= RESTRAIN_RANGE) {
			this.arrestState = ArrestState.RESTRAINING;
			this.restrainProgress = 0;
			player.sendOverlayMessage(Component.literal("Being restrained — break away!"));
			player.sendSystemMessage(Component.literal(
					"Security Guard is trying to cuff you — sprint out of reach!"
			));
		}
	}

	private void tickRestrain(ServerLevel level, GuardPostBlockEntity post, ServerPlayer player) {
		this.getNavigation().moveTo(player, 1.15);
		double dist = this.distanceTo(player);
		if (dist > RESTRAIN_BREAK_RANGE) {
			this.arrestState = ArrestState.CHASE;
			this.restrainProgress = 0;
			player.sendOverlayMessage(Component.literal("Broke free of restrain"));
			return;
		}
		if (dist <= RESTRAIN_RANGE) {
			this.restrainProgress++;
			if (this.restrainProgress % 10 == 0) {
				int pct = Math.min(100, (this.restrainProgress * 100) / RESTRAIN_TICKS_NEEDED);
				player.sendOverlayMessage(Component.literal("Restraining… " + pct + "%"));
			}
			if (this.restrainProgress >= RESTRAIN_TICKS_NEEDED) {
				this.startEscort(level, post, player);
			}
		} else {
			this.restrainProgress = Math.max(0, this.restrainProgress - 2);
		}
	}

	private void startEscort(ServerLevel level, GuardPostBlockEntity post, ServerPlayer player) {
		this.arrestState = ArrestState.ESCORTING;
		this.escortHitsTaken = 0;
		this.confiscateAll(post, player, level);
		DetainTracker.applyEscortCuffs(player);
		player.sendSystemMessage(Component.literal(
				"Cuffed — being walked to the Guard Post. Hit the guard 3 times or get away to escape!"
		));
		player.sendOverlayMessage(Component.literal("Escorting to post"));
		this.playSound(ModSounds.GUARD_YES, 1.0f, 1.0f);
	}

	private void tickEscort(ServerLevel level, GuardPostBlockEntity post, ServerPlayer player) {
		DetainTracker.applyEscortCuffs(player);
		BlockPos hold = post.holdPoint();
		Vec3 holdCenter = Vec3.atBottomCenterOf(hold);
		double distToHold = player.position().distanceTo(holdCenter);

		// Soft lead: nudge player toward the post each tick (escapable).
		if (distToHold > 1.5) {
			Vec3 toHold = holdCenter.subtract(player.position()).normalize().scale(0.18);
			player.setDeltaMovement(player.getDeltaMovement().add(toHold).multiply(0.6, 1.0, 0.6));
			player.teleportRelative(toHold.x, 0.0, toHold.z);
		}

		this.getNavigation().moveTo(hold.getX() + 0.5, hold.getY(), hold.getZ() + 0.5, 1.0);

		if (this.distanceTo(player) > ESCORT_BREAK_DISTANCE) {
			this.breakArrest(player, "You broke away during escort!");
			return;
		}

		if (distToHold <= 2.0 && this.distanceTo(player) <= 3.5) {
			this.finishHold(post, player);
		}
	}

	private void finishHold(GuardPostBlockEntity post, ServerPlayer player) {
		String reason = this.arrestReason != null ? this.arrestReason : "arrested by Security Guard";
		DetainTracker.holdAtPost(player, post.holdPoint(), this.postPos, this.detainSeconds, reason);
		post.markDetained(player.getUUID());
		this.arrestState = ArrestState.HELD;
		this.playSound(ModSounds.GUARD_NO, 1.0f, 0.8f);
		this.setTarget(null);
		this.clearArrest(false);
		player.sendSystemMessage(Component.literal("Locked at the Guard Post."));
	}

	private void breakArrest(@Nullable ServerPlayer player, String message) {
		if (player != null) {
			DetainTracker.clearCuffEffects(player);
			player.sendSystemMessage(Component.literal(message));
			player.sendOverlayMessage(Component.literal("Escaped"));
		}
		this.clearArrest(true);
	}

	private void clearArrest(boolean clearTarget) {
		this.arrestState = ArrestState.NONE;
		this.lostSightTicks = 0;
		this.restrainProgress = 0;
		this.escortHitsTaken = 0;
		this.arrestReason = null;
		if (clearTarget) {
			this.setTarget(null);
		}
	}

	private void beginPursuit(LivingEntity target, String reason) {
		if (target instanceof ServerPlayer player && DetainTracker.isDetained(player.getUUID())) {
			return;
		}
		boolean already = this.arrestState != ArrestState.NONE && this.getTarget() == target;
		if (this.arrestState == ArrestState.NONE || this.arrestState == ArrestState.CHASE) {
			this.arrestState = ArrestState.CHASE;
		}
		this.arrestReason = reason;
		this.lostSightTicks = 0;
		this.setTarget(target);
		if (!already) {
			this.level().playSound(
					null,
					this.getX(),
					this.getY(),
					this.getZ(),
					ModSounds.GUARD_CHASE,
					this.getSoundSource(),
					1.35f,
					1.0f
			);
			if (target instanceof ServerPlayer player) {
				player.sendSystemMessage(Component.literal(
						"Security Guard is chasing you! Get out of sight or stay away to escape."
				));
			}
		}
	}

	/** Called when the escorting player punches this guard. */
	public void onEscortStruggleHit(ServerPlayer player) {
		if (this.arrestState != ArrestState.ESCORTING || this.getTarget() != player) {
			return;
		}
		this.escortHitsTaken++;
		int left = ESCORT_HITS_TO_BREAK - this.escortHitsTaken;
		if (left <= 0) {
			this.breakArrest(player, "You fought free of the cuffs!");
		} else {
			player.sendOverlayMessage(Component.literal("Struggle… " + left + " more hit(s) to escape"));
		}
	}

	private void tickMovement() {
		if (this.arrestState == ArrestState.CHASE
				|| this.arrestState == ArrestState.RESTRAINING
				|| this.arrestState == ArrestState.ESCORTING) {
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
		player.sendSystemMessage(Component.literal(
				"Security Guard sees flagged items but skips you (creative/spectator/ally)."
		));
	}

	private static ItemStack findFlaggedItem(Player player) {
		ItemStack selected = player.getInventory().getSelectedItem();
		if (GriefItems.isFlagged(selected)) {
			return selected;
		}
		ItemStack main = player.getMainHandItem();
		if (GriefItems.isFlagged(main)) {
			return main;
		}
		ItemStack off = player.getOffhandItem();
		if (GriefItems.isFlagged(off)) {
			return off;
		}
		for (ItemStack stack : player.getInventory().getNonEquipmentItems()) {
			if (GriefItems.isFlagged(stack)) {
				return stack;
			}
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

		String itemName = flagged.getItemName().getString();
		int warns = this.warnCounts.getOrDefault(id, 0);
		boolean onCooldown = this.warnCooldowns.containsKey(id);

		if (severity == GriefItems.Severity.SOFT) {
			if (!onCooldown) {
				this.warn(player, itemName);
				this.warnCounts.put(id, warns + 1);
				this.warnCooldowns.put(id, this.tone.warnCooldownTicks());
			}
			return;
		}

		this.warn(player, itemName);
		this.warnCounts.put(id, warns + 1);
		this.warnCooldowns.put(id, this.tone.warnCooldownTicks());
		this.confiscateAll(post, player, level);

		if (!this.captureEnabled) {
			player.sendSystemMessage(Component.literal(
					"Security Guard: Capture is OFF — items taken, but no arrest. Turn Capture ON at the desk."
			));
			this.setTarget(player);
			return;
		}

		if (this.tone == EnforcementTone.WARN_FIRST && severity != GriefItems.Severity.CRITICAL && warns < 1) {
			player.sendSystemMessage(Component.literal(
					"Security Guard: last warning — next time they'll chase to arrest you."
			));
			return;
		}

		// Start escapable arrest — not instant hold.
		this.beginPursuit(player, "flagged item: " + itemName);
	}

	private void warn(ServerPlayer player, String itemName) {
		player.sendSystemMessage(Component.literal(
				"Security Guard: Drop or surrender " + itemName + " — protected area."
		));
		player.sendOverlayMessage(Component.literal("Security warning"));
		this.playSound(ModSounds.GUARD_NO, 1.0f, 1.0f);
		this.getLookControl().setLookAt(player);
	}

	private void confiscateAll(GuardPostBlockEntity post, ServerPlayer player, ServerLevel level) {
		int taken = 0;
		var inv = player.getInventory();
		for (int i = 0; i < inv.getContainerSize(); i++) {
			ItemStack stack = inv.getItem(i);
			if (!GriefItems.isFlagged(stack)) {
				continue;
			}
			ItemStack removed = stack.copy();
			inv.setItem(i, ItemStack.EMPTY);
			if (!post.storeEvidence(removed)) {
				this.spawnAtLocation(level, removed, 0.0f);
			}
			taken++;
			player.sendSystemMessage(Component.literal(
					"Security Guard confiscated " + removed.getItemName().getString() + "."
			));
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

	@Override
	public boolean doHurtTarget(ServerLevel level, Entity target) {
		// Only fight during chase — never while cuffing / escorting / holding.
		if (this.arrestState != ArrestState.NONE && this.arrestState != ArrestState.CHASE) {
			return false;
		}
		if (target instanceof ServerPlayer player && DetainTracker.isDetained(player.getUUID())) {
			return false;
		}
		return super.doHurtTarget(level, target);
	}

	@Override
	public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
		boolean hurt = super.hurtServer(level, source, amount);
		if (!hurt) {
			return false;
		}
		if (source.getEntity() instanceof ServerPlayer attacker) {
			if (this.arrestState == ArrestState.ESCORTING && this.getTarget() == attacker) {
				this.onEscortStruggleHit(attacker);
				return true;
			}
			if (DetainTracker.isDetained(attacker.getUUID())) {
				return true;
			}
			this.beginPursuit(attacker, "assaulted a Security Guard");
			this.warnCounts.merge(attacker.getUUID(), 2, Integer::sum);
			GuardPostBlockEntity post = this.postEntity();
			if (post != null && this.captureEnabled && !post.isExempt(attacker)) {
				this.confiscateAll(post, attacker, level);
			}
		} else if (source.getEntity() instanceof LivingEntity living) {
			this.beginPursuit(living, "attacked a Security Guard");
		}
		return true;
	}

	@Nullable
	private static ServerPlayer playerOrNull(LivingEntity entity) {
		return entity instanceof ServerPlayer player ? player : null;
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
		this.captureEnabled = input.getBooleanOr("CaptureEnabled", true);
		this.detainSeconds = input.getIntOr("DetainSeconds", 60);
	}

	@Override
	public boolean removeWhenFarAway(double distanceToClosestPlayer) {
		return false;
	}

	@Override
	protected void dropFromLootTable(ServerLevel level, DamageSource damageSource, boolean causedByPlayer) {
	}

	@Override
	public boolean canBeLeashed() {
		return false;
	}
}
