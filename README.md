# Vultrom (Bedrock)

Minecraft **Bedrock** addon: rare **Sapphire** ore, **Gemstone Cutter** workstation, and **Jeweler** trades.

> Java Fabric (Security Guards, Camera, Trader Desk) lives on the [`java`](https://github.com/Amustard/Vultrom/tree/java) branch — including playable `dist/` jars.

## Packs

| Folder | Role |
|--------|------|
| `Vultrom_BP/` | Behavior — blocks, item, ore gen, Jeweler entity, trades, bind script |
| `Vultrom_RP/` | Resources — textures, entity look, lang |

## Install / test

1. Copy into your `com.mojang` folder:
   - `development_behavior_packs/Vultrom_BP`
   - `development_resource_packs/Vultrom_RP`  
   Or zip each pack (with `manifest.json` at the zip root) as `.mcpack` / both as `.mcaddon`.
2. World → **Experiments**: enable **Custom Biomes** (needed for ore feature rules).
3. Activate **both** Vultrom Behavior + Vultrom Resources.
4. Explore **new chunks** (or a new world) for sapphire ore.

Creative checks:

```
/give @s vultrom:sapphire
/give @s vultrom:sapphire_ore
/give @s vultrom:gemstone_cutter
/summon vultrom:jeweler
```

## How to play

1. Mine **Sapphire Ore** → get **Sapphire**.
2. Place **Gemstone Cutter** near a normal villager (≤5 blocks).
3. **Right-click the cutter** → villager becomes a **Jeweler**.
4. Right-click the Jeweler → sell **1 Sapphire for 40–80 emeralds**.

## Details

| Feature | Detail |
|---------|--------|
| Sapphire Ore | Rare: **2 veins/chunk**, **3 blocks/vein**, Y **-48…32**, stone/deepslate |
| Sapphire | Ore drop (loot table) |
| Gemstone Cutter | Workstation; bind via script (Bedrock has no custom vanilla professions) |
| Jeweler trade | 1 Sapphire → **40–80 emeralds** |

### Textures

| Asset | Status |
|-------|--------|
| Sapphire ore / gem | Final (Mason) |
| Jeweler profession overlay | Final (Mason) — `textures/entity/villager2/professions/jeweler.png` |
| Gemstone Cutter block | Placeholder until Mason’s art |

## Pack for sharing

```bash
(cd Vultrom_BP && zip -r ../Vultrom_BP.mcpack .)
(cd Vultrom_RP && zip -r ../Vultrom_RP.mcpack .)
```
