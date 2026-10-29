# Vultrom (Bedrock)

Minecraft **Bedrock** addon: rare **Sapphire** ore, **Gemstone Cutter** workstation, and **Jeweler** trades.

> Java Fabric (Security Guards, Camera, Trader Desk) lives on the [`java`](https://github.com/Amustard/Vultrom/tree/java) branch — including playable `dist/` jars.

## Download (easiest)

| File | Link |
|------|------|
| **All-in-one** | [Vultrom-0.1.5.mcaddon](https://github.com/Amustard/Vultrom/raw/main/dist/Vultrom-0.1.5.mcaddon) |
| Behavior pack | [Vultrom_BP-0.1.5.mcpack](https://github.com/Amustard/Vultrom/raw/main/dist/Vultrom_BP-0.1.5.mcpack) |
| Resource pack | [Vultrom_RP-0.1.5.mcpack](https://github.com/Amustard/Vultrom/raw/main/dist/Vultrom_RP-0.1.5.mcpack) |

Also listed under [`dist/`](./dist/) and GitHub Release **[v0.1.5-bedrock](https://github.com/Amustard/Vultrom/releases/tag/v0.1.5-bedrock)**. From 0.1.5 on, file names carry the version.

### Install

Requires Minecraft Bedrock **1.21.50 or newer**.

1. Download **Vultrom-0.1.5.mcaddon** (or both `.mcpack` files).
2. **Double-click** to import into Minecraft Bedrock.
3. Create or edit a world → **Resource Packs** + **Behavior Packs** → activate **both** Vultrom packs.
4. **No experiments required** — sapphire ore is placed by Script API (not `feature_rules`).
5. Play and explore — ore seeds into loaded Overworld chunks around you (Y **-48…32**, stone/deepslate). Existing explored areas get ore as you re-enter them.

### Upgrading from an older Vultrom

Bedrock can keep loading an old copy of a pack, so remove the old ones before importing:

1. Close the world. **Settings → Storage** (or *Global Resources / My Packs*) → delete **every** “Vultrom Behavior” and “Vultrom Resources” entry.
2. Edit the world → **Behavior Packs** and **Resource Packs** → deactivate any Vultrom pack still listed under *Active*.
3. Fully quit Minecraft, reopen, then import the new **Vultrom-0.1.5.mcaddon**.
4. Edit the world → activate **Vultrom Behavior** (the resource pack is added with it). The pack descriptions should read **v0.1.5**.

## Source packs (dev)

| Folder | Role |
|--------|------|
| `Vultrom_BP/` | Behavior — blocks, item, script ore seeding, Jeweler entity, trades, bind script, find function |
| `Vultrom_RP/` | Resources — textures, entity look, lang |
| `art/` | Source art not loaded by the game (Mason's Jeweler profession overlay) |
| `tools/` | `build-dist.sh` (rebuild `dist/`), `bake_jeweler_skin.py` (rebuild the Jeweler skin) |

Rebuild downloads (names come from the manifest version: BP/RP `1.0.5` → `Vultrom-0.1.5.mcaddon`):

```bash
tools/build-dist.sh
```

After changing `art/jeweler-profession.png`, re-bake the Jeweler skin first (needs Pillow):

```bash
python3 tools/bake_jeweler_skin.py
```

## How to play

1. Mine **Sapphire Ore** → get **Raw Sapphire** (Fortune adds more; Silk Touch drops the ore block).
2. Place a **Gemstone Cutter**. Hold **Raw Sapphire** and right-click (tap) the cutter → **1 Raw Sapphire becomes 1 Sapphire**. **Sneak** + right-click cuts the **whole stack**. No menu, no recipe book.
3. Right-click the cutter with anything else (or an empty hand) with a villager within 5 blocks → that villager becomes its **Jeweler** (gold robe with a sapphire chain, “Jeweler” name tag). Each cutter employs one Jeweler — once it has one nearby, using the cutter converts nobody else. Chat confirms with **[Vultrom RP 1.0.5 loaded]** — if you see `vultrom.rp_check` instead, the resource pack is missing or out of date.
4. Right-click the Jeweler → sell **1 Sapphire for 40–80 emeralds**. The Jeweler lives like any villager: wanders, gathers at the bell, sleeps in a bed at night, flees zombies, opens doors, breeds and restocks.

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
| Sapphire | Gemstone Cutter: right-click with Raw Sapphire → 1 Sapphire (sneak: whole stack) |
| Gemstone Cutter | Interactive block via a script custom component (`vultrom:gemstone_cutter`, no UI) + Jeweler workstation via script (Bedrock has no custom vanilla professions) |
| Jeweler | Vanilla `villager_v2` behavior (Bedrock 1.21.50.7 sample) with one Jeweler profession — see below |
| Jeweler trade | 1 Sapphire → **40–80 emeralds** |

### Why not `feature_rules`?

Bedrock Wiki / creator docs: custom `features` + `feature_rules` need the **Custom Biomes** experiment (“Create custom biomes and change world generation”). That toggle is missing or removed on some Bedrock builds (e.g. Preview where custom biomes left experimental). Vultrom therefore seeds ore with `@minecraft/server` `setBlockType` instead.

### Textures

| Asset | Status |
|-------|--------|
| Sapphire ore block | Ore texture from the *Sapphires 1.16.5* Java pack by jacob (third-party, no license stated — check before wider release) |
| Sapphire gem item | “Bunch o' Gems” sapphire by Beatso & Zankor2 (third-party — check license before wider release) |
| Raw Sapphire item | **Placeholder** (dulled, stony sapphire) — Mason sending the real art |
| Jeweler look | Mason's gold-robe + sapphire-chain overlay (`art/jeweler-profession.png`) baked onto the plains villager → `textures/entity/vultrom/jeweler.png` |
| Gemstone Cutter block | Placeholder until Mason’s art |

### Jeweler fix (v0.1.3)

- **Script never ran:** v0.1.0–v0.1.2 pinned `@minecraft/server` **1.14.0**, where `world.afterEvents.playerInteractWithBlock` is beta-only. The script crashed on load, so the Gemstone Cutter, ore seeding and `find_sapphire` were all dead. Now **1.15.0** (first stable with it).
- **Render:** the Jeweler drew only through vanilla villager internals (`villager_v2` / `villager_v2_masked` materials, three layered controllers, vanilla geometry). It now uses its own geometry (`geometry.vultrom.jeweler`), `entity_alphatest`, one render controller and one baked texture — the standard custom-mob setup.
- Spawns the Jeweler **before** removing the villager, so a failed spawn never deletes the villager.

### v0.1.4

- **Sapphire Ore never generated / missing from creative:** the block declared the 1.21.60-style group `minecraft:itemGroup.name.ore` while using `format_version` 1.21.40, where groups are un-namespaced. Now `itemGroup.name.ore`. The script now reports in chat and the content log if the ore block isn't registered instead of failing silently.
- **Jeweler legs:** the walk animation's clock (`query.modified_distance_moved`) freezes when the Jeweler stops, so the legs froze mid-stride. The walk is now weighted by `query.modified_move_speed`, as vanilla villagers do; the bind pose is straight.

### v0.1.5

- **Gemstone Cutter:** the `minecraft:crafting_table` grid crafted nothing, so it's gone. Holding Raw Sapphire and right-clicking the cutter cuts one (sneak: the whole stack); sapphires go to your inventory, or drop at your feet if it's full.
- **Jeweler = vanilla villager:** `entities/jeweler.json` is Mojang's `villager_v2` behavior with `runtime_identifier: minecraft:villager_v2`, so it keeps the villager AI, gossip, schedules (wander, bell gathering, home, bed), sleeping, hiding from raids, fleeing zombies/illagers, door opening, 20 health, trade UI, cured discounts, witch/zombie-villager conversion and breeding. The 14 random professions are replaced by one Jeweler profession. Bedrock can't register a new job-site block, so the Jeweler restocks at the start of each work period instead of at a workstation. Babies are born as vanilla villagers.
- **Looks:** new Jeweler skin with a sapphire chain; new Sapphire Ore texture.
- **Downloads** are named with the version (`Vultrom-0.1.5.mcaddon`, `Vultrom_BP-0.1.5.mcpack`, `Vultrom_RP-0.1.5.mcpack`).
