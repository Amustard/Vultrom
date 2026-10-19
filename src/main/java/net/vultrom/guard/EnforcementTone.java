package net.vultrom.guard;

import net.minecraft.network.chat.Component;

public enum EnforcementTone {
	WARN_FIRST("Warn-first"),
	BALANCED("Balanced"),
	STRICT("Strict");

	private final String label;

	EnforcementTone(String label) {
		this.label = label;
	}

	public String label() {
		return this.label;
	}

	public Component displayName() {
		return Component.literal(this.label);
	}

	public EnforcementTone next() {
		EnforcementTone[] values = values();
		return values[(this.ordinal() + 1) % values.length];
	}

	public static EnforcementTone byId(int id) {
		EnforcementTone[] values = values();
		if (id < 0 || id >= values.length) {
			return BALANCED;
		}
		return values[id];
	}

	/** Ticks after a warn before the next escalation step. */
	public int warnCooldownTicks() {
		return switch (this) {
			case WARN_FIRST -> 20 * 12;
			case BALANCED -> 20 * 8;
			case STRICT -> 20 * 4;
		};
	}

	/** How many ignored warns before attack (when not critical). */
	public int warnsBeforeAttack() {
		return switch (this) {
			case WARN_FIRST -> 2;
			case BALANCED -> 1;
			case STRICT -> 0;
		};
	}

	/** Whether critical grief items jump straight toward capture when capture is on. */
	public boolean captureOnCritical() {
		return this != WARN_FIRST;
	}
}
