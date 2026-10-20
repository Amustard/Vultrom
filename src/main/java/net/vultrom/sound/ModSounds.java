package net.vultrom.sound;

import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.sounds.SoundEvent;

import net.vultrom.Vultrom;

/**
 * Guard voice lines. Defaults redirect to vanilla villager sounds in {@code sounds.json}.
 * Drop your own {@code .ogg} files under {@code assets/vultrom/sounds/entity/security_guard/}
 * and point {@code sounds.json} at them to replace the defaults.
 */
public final class ModSounds {
	public static final SoundEvent GUARD_AMBIENT = register("entity.security_guard.ambient");
	public static final SoundEvent GUARD_HURT = register("entity.security_guard.hurt");
	public static final SoundEvent GUARD_DEATH = register("entity.security_guard.death");
	public static final SoundEvent GUARD_NO = register("entity.security_guard.no");
	public static final SoundEvent GUARD_YES = register("entity.security_guard.yes");
	/** Played when a player hits the guard and chase starts. */
	public static final SoundEvent GUARD_CHASE = register("entity.security_guard.chase");

	private ModSounds() {
	}

	private static SoundEvent register(String path) {
		return Registry.register(
				BuiltInRegistries.SOUND_EVENT,
				Vultrom.id(path),
				SoundEvent.createVariableRangeEvent(Vultrom.id(path))
		);
	}

	public static void initialize() {
	}
}
