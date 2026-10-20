Custom guard sounds (optional)
================================

By default guards use vanilla villager voices (wired in sounds.json).

To use your own clips:
1. Put mono/stereo .ogg files in THIS folder, e.g.:
     ambient.ogg
     hurt.ogg
     death.ogg
     no.ogg
     yes.ogg
2. Edit assets/vultrom/sounds.json and change each entry from
     { "type": "event", "name": "minecraft:entity.villager...." }
   to
     "vultrom:entity/security_guard/ambient"
   (match the filename without .ogg)
3. Rebuild the mod (./gradlew build) and replace the jar in mods/

Keep files reasonably short. Minecraft expects Ogg Vorbis (.ogg), not mp3/wav.
