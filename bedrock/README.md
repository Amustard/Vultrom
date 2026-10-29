# Vultrom Bedrock Addon

Sapphire ore + **Jeweler** trades for Minecraft Bedrock. Lives under `bedrock/` so the Java Fabric mod on `main` stays untouched.

## Packs

| Folder | Role |
|--------|------|
| `Vultrom_BP/` | Behavior: blocks, item, ore gen, Jeweler entity, trades, bind script |
| `Vultrom_RP/` | Resources: textures, entity look, lang |

## Install / test

1. Zip **each** pack separately (contents at zip root = `manifest.json` visible at top level), **or** copy the folders into:
   - Windows: `%localappdata%\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang\`
   - macOS (Minecraft Launcher / Preview): `~/Library/Application Support/mcpelauncher/games/com.mojang/` (or your launcher’s `com.mojang`)
   - Put BP in `development_behavior_packs/Vultrom_BP`
   - Put RP in `development_resource_packs/Vultrom_RP`
2. Create/edit a world → **Experiments**: enable **Custom Biomes** / Creation of Custom Biomes (needed for ore feature rules).
3. Activate **both** Vultrom Behavior + Vultrom Resources.
4. New chunks (or a new world) for sapphire ore to generate.

Creative checks:

- `/give @s vultrom:sapphire`
- `/give @s vultrom:sapphire_ore`
- `/give @s vultrom:gemstone_cutter`
- `/summon vultrom:jeweler` or spawn egg

## How Jeweler works

Bedrock addons **cannot** register a real vanilla profession/POI. Instead:

1. Place **Gemstone Cutter** near a normal villager (≤5 blocks).
2. **Right-click the cutter** → villager is replaced by a **Jeweler** (gold robe + sapphire chest overlay).
3. Right-click the Jeweler → trade **1 Sapphire → 40–80 emeralds** (random per trade roll).

## Content details

| Feature | Detail |
|---------|--------|
| Sapphire Ore | Pretty rare: **2 veins/chunk**, **3 blocks/vein**, Y **-48…32**, stone/deepslate |
| Sapphire | Drops from ore (loot table) |
| Gemstone Cutter | Workstation block; bind interaction via script |
| Jeweler trade | Buys 1 Sapphire for **40–80 emeralds** |

## Textures — final vs placeholder

| Asset | Status |
|-------|--------|
| `sapphire_ore.png` | **Final** (Mason) |
| `sapphire.png` item | **Final** (Mason gem JPG → 16×16 PNG) |
| `jeweler` profession overlay | **Final** (Mason) — see below |
| Gemstone Cutter block | **Placeholder** teal table — Mason still painting |

### Jeweler profession overlay

Mason’s `jeweler-profession.png` (64×64, gold robes + sapphire chest) is installed as a **profession overlay**, not a base skin:

- Official Bedrock path used: `Vultrom_RP/textures/entity/villager2/professions/jeweler.png`
- Mirror copy: `textures/entity/villager/profession/jeweler.png` (Java-style path, unused by Bedrock runtime)
- Client entity layers: vanilla `villager2` base + plains biome + **jeweler** overlay via custom render controllers

**UV check:** Texture is mostly transparent with clothing in the body/arm/leg bands (head band empty — normal for no-hat professions). Occupancy matches Bedrock `villager2/professions` overlay layout; **no UV remapping** was required. If something looks off in-game, swap the PNG in place — same filename.

## Packing for sharing

```bash
cd bedrock
(cd Vultrom_BP && zip -r ../Vultrom_BP.mcpack .)
(cd Vultrom_RP && zip -r ../Vultrom_RP.mcpack .)
# Optional: zip both .mcpack into a .mcaddon
```

Double-click `.mcpack` / `.mcaddon` on a device with Minecraft Bedrock to import.
