# Vultrom (Bedrock)

Minecraft **Bedrock** addon: rare **Sapphire** and **Ruby** ore, **Gemstone Cutter** workstation, and **Jeweler** trades (sapphires and rubies).

> Java Fabric (Security Guards, Camera, Trader Desk) lives on the [`java`](https://github.com/Amustard/Vultrom/tree/java) branch — including playable `dist/` jars.

## Download (easiest)

| File | Link |
|------|------|
| **All-in-one** | [Vultrom-0.1.8.mcaddon](https://github.com/Amustard/Vultrom/raw/main/dist/Vultrom-0.1.8.mcaddon) |
| Behavior pack | [Vultrom_BP-0.1.8.mcpack](https://github.com/Amustard/Vultrom/raw/main/dist/Vultrom_BP-0.1.8.mcpack) |
| Resource pack | [Vultrom_RP-0.1.8.mcpack](https://github.com/Amustard/Vultrom/raw/main/dist/Vultrom_RP-0.1.8.mcpack) |

Also listed under [`dist/`](./dist/) and GitHub Release **[v0.1.8-bedrock](https://github.com/Amustard/Vultrom/releases/tag/v0.1.8-bedrock)**. From 0.1.6 on, file names carry the version.

### Install

Requires Minecraft Bedrock **1.21.50 or newer**.

1. Download **Vultrom-0.1.8.mcaddon** (or both `.mcpack` files).
2. **Double-click** to import into Minecraft Bedrock.
3. Create or edit a world → **Resource Packs** + **Behavior Packs** → activate **both** Vultrom packs.
4. **No experiments required** — sapphire and ruby ore are placed by Script API (not `feature_rules`).
5. Play and explore — ore seeds into loaded Overworld chunks around you (Y **-48…32**, stone/deepslate). Existing explored areas get ore as you re-enter them.

### Upgrading from an older Vultrom

Bedrock can keep loading an old copy of a pack, so remove the old ones before importing:

1. Close the world. **Settings → Storage** (or *Global Resources / My Packs*) → delete **every** “Vultrom Behavior” and “Vultrom Resources” entry.
2. Edit the world → **Behavior Packs** and **Resource Packs** → deactivate any Vultrom pack still listed under *Active*.
3. Fully quit Minecraft, reopen, then import the new **Vultrom-0.1.8.mcaddon**.
4. Edit the world → activate **Vultrom Behavior** (the resource pack is added with it). The pack descriptions should read **v0.1.8**.

## Source packs (dev)

| Folder | Role |
|--------|------|
| `Vultrom_BP/` | Behavior — blocks, item, script ore seeding, Jeweler entity, trades, bind script, find function |
| `Vultrom_RP/` | Resources — textures, entity look, lang |
| `art/` | Source art not loaded by the game (Mason's Jeweler profession overlay) |
| `tools/` | `build-dist.sh` (rebuild `dist/`), `bake_jeweler_skin.py` (rebuild the Jeweler skin), `make_ruby_placeholders.py` (Raw Ruby / Ruby Scraps art), `mock-test.mjs` (runs the script against a mock `@minecraft/server`: `node tools/mock-test.mjs`) |

Rebuild downloads (names come from the manifest version: BP/RP `1.0.8` → `Vultrom-0.1.8.mcaddon`):

```bash
tools/build-dist.sh
```

After changing `art/jeweler-profession.png`, re-bake the Jeweler skin first (needs Pillow):

```bash
python3 tools/bake_jeweler_skin.py
```

## How to play

1. Mine **Sapphire Ore**, **Ruby Ore** or **Deepslate Ruby Ore** with a **diamond or netherite pickaxe** → get **Raw Sapphire** / **Raw Ruby** (Fortune adds more; Silk Touch drops the ore block). Any other pickaxe, tool or bare hand only gets **Sapphire Scraps** / **Ruby Scraps** — worthless ("Sad to look at"). Every tool takes the same time: about 3 s (Deepslate Ruby Ore about 4.5 s).
2. Craft a **Gemstone Cutter** (a gold stonecutter) at a crafting table: 1 diamond on top, 3 gold ingots in the middle row, 3 stone on the bottom row. Place it; it turns to face you. Hold **Raw Sapphire** or **Raw Ruby** and right-click (tap) the cutter → **1 raw gem becomes 1 Sapphire / Ruby**. **Sneak** + right-click cuts the **whole stack**. No menu, no recipe book. Clicking it with anything else shows a hint on the action bar.
3. Right-click the cutter with anything else (or an empty hand) with a villager within 5 blocks → that villager becomes its **Jeweler** (gold robe, “Jeweler” name tag). Each cutter employs one Jeweler — once it has one nearby, using the cutter converts nobody else. Chat confirms with **[Vultrom RP 1.0.8 loaded]** — if you see `vultrom.rp_check` instead, the resource pack is missing or out of date.
4. Right-click the Jeweler → sell **1 Sapphire for 40–80 emeralds**. After two sapphire sales he levels up and also buys **1 Ruby for 50–90 emeralds** Once you sell him a Sapphire or a Ruby he holds that gem in front of his crossed arms (whichever was sold last), and when you close the trade screen he celebrates for about 8 seconds: hops and runs around, cheers, sparkles green and holds the gem up. The Jeweler lives like any villager: wanders, gathers at the bell, sleeps in a bed at night, flees zombies, opens doors, breeds and restocks.

Creative: **Sapphire Ore**, **Ruby Ore** and **Deepslate Ruby Ore** are in the **Nature** tab inside the **Ores** group.

### Find nearest Sapphire / Ruby Ore

Cheats / commands enabled:

```
/function vultrom/find_sapphire
/function vultrom/find_ruby
```

Or type `!findsapphire` / `!findruby` in chat — this shortcut only works with the **Beta APIs** experiment on.

Searches loaded chunks up to **192 blocks** away and reports coordinates and distance. (`/locate` cannot find custom ore blocks.)

## Details

| Feature | Detail |
|---------|--------|
| Mining time | Block data only: `seconds_to_destroy` (hardness) **2.0** on Sapphire and Ruby Ore, **3.0** on Deepslate Ruby Ore, and no tool tag, so every tool mines at hand speed: about **3 s** / **4.5 s** with anything (custom blocks break in hardness × 1.5 s). Efficiency doesn't help; Haste does. The tier tags (`minecraft:diamond_tier_destructible`) are informational only and give no wrong-tier slowdown, and per-tool hardness (`item_specific_speeds`) needs an experiment |
| Sapphire Ore | **5 veins/chunk**, **3 blocks/vein**, Y **-48…32**, replaces stone/deepslate/granite/diorite/andesite/tuff — script-seeded within 4 chunks of each player, no Custom Biomes experiment |
| Ruby Ore / Deepslate Ruby Ore | Same seeding as sapphire (5 veins/chunk, 3 blocks/vein, Y -48…32) on its own vein pattern; Deepslate Ruby Ore where the host block is deepslate or tuff, Ruby Ore elsewhere. Sapphire veins are unchanged |
| Raw Sapphire / Raw Ruby | Ore drop only with a diamond/netherite pickaxe (loot table `match_tool`); Fortune bonus via script (vanilla ore formula); Silk Touch drops the ore |
| Sapphire / Ruby | Gemstone Cutter: right-click with the raw gem → 1 gem (sneak: whole stack) |
| Gemstone Cutter | Gold stonecutter: 16×9×16 base plus a double-sided saw blade (`geometry.vultrom.gemstone_cutter`, alpha test), faces the player when placed (`minecraft:placement_direction` + `minecraft:transformation`). Pickaxe, hardness 3.5 like the vanilla stonecutter. Recipe `recipes/gemstone_cutter.json`: diamond / 3 gold ingots / 3 stone. Clicks handled by `beforeEvents.playerInteractWithBlock` (no UI) + Jeweler workstation via script (Bedrock has no custom vanilla professions) |
| Jeweler | Vanilla `villager_v2` behavior (Bedrock 1.21.50.7 sample) with one Jeweler profession — see below |
| Jeweler trades | Tier 1: buys 1 Sapphire → **40–80 emeralds**. Tier 2 (10 trader XP = two sapphire sales): buys 1 **Ruby** → **50–90 emeralds**. Prices live in `Vultrom_BP/trading/jeweler_trades.json` (`quantity`, `max_uses`, `total_exp_required`) |
| Sapphire / Ruby Scraps | Dropped by the ore when not mined with a diamond/netherite pickaxe; no use |

### Why not `feature_rules`?

Bedrock Wiki / creator docs: custom `features` + `feature_rules` need the **Custom Biomes** experiment (“Create custom biomes and change world generation”). That toggle is missing or removed on some Bedrock builds (e.g. Preview where custom biomes left experimental). Vultrom therefore seeds ore with `@minecraft/server` `setBlockType` instead.

### Textures

| Asset | Status |
|-------|--------|
| Sapphire ore block | Ore texture from the *Sapphires 1.16.5* Java pack by jacob (third-party, no license stated — check before wider release) |
| Sapphire gem item | “Bunch o' Gems” sapphire by Beatso & Zankor2 (third-party — check license before wider release) |
| Raw Sapphire item | **Placeholder** (dulled, stony sapphire) — Mason sending the real art |
| Sapphire Scraps item | **Placeholder** (three dull sapphire shards) |
| Ruby item | “Bunch o' Gems” ruby by Beatso & Zankor2 (third-party — check license before wider release) |
| Ruby Ore / Deepslate Ruby Ore blocks | *Ruby Resource Pack* by Alex PNG (its emerald ore retextures; third-party — check license before wider release) |
| Raw Ruby / Ruby Scraps items | **Placeholder**: the Raw Sapphire / Sapphire Scraps art recolored with the ruby icon's hue (`tools/make_ruby_placeholders.py`) |
| Jeweler look | Mason's v3 Jeweler overlay (`art/jeweler-profession.png`, from `media/jeweler-skin-v3.png`) baked onto the plains villager → `textures/entity/vultrom/jeweler.png` (64×128: skin on top, the sapphire and ruby icons he holds after a sale below) |
| Gemstone Cutter block | Mason's gold stonecutter textures (`media/gold-gemstone-cutter-textures.zip` → `textures/blocks/gemstone_cutter_{top,side,bottom,saw}.png`). The 9-pixel base shows the bottom 9 rows of the side texture and the blade shows the top 7 rows of the saw, as vanilla does |

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

### v0.1.6

- **Gemstone Cutter plain click:** in 0.1.5 the cutter was an interactive block (script custom component), so a plain right-click ran the block interaction, which didn't reach the script on Mason's game; only sneak-clicks cut. The cutter is no longer an interactive block: every click goes through `beforeEvents.playerInteractWithBlock`, which cancels the default action unless you sneak-place a block against it.
- **Jeweler sounds:** new `Vultrom_RP/sounds.json` maps the vanilla villager sounds (idle, hurt, death, haggle, yes/no; celebrate uses “yes” — Bedrock villagers have no celebrate sound) for `vultrom:jeweler`.
- **Held sapphire after a sale:** bone `trade_sapphire` on the crossed arms, shown while the synced entity property `vultrom:holds_sapphire` is true. Bedrock has no trade event, so each player who opens the Jeweler's trade screen gets a script session that watches their Sapphire + Ruby and emerald counts; gems going down while emeralds go up counts as a sale. The screen counts as closed when that player moves or turns (the trade screen freezes both) or walks away.
- **Sale celebration:** after a sale, closing the trade screen starts an ~8 second outburst: component group `vultrom:sale_celebration` (fast `random_stroll`), script hops, `mob.villager.yes` cheers, `villager_happy` particles, and animation `animation.vultrom.jeweler.hold_up` (property `vultrom:celebrating`) raising the sapphire. Opening his trades again ends it early.
- **Skin:** Mason's v3 Jeweler skin replaces the chain skin.
- **Sleeping pose:** the Jeweler now lies down in bed (vanilla `get_in_bed` animation) instead of standing in it.
- **Sapphire Ore drops:** Raw Sapphire only with a diamond/netherite pickaxe; everything else drops Sapphire Scraps. Mining speed follows vanilla diamond ore.
- **Ruby:** new item; the Jeweler buys it at trade tier 2 (no ruby ore yet).

### v0.1.7

- **Held gem:** the Jeweler holds whichever gem he was sold last, a Sapphire or a Ruby (int property `vultrom:held_gem`, bones `held_sapphire` / `held_ruby`). The gem now sits in front of his crossed arms, leaning forward, instead of inside his robe; a geometry check keeps it clear of his body, arms and nose in the trade and celebration poses.
- **Sapphire Ore mining:** custom blocks skip the vanilla wrong-tool penalty and `item_specific_speeds` needs an experiment, so every pickaxe broke the ore almost instantly. The script now applies Mining Fatigue I while you mine it without a diamond/netherite pickaxe.
- **Gemstone Cutter:** now a gold stonecutter (Mason's textures, vanilla stonecutter shape) that faces you when placed, with a crafting recipe. Same block id and behavior; it is now mined with a pickaxe.

### v0.1.8

- **Ore mining time, no Mining Fatigue:** the v0.1.7 Mining Fatigue is gone. Bedrock's tier tags give custom blocks no wrong-tier slowdown, so the ores use a fixed hardness instead: about 3 s with any tool (Deepslate Ruby Ore about 4.5 s).
- **Ruby Ore:** `vultrom:ruby_ore` and `vultrom:deepslate_ruby_ore`, mirroring sapphire: Raw Ruby with a diamond/netherite pickaxe (Fortune, Silk Touch), Ruby Scraps otherwise, Raw Ruby → Ruby at the Gemstone Cutter, script seeding at sapphire's rarity, `/function vultrom/find_ruby`. The Ruby item and the Jeweler's ruby trade are unchanged.
- **Jeweler stood still after a sale:** removing a component group deletes every component it defines, so ending the celebration (which overrides `minecraft:behavior.random_stroll`) also deleted his normal wander goal. The normal stroll is now also defined in group `vultrom:wander`; the celebration swaps it out and `vultrom:stop_sale_celebration` puts it back and restarts his schedule, which re-applies the current work/gather/home/bed group. The script runs that reset when a celebration ends, once for every Jeweler after a world loads (which also fixes Jewelers already stuck in v0.1.6–0.1.7), and whenever the celebrating flag is stale; the held gem resets with it.
