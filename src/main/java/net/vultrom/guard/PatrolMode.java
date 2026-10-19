package net.vultrom.guard;

import net.minecraft.network.chat.Component;

public enum PatrolMode {
	STAND("Stand"),
	PATROL("Patrol");

	private final String label;

	PatrolMode(String label) {
		this.label = label;
	}

	public String label() {
		return this.label;
	}

	public Component displayName() {
		return Component.literal(this.label);
	}

	public PatrolMode next() {
		return this == STAND ? PATROL : STAND;
	}

	public static PatrolMode byId(int id) {
		return id == PATROL.ordinal() ? PATROL : STAND;
	}
}
