"""Placeholder Raw Ruby and Ruby Scraps icons, derived from the ruby item texture.

Takes the shapes and shading of the Raw Sapphire / Sapphire Scraps placeholders and
recolors them with the ruby icon's hue and saturation, so both gem families look alike.
Requires Pillow. Run from the repo root:

    python3 tools/make_ruby_placeholders.py
"""
import colorsys
import math

from PIL import Image

ITEMS = "Vultrom_RP/textures/items/"


def opaque_hsv(path):
    im = Image.open(path).convert("RGBA")
    return [colorsys.rgb_to_hsv(r / 255, g / 255, b / 255) for r, g, b, a in im.getdata() if a > 0]


def circular_mean_hue(hsv):
    x = sum(math.cos(h * 2 * math.pi) * s for h, s, _ in hsv)
    y = sum(math.sin(h * 2 * math.pi) * s for h, s, _ in hsv)
    return (math.atan2(y, x) / (2 * math.pi)) % 1.0


sapphire = opaque_hsv(ITEMS + "sapphire.png")
ruby = opaque_hsv(ITEMS + "ruby.png")
ruby_hue = circular_mean_hue(ruby)
sat_scale = (sum(s for _, s, _ in ruby) / len(ruby)) / (sum(s for _, s, _ in sapphire) / len(sapphire))


def recolor(src, dst):
    im = Image.open(ITEMS + src).convert("RGBA")
    out = Image.new("RGBA", im.size)
    for xy in ((x, y) for y in range(im.height) for x in range(im.width)):
        r, g, b, a = im.getpixel(xy)
        if a == 0:
            continue
        _, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        nr, ng, nb = colorsys.hsv_to_rgb(ruby_hue, min(1.0, s * sat_scale), v)
        out.putpixel(xy, (round(nr * 255), round(ng * 255), round(nb * 255), a))
    out.save(ITEMS + dst)
    print("wrote", ITEMS + dst)


recolor("raw_sapphire.png", "raw_ruby.png")
recolor("sapphire_scraps.png", "ruby_scraps.png")
