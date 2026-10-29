"""Bake the Jeweler skin: vanilla villager base + plains clothing + art/jeweler-profession.png.

Writes Vultrom_RP/textures/entity/vultrom/jeweler.png (one 64x64 texture on the
villager_v2 UV layout). Requires Pillow. Run from the repo root:

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

skin = Image.alpha_composite(base, Image.alpha_composite(clothes, outfit))
skin.save("Vultrom_RP/textures/entity/vultrom/jeweler.png")
print("wrote Vultrom_RP/textures/entity/vultrom/jeweler.png")
