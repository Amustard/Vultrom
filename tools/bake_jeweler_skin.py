"""Bake the Jeweler skin: vanilla villager base + plains clothing + art/jeweler-profession.png.

Writes Vultrom_RP/textures/entity/vultrom/jeweler.png: the 64x64 villager_v2 UV layout on
top, and the sapphire item icon at (0, 64) below it for the "trade_sapphire" bone the
Jeweler shows while trading (64x128 total). Requires Pillow. Run from the repo root:

    python3 tools/bake_jeweler_skin.py
"""
import io
import urllib.request

from PIL import Image

VANILLA = "https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack/textures/entity/villager2/"


def fetch(path):
    with urllib.request.urlopen(VANILLA + path) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGBA")


base = fetch("villager.png")
clothes = fetch("biomes/biome_plains.png")
outfit = Image.open("art/jeweler-profession.png").convert("RGBA")
sapphire = Image.open("Vultrom_RP/textures/items/sapphire.png").convert("RGBA")

skin = Image.new("RGBA", (64, 128))
skin.paste(Image.alpha_composite(base, Image.alpha_composite(clothes, outfit)), (0, 0))
skin.paste(sapphire, (0, 64))
skin.save("Vultrom_RP/textures/entity/vultrom/jeweler.png")
print("wrote Vultrom_RP/textures/entity/vultrom/jeweler.png")
