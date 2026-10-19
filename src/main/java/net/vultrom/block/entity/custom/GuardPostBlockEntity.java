package net.vultrom.block.entity.custom;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.jspecify.annotations.NonNull;
import org.jspecify.annotations.Nullable;

import net.minecraft.core.BlockPos;
import net.minecraft.core.NonNullList;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.permissions.Permissions;
import net.minecraft.world.ContainerHelper;
import net.minecraft.world.Containers;
import net.minecraft.world.MenuProvider;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.AABB;

import net.vultrom.block.entity.ModBlockEntities;
import net.vultrom.entity.ModEntityTypes;
import net.vultrom.entity.SecurityGuardEntity;
import net.vultrom.guard.DetainTracker;
import net.vultrom.guard.EnforcementTone;
import net.vultrom.guard.GriefItems;
import net.vultrom.guard.PatrolMode;
import net.vultrom.menu.GuardPostMenu;

/**
 * Source of truth for a Security Guard post. Hired guard entities are disposable and
 * respawn from this block after restart / despawn.
 */
public class GuardPostBlockEntity extends BlockEntity implements MenuProvider {
	public static final int MIN_PATROL = 4;
	public static final int MAX_PATROL = 32;
	public static final int MIN_AREA = 4;
	public static final int MAX_AREA = 48;
	public static final int MIN_DETAIN_SECONDS = 30;
	public static final int MAX_DETAIN_SECONDS = 120;
	public static final int EVIDENCE_SLOTS = 9;

	private boolean hired;
	private EnforcementTone tone = EnforcementTone.BALANCED;
	private PatrolMode patrolMode = PatrolMode.STAND;
	private int patrolDistance = 8;
	private int areaRadius = 16;
	private boolean captureEnabled;
	private int detainSeconds = 60;
	@Nullable
	private UUID guardUuid;
	@Nullable
	private UUID detaineeUuid;
	private final List<UUID> allies = new ArrayList<>();
	private final NonNullList<ItemStack> evidence = NonNullList.withSize(EVIDENCE_SLOTS, ItemStack.EMPTY);

	private int tickCounter;

	public GuardPostBlockEntity(BlockPos pos, BlockState state) {
		super(ModBlockEntities.GUARD_POST, pos, state);
	}

	public boolean isHired() {
		return this.hired;
	}

	public EnforcementTone getTone() {
		return this.tone;
	}

	public PatrolMode getPatrolMode() {
		return this.patrolMode;
	}

	public int getPatrolDistance() {
		return this.patrolDistance;
	}

	public int getAreaRadius() {
		return this.areaRadius;
	}

	public boolean isCaptureEnabled() {
		return this.captureEnabled;
	}

	public int getDetainSeconds() {
		return this.detainSeconds;
	}

	@Nullable
	public UUID getGuardUuid() {
		return this.guardUuid;
	}

	@Nullable
	public UUID getDetaineeUuid() {
		return this.detaineeUuid;
	}

	public NonNullList<ItemStack> getEvidence() {
		return this.evidence;
	}

	public boolean isAlly(UUID uuid) {
		return this.allies.contains(uuid);
	}

	public void hire(ServerPlayer operator) {
		if (this.hired) {
			return;
		}
		if (!canConfigure(operator)) {
			operator.sendSystemMessage(Component.literal("Only operators can hire Security Guards."));
			return;
		}
		this.hired = true;
		this.spawnGuard((ServerLevel) operator.level());
		this.setChanged();
		operator.sendSystemMessage(Component.literal("Security hired. Configure standing orders at this desk."));
	}

	public void dismiss(ServerPlayer operator) {
		if (!canConfigure(operator)) {
			return;
		}
		this.despawnGuard();
		this.hired = false;
		this.guardUuid = null;
		this.setChanged();
		operator.sendSystemMessage(Component.literal("Security dismissed. Post is unmanned."));
	}

	/** Called when the post block is broken. */
	public void dismissAllForBreak() {
		if (this.detaineeUuid != null && this.level instanceof ServerLevel serverLevel) {
			DetainTracker.release(this.detaineeUuid, serverLevel, "Released — Guard Post removed.");
			this.detaineeUuid = null;
		}
		this.despawnGuard();
		this.hired = false;
		this.guardUuid = null;
		this.setChanged();
	}

	@Override
	public void preRemoveSideEffects(BlockPos pos, BlockState state) {
		if (this.level != null && !this.level.isClientSide()) {
			this.dismissAllForBreak();
			this.dropContents(this.level, pos);
		}
		super.preRemoveSideEffects(pos, state);
	}

	public void cycleTone(ServerPlayer operator) {
		if (!canConfigure(operator) || !this.hired) {
			return;
		}
		this.tone = this.tone.next();
		this.setChanged();
		this.syncGuardDuty();
		operator.sendSystemMessage(Component.literal("Enforcement tone: " + this.tone.label()));
	}

	public void togglePatrolMode(ServerPlayer operator) {
		if (!canConfigure(operator) || !this.hired) {
			return;
		}
		this.patrolMode = this.patrolMode.next();
		this.setChanged();
		this.syncGuardDuty();
		operator.sendSystemMessage(Component.literal("Duty mode: " + this.patrolMode.label()));
	}

	public void adjustPatrolDistance(ServerPlayer operator, int delta) {
		if (!canConfigure(operator) || !this.hired) {
			return;
		}
		this.patrolDistance = clamp(this.patrolDistance + delta, MIN_PATROL, MAX_PATROL);
		this.setChanged();
		this.syncGuardDuty();
		operator.sendSystemMessage(Component.literal("Patrol distance: " + this.patrolDistance));
	}

	public void adjustAreaRadius(ServerPlayer operator, int delta) {
		if (!canConfigure(operator) || !this.hired) {
			return;
		}
		this.areaRadius = clamp(this.areaRadius + delta, MIN_AREA, MAX_AREA);
		this.setChanged();
		this.syncGuardDuty();
		operator.sendSystemMessage(Component.literal("Watch area radius: " + this.areaRadius));
	}

	public void toggleCapture(ServerPlayer operator) {
		if (!canConfigure(operator) || !this.hired) {
			return;
		}
		this.captureEnabled = !this.captureEnabled;
		this.setChanged();
		this.syncGuardDuty();
		operator.sendSystemMessage(Component.literal("Capture: " + (this.captureEnabled ? "ON" : "OFF")));
	}

	public void adjustDetainSeconds(ServerPlayer operator, int delta) {
		if (!canConfigure(operator) || !this.hired) {
			return;
		}
		this.detainSeconds = clamp(this.detainSeconds + delta, MIN_DETAIN_SECONDS, MAX_DETAIN_SECONDS);
		this.setChanged();
		operator.sendSystemMessage(Component.literal("Detain duration: " + this.detainSeconds + "s"));
	}

	public void releaseDetainee(ServerPlayer operator) {
		if (!canConfigure(operator)) {
			return;
		}
		if (this.detaineeUuid == null || !(this.level instanceof ServerLevel serverLevel)) {
			operator.sendSystemMessage(Component.literal("No detainee at this post."));
			return;
		}
		DetainTracker.release(this.detaineeUuid, serverLevel, "Released by an operator.");
		this.detaineeUuid = null;
		this.setChanged();
		operator.sendSystemMessage(Component.literal("Detainee released."));
	}

	public boolean canConfigure(Player player) {
		return player.permissions().hasPermission(Permissions.COMMANDS_GAMEMASTER);
	}

	public boolean isExempt(Player player) {
		if (player.permissions().hasPermission(Permissions.COMMANDS_GAMEMASTER)) {
			return true;
		}
		if (player.isCreative()) {
			return true;
		}
		return this.isAlly(player.getUUID());
	}

	public BlockPos holdPoint() {
		return this.worldPosition.above();
	}

	public void markDetained(UUID playerId) {
		this.detaineeUuid = playerId;
		this.setChanged();
	}

	public void clearDetaineeIf(UUID playerId) {
		if (playerId.equals(this.detaineeUuid)) {
			this.detaineeUuid = null;
			this.setChanged();
		}
	}

	public boolean storeEvidence(ItemStack stack) {
		for (int i = 0; i < this.evidence.size(); i++) {
			ItemStack slot = this.evidence.get(i);
			if (slot.isEmpty()) {
				this.evidence.set(i, stack.copy());
				this.setChanged();
				return true;
			}
			if (ItemStack.isSameItemSameComponents(slot, stack) && slot.getCount() < slot.getMaxStackSize()) {
				int space = slot.getMaxStackSize() - slot.getCount();
				int move = Math.min(space, stack.getCount());
				slot.grow(move);
				stack.shrink(move);
				this.setChanged();
				if (stack.isEmpty()) {
					return true;
				}
			}
		}
		return stack.isEmpty();
	}

	public static void serverTick(Level level, BlockPos pos, BlockState state, GuardPostBlockEntity post) {
		if (!(level instanceof ServerLevel serverLevel)) {
			return;
		}
		post.tickCounter++;

		if (post.hired && post.tickCounter % 40 == 0) {
			post.ensureGuardPresent(serverLevel);
		}

		if (post.detaineeUuid != null && !DetainTracker.isDetained(post.detaineeUuid)) {
			post.detaineeUuid = null;
			post.setChanged();
		}
	}

	private void ensureGuardPresent(ServerLevel level) {
		if (this.guardUuid != null) {
			Entity existing = level.getEntity(this.guardUuid);
			if (existing instanceof SecurityGuardEntity) {
				return;
			}
		}
		this.spawnGuard(level);
	}

	private void spawnGuard(ServerLevel level) {
		this.despawnGuard();
		SecurityGuardEntity guard = ModEntityTypes.SECURITY_GUARD.create(level, EntitySpawnReason.TRIGGERED);
		if (guard == null) {
			return;
		}
		BlockPos pos = this.worldPosition;
		guard.snapTo(pos.getX() + 0.5, pos.getY() + 1.0, pos.getZ() + 0.5, 0.0f, 0.0f);
		guard.bindToPost(pos);
		guard.applyDuty(this.tone, this.patrolMode, this.patrolDistance, this.areaRadius, this.captureEnabled, this.detainSeconds);
		level.addFreshEntity(guard);
		this.guardUuid = guard.getUUID();
		this.setChanged();
	}

	private void despawnGuard() {
		if (this.guardUuid == null || !(this.level instanceof ServerLevel serverLevel)) {
			return;
		}
		Entity entity = serverLevel.getEntity(this.guardUuid);
		if (entity != null) {
			entity.discard();
		}
	}

	private void syncGuardDuty() {
		if (this.guardUuid == null || !(this.level instanceof ServerLevel serverLevel)) {
			return;
		}
		if (serverLevel.getEntity(this.guardUuid) instanceof SecurityGuardEntity guard) {
			guard.applyDuty(this.tone, this.patrolMode, this.patrolDistance, this.areaRadius, this.captureEnabled, this.detainSeconds);
		}
	}

	private static int clamp(int value, int min, int max) {
		return Math.max(min, Math.min(max, value));
	}

	@Override
	@NonNull
	public Component getDisplayName() {
		return Component.translatable("block.vultrom.guard_post");
	}

	@Nullable
	@Override
	public AbstractContainerMenu createMenu(int containerId, Inventory inventory, Player player) {
		return new GuardPostMenu(containerId, inventory, this);
	}

	@Override
	protected void saveAdditional(ValueOutput output) {
		super.saveAdditional(output);
		output.putBoolean("Hired", this.hired);
		output.putInt("Tone", this.tone.ordinal());
		output.putInt("PatrolMode", this.patrolMode.ordinal());
		output.putInt("PatrolDistance", this.patrolDistance);
		output.putInt("AreaRadius", this.areaRadius);
		output.putBoolean("CaptureEnabled", this.captureEnabled);
		output.putInt("DetainSeconds", this.detainSeconds);
		if (this.guardUuid != null) {
			output.putString("GuardUuid", this.guardUuid.toString());
		}
		if (this.detaineeUuid != null) {
			output.putString("DetaineeUuid", this.detaineeUuid.toString());
		}
		StringBuilder allyJoined = new StringBuilder();
		for (int i = 0; i < this.allies.size(); i++) {
			if (i > 0) {
				allyJoined.append(',');
			}
			allyJoined.append(this.allies.get(i));
		}
		output.putString("Allies", allyJoined.toString());
		ContainerHelper.saveAllItems(output, this.evidence);
	}

	@Override
	protected void loadAdditional(ValueInput input) {
		super.loadAdditional(input);
		this.hired = input.getBooleanOr("Hired", false);
		this.tone = EnforcementTone.byId(input.getIntOr("Tone", EnforcementTone.BALANCED.ordinal()));
		this.patrolMode = PatrolMode.byId(input.getIntOr("PatrolMode", PatrolMode.STAND.ordinal()));
		this.patrolDistance = clamp(input.getIntOr("PatrolDistance", 8), MIN_PATROL, MAX_PATROL);
		this.areaRadius = clamp(input.getIntOr("AreaRadius", 16), MIN_AREA, MAX_AREA);
		this.captureEnabled = input.getBooleanOr("CaptureEnabled", false);
		this.detainSeconds = clamp(input.getIntOr("DetainSeconds", 60), MIN_DETAIN_SECONDS, MAX_DETAIN_SECONDS);
		this.guardUuid = parseUuid(input.getStringOr("GuardUuid", ""));
		this.detaineeUuid = parseUuid(input.getStringOr("DetaineeUuid", ""));
		this.allies.clear();
		String alliesRaw = input.getStringOr("Allies", "");
		if (!alliesRaw.isBlank()) {
			for (String part : alliesRaw.split(",")) {
				UUID id = parseUuid(part);
				if (id != null) {
					this.allies.add(id);
				}
			}
		}
		for (int i = 0; i < EVIDENCE_SLOTS; i++) {
			this.evidence.set(i, ItemStack.EMPTY);
		}
		ContainerHelper.loadAllItems(input, this.evidence);
	}

	@Nullable
	private static UUID parseUuid(String value) {
		if (value == null || value.isBlank()) {
			return null;
		}
		try {
			return UUID.fromString(value.trim());
		} catch (IllegalArgumentException ignored) {
			return null;
		}
	}

	public void dropContents(Level level, BlockPos pos) {
		Containers.dropContents(level, pos, this.evidence);
	}

	public AABB watchArea() {
		return new AABB(this.worldPosition).inflate(this.areaRadius);
	}

	public String describeStatus() {
		if (!this.hired) {
			return "Unmanned desk — hire security to begin.";
		}
		return "On duty · " + this.tone.label() + " · " + this.patrolMode.label()
				+ " · area " + this.areaRadius
				+ (this.patrolMode == PatrolMode.PATROL ? (" · patrol " + this.patrolDistance) : "")
				+ " · capture " + (this.captureEnabled ? "ON" : "OFF");
	}

	/** Used by guards for confiscation feedback. */
	public void notifyOps(ServerLevel level, Component message) {
		level.getServer().getPlayerList().broadcastSystemMessage(message, false);
	}

	public static boolean isGriefItem(ItemStack stack) {
		return GriefItems.isFlagged(stack);
	}
}
