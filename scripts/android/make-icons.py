#!/usr/bin/env python3
"""Draws the PsalmsPlayer app icon (two beamed eighth notes, accent blue on dark navy) and writes every size the Android app and the
Google Play listing need. Run it by hand when the icon changes; the PNGs it writes are committed:

    pip install pillow && python3 scripts/android/make-icons.py

Writes native/android/app/src/main/res/mipmap-*/ic_launcher*.png and docs/play-store/{icon-512.png,feature-graphic-1024x500.png}.
The mark is original artwork for this project (it is not a logo from anywhere else).
"""
import math
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RES = os.path.join(ROOT, 'native', 'android', 'app', 'src', 'main', 'res')
STORE = os.path.join(ROOT, 'docs', 'play-store')

BG = (16, 20, 43, 255)        # dark navy, the icon's background (also res/values/ic_launcher_background.xml)
ACCENT = (159, 177, 255, 255)  # the site's accent colour #9FB1FF
SS = 4                         # supersampling for smooth edges


def ellipse_points(cx, cy, rx, ry, deg, n=72):
    a = math.radians(deg)
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x, y = rx * math.cos(t), ry * math.sin(t)
        pts.append((cx + x * math.cos(a) + y * math.sin(a), cy - x * math.sin(a) + y * math.cos(a)))
    return pts


def mark(px, fraction):
    """The notes on a transparent square of px pixels; the drawing fills `fraction` of the width (0..1)."""
    big = px * SS
    img = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Design space: 100 units wide, notes occupy x 22..80, y 16..80 -> centre (51, 48).
    box = 64.0  # the drawing is about 64 units tall; scale so it fills `fraction` of the canvas height
    k = big * fraction / box
    ox, oy = big / 2 - 51 * k, big / 2 - 48 * k

    def P(x, y):
        return (ox + x * k, oy + y * k)

    # stems and beam
    d.rectangle([P(41, 24), P(46.5, 68)], fill=ACCENT)
    d.rectangle([P(75, 16), P(80.5, 60)], fill=ACCENT)
    d.polygon([P(41, 22.5), P(80.5, 14.5), P(80.5, 25.5), P(41, 33.5)], fill=ACCENT)
    # heads
    for cx, cy in ((34, 71), (68.5, 63)):
        d.polygon([P(x, y) for x, y in ellipse_points(cx, cy, 12.5, 8.8, 22)], fill=ACCENT)
    return img.resize((px, px), Image.LANCZOS)


def square_icon(px, radius_fraction):
    big = px * SS
    base = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    if radius_fraction >= 0.5:
        d.ellipse([0, 0, big - 1, big - 1], fill=BG)
    else:
        d.rounded_rectangle([0, 0, big - 1, big - 1], radius=int(big * radius_fraction), fill=BG)
    base = base.resize((px, px), Image.LANCZOS)
    base.alpha_composite(mark(px, 0.56))
    return base


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)


# Android launcher icons. Legacy icons are 48dp, the adaptive foreground is a 108dp canvas whose middle 66dp is always visible.
DENSITY = {'mdpi': 1.0, 'hdpi': 1.5, 'xhdpi': 2.0, 'xxhdpi': 3.0, 'xxxhdpi': 4.0}
for name, d in DENSITY.items():
    folder = os.path.join(RES, f'mipmap-{name}')
    save(square_icon(round(48 * d), 0.18), os.path.join(folder, 'ic_launcher.png'))
    save(square_icon(round(48 * d), 0.5), os.path.join(folder, 'ic_launcher_round.png'))
    save(mark(round(108 * d), 0.40), os.path.join(folder, 'ic_launcher_foreground.png'))

# Google Play listing
save(square_icon(512, 0.0).convert('RGBA'), os.path.join(STORE, 'icon-512.png'))

W, H = 1024, 500
fg = Image.new('RGBA', (W * SS, H * SS), BG)
fg = fg.resize((W, H), Image.LANCZOS)
fg.alpha_composite(mark(330, 0.80), (80, 85))
dr = ImageDraw.Draw(fg)
bold = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
reg = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
try:
    f1, f2 = ImageFont.truetype(bold, 66), ImageFont.truetype(reg, 30)
except OSError:
    f1 = f2 = ImageFont.load_default()
assert dr.textlength('PsalmsPlayer', font=f1) < W - 450 - 40, 'title does not fit'
dr.text((450, 168), 'PsalmsPlayer', font=f1, fill=(255, 255, 255, 255))
dr.text((454, 266), 'Songs, lyrics and chords', font=f2, fill=ACCENT)
dr.text((454, 308), 'for the Christian community', font=f2, fill=ACCENT)
save(fg.convert('RGB'), os.path.join(STORE, 'feature-graphic-1024x500.png'))
print('icons written')
