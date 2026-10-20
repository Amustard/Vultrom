package net.vultrom.guard;

/**
 * Multi-step capture so players can escape — not instant teleport-jail.
 *
 * <ol>
 *   <li>{@link #CHASE} — guard pursues; can fight; escape by losing LOS / range</li>
 *   <li>{@link #RESTRAINING} — must stay in melee ~2s; leave range to break free</li>
 *   <li>{@link #ESCORTING} — “cuffed” walk to post; hit guard 3× or get far to break free</li>
 *   <li>{@link #HELD} — locked at post (timer / op release)</li>
 * </ol>
 */
public enum ArrestState {
	NONE,
	CHASE,
	RESTRAINING,
	ESCORTING,
	HELD
}
