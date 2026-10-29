# Vultrom (Bedrock)

Minecraft **Bedrock** addon: rare **Sapphire** ore, **Gemstone Cutter** workstation, and **Jeweler** trades.

> Java Fabric (Security Guards, Camera, Trader Desk) lives on the [`java`](https://github.com/Amustard/Vultrom/tree/java) branch — including playable `dist/` jars.

## Download (easiest)

| File | Link |
|------|------|
| **All-in-one** | [Vultrom.mcaddon](https://github.com/Amustard/Vultrom/raw/main/dist/Vultrom.mcaddon) |
| Behavior pack | [Vultrom_BP.mcpack](https://github.com/Amustard/Vultrom/raw/main/dist/Vultrom_BP.mcpack) |
| Resource pack | [Vultrom_RP.mcpack](https://github.com/Amustard/Vultrom/raw/main/dist/Vultrom_RP.mcpack) |

Also listed under [`dist/`](./dist/) and GitHub Release **[v0.1.3-bedrock](https://github.com/Amustard/Vultrom/releases/tag/v0.1.3-bedrock)**.

### Install

Requires Minecraft Bedrock **1.21.50 or newer**.

1. Download **Vultrom.mcaddon** (or both `.mcpack` files).
2. **Double-click** to import into Minecraft Bedrock.
3. Create or edit a world → **Resource Packs** + **Behavior Packs** → activate **both** Vultrom packs.
4. **No experiments required** — sapphire ore is placed by Script API (not `feature_rules`).
5. Play and explore — ore seeds into loaded Overworld chunks around you (Y **-48…32**, stone/deepslate). Existing explored areas get ore as you re-enter them.

### Upgrading from v0.1.0–v0.1.2

Bedrock can keep loading an old copy of a pack, so remove the old ones before importing:

1. Close the world. **Settings → Storage** (or *Global Resources / My Packs*) → delete **every** “Vultrom Behavior” and “Vultrom Resources” entry.
2. Edit the world → **Behavior Packs** and **Resource Packs** → deactivate any Vultrom pack still listed under *Active*.
3. Fully quit Minecraft, reopen, then import the new **Vultrom.mcaddon**.
4. Edit the world → activate **Vultrom Behavior** (the resource pack is added with it). The pack descriptions should read **v0.1.3**.

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

1. Mine **Sapphire Ore** → get **Sapphire**.
2. Place **Gemstone Cutter** near a normal villager (≤5 blocks).
3. **Right-click the cutter** → villager becomes a **Jeweler** (gold robe, always-visible “Jeweler” nametag). Chat confirms with **[Vultrom RP 1.0.3 loaded]** — if you see `vultrom.rp_check` instead, the resource pack is missing or out of date.
4. Right-click the Jeweler → sell **1 Sapphire for 40–80 emeralds**.

### Find nearest Sapphire Ore

Cheats / commands enabled:

```
/function vultrom/find_sapphire
```

Or type `!findsapphire` in chat — this shortcut only works with the **Beta APIs** experiment on.

Reports coordinates and distance. (`/locate` cannot find custom ore blocks.)

## Details

| Feature | Detail |
|---------|--------|
| Sapphire Ore | Rare: **2 veins/chunk**, **3 blocks/vein**, Y **-48…32**, stone/deepslate — script-seeded, no Custom Biomes experiment |
| Sapphire | Ore drop (loot table) |
| Gemstone Cutter | Workstation; bind via script (Bedrock has no custom vanilla professions) |
| Jeweler trade | 1 Sapphire → **40–80 emeralds** |

### Why not `feature_rules`?

Bedrock Wiki / creator docs: custom `features` + `feature_rules` need the **Custom Biomes** experiment (“Create custom biomes and change world generation”). That toggle is missing or removed on some Bedrock builds (e.g. Preview where custom biomes left experimental). Vultrom therefore seeds ore with `@minecraft/server` `setBlockType` instead.

### Textures

| Asset | Status |
|-------|--------|
| Sapphire ore block | Final (Mason) |
| Sapphire gem item | “Bunch o' Gems” sapphire by Beatso & Zankor2 (third-party — check license before wider release) |
| Jeweler look | Mason's gold-robe overlay (`art/jeweler-profession.png`) baked onto the plains villager → `textures/entity/vultrom/jeweler.png` |
| Gemstone Cutter block | Placeholder until Mason’s art |

### Jeweler fix (v0.1.3)

- **Script never ran:** v0.1.0–v0.1.2 pinned `@minecraft/server` **1.14.0**, where `world.afterEvents.playerInteractWithBlock` is beta-only. The script crashed on load, so the Gemstone Cutter, ore seeding and `find_sapphire` were all dead. Now **1.15.0** (first stable with it).
- **Render:** the Jeweler drew only through vanilla villager internals (`villager_v2` / `villager_v2_masked` materials, three layered controllers, vanilla geometry). It now uses its own geometry (`geometry.vultrom.jeweler`), `entity_alphatest`, one render controller and one baked texture — the standard custom-mob setup.
- Spawns the Jeweler **before** removing the villager, so a failed spawn never deletes the villager.
