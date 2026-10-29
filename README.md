# Vultrom (Bedrock)

Minecraft **Bedrock** addon: rare **Sapphire** ore, **Gemstone Cutter** workstation, and **Jeweler** trades.

> Java Fabric (Security Guards, Camera, Trader Desk) lives on the [`java`](https://github.com/Amustard/Vultrom/tree/java) branch — including playable `dist/` jars.

## Download (easiest)

| File | Link |
|------|------|
| **All-in-one** | [Vultrom.mcaddon](https://github.com/Amustard/Vultrom/raw/main/dist/Vultrom.mcaddon) |
| Behavior pack | [Vultrom_BP.mcpack](https://github.com/Amustard/Vultrom/raw/main/dist/Vultrom_BP.mcpack) |
| Resource pack | [Vultrom_RP.mcpack](https://github.com/Amustard/Vultrom/raw/main/dist/Vultrom_RP.mcpack) |

Also listed under [`dist/`](./dist/) and GitHub Release **[v0.1.2-bedrock](https://github.com/Amustard/Vultrom/releases/tag/v0.1.2-bedrock)**.

### Install

1. Download **Vultrom.mcaddon** (or both `.mcpack` files).
2. **Double-click** to import into Minecraft Bedrock.
3. Create or edit a world → **Resource Packs** + **Behavior Packs** → activate **both** Vultrom packs.
4. **No experiments required** — sapphire ore is placed by Script API (not `feature_rules`).
5. Play and explore — ore seeds into loaded Overworld chunks around you (Y **-48…32**, stone/deepslate). Existing explored areas get ore as you re-enter them.

## Source packs (dev)

| Folder | Role |
|--------|------|
| `Vultrom_BP/` | Behavior — blocks, item, script ore seeding, Jeweler entity, trades, bind script, find function |
| `Vultrom_RP/` | Resources — textures, entity look, lang |

Rebuild downloads:

```bash
(cd Vultrom_BP && zip -r -X ../dist/Vultrom_BP.mcpack .)
(cd Vultrom_RP && zip -r -X ../dist/Vultrom_RP.mcpack .)
(cd dist && zip -X Vultrom.mcaddon Vultrom_BP.mcpack Vultrom_RP.mcpack)
```

## How to play

1. Mine **Sapphire Ore** → get **Sapphire**.
2. Place **Gemstone Cutter** near a normal villager (≤5 blocks).
3. **Right-click the cutter** → villager becomes a **Jeweler** (visible gold-robe outfit).
4. Right-click the Jeweler → sell **1 Sapphire for 40–80 emeralds**.

### Find nearest Sapphire Ore

Cheats / commands enabled:

```
/function vultrom/find_sapphire
```

Or type in chat (no slash needed):

```
!findsapphire
```

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
| Sapphire gem item | **Placeholder** — Mason replacing later |
| Jeweler profession overlay | Final (Mason) |
| Gemstone Cutter block | Placeholder until Mason’s art |
