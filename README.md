# Vultrom (Bedrock)

Minecraft **Bedrock** addon: rare **Sapphire** ore, **Gemstone Cutter** workstation, and **Jeweler** trades.

> Java Fabric (Security Guards, Camera, Trader Desk) lives on the [`java`](https://github.com/Amustard/Vultrom/tree/java) branch — including playable `dist/` jars.

## Download (easiest)

| File | Link |
|------|------|
| **All-in-one** | [Vultrom.mcaddon](https://github.com/Amustard/Vultrom/raw/main/dist/Vultrom.mcaddon) |
| Behavior pack | [Vultrom_BP.mcpack](https://github.com/Amustard/Vultrom/raw/main/dist/Vultrom_BP.mcpack) |
| Resource pack | [Vultrom_RP.mcpack](https://github.com/Amustard/Vultrom/raw/main/dist/Vultrom_RP.mcpack) |

Also listed under [`dist/`](./dist/) and GitHub Release **[v0.1.4-bedrock](https://github.com/Amustard/Vultrom/releases/tag/v0.1.4-bedrock)**.

### Install

Requires Minecraft Bedrock **1.21.50 or newer**.

1. Download **Vultrom.mcaddon** (or both `.mcpack` files).
2. **Double-click** to import into Minecraft Bedrock.
3. Create or edit a world → **Resource Packs** + **Behavior Packs** → activate **both** Vultrom packs.
4. **No experiments required** — sapphire ore is placed by Script API (not `feature_rules`).
5. Play and explore — ore seeds into loaded Overworld chunks around you (Y **-48…32**, stone/deepslate). Existing explored areas get ore as you re-enter them.

### Upgrading from an older Vultrom

Bedrock can keep loading an old copy of a pack, so remove the old ones before importing:

1. Close the world. **Settings → Storage** (or *Global Resources / My Packs*) → delete **every** “Vultrom Behavior” and “Vultrom Resources” entry.
2. Edit the world → **Behavior Packs** and **Resource Packs** → deactivate any Vultrom pack still listed under *Active*.
3. Fully quit Minecraft, reopen, then import the new **Vultrom.mcaddon**.
4. Edit the world → activate **Vultrom Behavior** (the resource pack is added with it). The pack descriptions should read **v0.1.4**.

## Source packs (dev)

| Folder | Role |
|--------|------|
| `Vultrom_BP/` | Behavior — blocks, item, script ore seeding, Jeweler entity, trades, bind script, find function |
| `Vultrom_RP/` | Resources — textures, entity look, lang |
| `art/` | Source art not loaded by the game (Mason's Jeweler profession overlay) |
| `tools/` | `build-dist.sh` (rebuild `dist/`), `bake_jeweler_skin.py` (rebuild the Jeweler skin) |

Rebuild downloads:

```bash
tools/build-dist.sh
```

After changing `art/jeweler-profession.png`, re-bake the Jeweler skin first (needs Pillow):

```bash
python3 tools/bake_jeweler_skin.py
```

## How to play

1. Mine **Sapphire Ore** → get **Raw Sapphire** (Fortune adds more; Silk Touch drops the ore block).
2. Place a **Gemstone Cutter** and right-click it → put **1 Raw Sapphire** in the grid → take **1 Sapphire**.
3. The first time you use a cutter with a villager within 5 blocks, that villager becomes its **Jeweler** (gold robe, always-visible “Jeweler” nametag). Each cutter employs one Jeweler — once it has one nearby, using the cutter converts nobody else. Chat confirms with **[Vultrom RP 1.0.4 loaded]** — if you see `vultrom.rp_check` instead, the resource pack is missing or out of date.
4. Right-click the Jeweler → sell **1 Sapphire for 40–80 emeralds**.

Creative: **Sapphire Ore** is in the **Nature** tab inside the **Ores** group.

### Find nearest Sapphire Ore

Cheats / commands enabled:

```
/function vultrom/find_sapphire
```

Or type `!findsapphire` in chat — this shortcut only works with the **Beta APIs** experiment on.

Searches loaded chunks up to **192 blocks** away and reports coordinates and distance. (`/locate` cannot find custom ore blocks.)

## Details

| Feature | Detail |
|---------|--------|
| Sapphire Ore | **5 veins/chunk**, **3 blocks/vein**, Y **-48…32**, replaces stone/deepslate/granite/diorite/andesite/tuff — script-seeded within 4 chunks of each player, no Custom Biomes experiment |
| Raw Sapphire | Ore drop (loot table); Fortune bonus via script (vanilla ore formula); Silk Touch drops the ore |
| Sapphire | Gemstone Cutter: 1 Raw Sapphire → 1 Sapphire (`recipes/sapphire_from_raw.json`) |
| Gemstone Cutter | `minecraft:crafting_table` UI (tag `vultrom:gemstone_cutter`) + Jeweler workstation via script (Bedrock has no custom vanilla professions) |
| Jeweler trade | 1 Sapphire → **40–80 emeralds** |

### Why not `feature_rules`?

Bedrock Wiki / creator docs: custom `features` + `feature_rules` need the **Custom Biomes** experiment (“Create custom biomes and change world generation”). That toggle is missing or removed on some Bedrock builds (e.g. Preview where custom biomes left experimental). Vultrom therefore seeds ore with `@minecraft/server` `setBlockType` instead.

### Textures

| Asset | Status |
|-------|--------|
| Sapphire ore block | Final (Mason) |
| Sapphire gem item | “Bunch o' Gems” sapphire by Beatso & Zankor2 (third-party — check license before wider release) |
| Raw Sapphire item | **Placeholder** (dulled, stony sapphire) — Mason sending the real art |
| Jeweler look | Mason's gold-robe overlay (`art/jeweler-profession.png`) baked onto the plains villager → `textures/entity/vultrom/jeweler.png` |
| Gemstone Cutter block | Placeholder until Mason’s art |

### Jeweler fix (v0.1.3)

- **Script never ran:** v0.1.0–v0.1.2 pinned `@minecraft/server` **1.14.0**, where `world.afterEvents.playerInteractWithBlock` is beta-only. The script crashed on load, so the Gemstone Cutter, ore seeding and `find_sapphire` were all dead. Now **1.15.0** (first stable with it).
- **Render:** the Jeweler drew only through vanilla villager internals (`villager_v2` / `villager_v2_masked` materials, three layered controllers, vanilla geometry). It now uses its own geometry (`geometry.vultrom.jeweler`), `entity_alphatest`, one render controller and one baked texture — the standard custom-mob setup.
- Spawns the Jeweler **before** removing the villager, so a failed spawn never deletes the villager.

### v0.1.4

- **Sapphire Ore never generated / missing from creative:** the block declared the 1.21.60-style group `minecraft:itemGroup.name.ore` while using `format_version` 1.21.40, where groups are un-namespaced. Now `itemGroup.name.ore`. The script now reports in chat and the content log if the ore block isn't registered instead of failing silently.
- **Jeweler legs:** the walk animation's clock (`query.modified_distance_moved`) freezes when the Jeweler stops, so the legs froze mid-stride. The walk is now weighted by `query.modified_move_speed`, as vanilla villagers do; the bind pose is straight.
