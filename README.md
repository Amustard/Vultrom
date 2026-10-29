# Vultrom (Bedrock)

Minecraft **Bedrock** addon: rare **Sapphire** ore, **Gemstone Cutter** workstation, and **Jeweler** trades.

> Java Fabric (Security Guards, Camera, Trader Desk) lives on the [`java`](https://github.com/Amustard/Vultrom/tree/java) branch — including playable `dist/` jars.

## Download (easiest)

| File | Link |
|------|------|
| **All-in-one** | [Vultrom.mcaddon](https://github.com/Amustard/Vultrom/raw/main/dist/Vultrom.mcaddon) |
| Behavior pack | [Vultrom_BP.mcpack](https://github.com/Amustard/Vultrom/raw/main/dist/Vultrom_BP.mcpack) |
| Resource pack | [Vultrom_RP.mcpack](https://github.com/Amustard/Vultrom/raw/main/dist/Vultrom_RP.mcpack) |

Also listed under [`dist/`](./dist/).

### Install

1. Download **Vultrom.mcaddon** (or both `.mcpack` files).
2. **Double-click** to import into Minecraft Bedrock.
3. Create or edit a world → **Resource Packs** + **Behavior Packs** → activate **both** Vultrom packs.
4. **Experiments** → enable **Custom Biomes** (required for sapphire ore generation).
5. Play — mine in **new chunks** (or a new world) to find Sapphire Ore.

## Source packs (dev)

| Folder | Role |
|--------|------|
| `Vultrom_BP/` | Behavior — blocks, item, ore gen, Jeweler entity, trades, bind script |
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
| Jeweler profession overlay | Final (Mason) |
| Gemstone Cutter block | Placeholder until Mason’s art |
