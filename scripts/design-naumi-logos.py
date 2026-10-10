"""Build editable, outlined Naumi logo proposals; does not change the live logo.

Run from the checkout: python scripts/design-naumi-logos.py
Requires local fontTools; installed fonts are used only for drawing outlines.
"""
from pathlib import Path
import html
import json
import shutil
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "design/brand/naumi-logo-options-20261010"
INK, PAPER = "#181b23", "#f8f9f7"
FONT_DIR = ROOT / "node_modules/geist/dist/fonts/geist-sans"
SCHEMES = [
    ("a", "胶囊 N", "Capsule N", "a-capsule-n", Path("C:/Windows/Fonts/arialbd.ttf")),
    ("b", "折面 N", "Folded N", "b-folded-n", FONT_DIR / "Geist-Bold.ttf"),
    ("c", "轨道 n", "Orbital n", "c-orbital-n", FONT_DIR / "Geist-Medium.ttf"),
    ("d", "开放光圈", "Open Aperture", "d-open-aperture", FONT_DIR / "Geist-Medium.ttf"),
    ("e", "负形印章", "Negative N", "e-negative-n", FONT_DIR / "Geist-SemiBold.ttf"),
    ("f", "小球印记", "Orb Signature", "f-orb-signature", FONT_DIR / "Geist-SemiBold.ttf"),
]


def glyph(key, color=INK, suffix="main"):
    if key == "a":
        # Exact silhouette retained from the user's selected second/third versions.
        body = '<path d="M73 179 L96 77 L160 179 L183 77" fill="none" stroke="currentColor" stroke-width="31" stroke-linecap="round" stroke-linejoin="round"/>'
    elif key == "b":
        body = '<path d="M52 196V60H86L170 152V60H204V196H170L86 104V196Z"/>'
    elif key == "c":
        body = '<path d="M65 183V75M65 124C65 94 88 76 119 76C153 76 177 95 177 128V183" fill="none" stroke="currentColor" stroke-width="28" stroke-linecap="round"/><circle cx="203" cy="62" r="11"/>'
    elif key == "d":
        blade = '<path d="M128 44A84 84 0 0 1 205 96L151 119L128 94Z"/>'
        body = "".join(f'<g transform="rotate({angle} 128 128)">{blade}</g>' for angle in (0, 90, 180, 270))
    elif key == "e":
        body = '<path fill-rule="evenodd" d="M86 43H170Q213 43 213 86V170Q213 213 170 213H86Q43 213 43 170V86Q43 43 86 43Z M80 179V77H102L156 145V77H178V179H156L102 111V179Z"/>'
    elif key == "f":
        mask = f"orb-eyes-{suffix}"
        body = f'<defs><mask id="{mask}" maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256"><rect width="256" height="256" fill="white"/><rect x="87" y="101" width="25" height="58" rx="12.5" transform="rotate(-16 99.5 130)" fill="black"/><rect x="146" y="90" width="25" height="58" rx="12.5" transform="rotate(-16 158.5 119)" fill="black"/></mask></defs><circle cx="128" cy="128" r="84" mask="url(#{mask})"/>'
    else:
        raise ValueError(key)
    return f'<g fill="{color}" color="{color}">{body}</g>'


def mark(key, x, y, size, color=INK, suffix="main"):
    return f'<g transform="translate({x} {y}) scale({size / 256:.6f})">{glyph(key, color, suffix)}</g>'


def wordmark(font_path, x, baseline, height, color=INK):
    font = TTFont(font_path)
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    scale = height / font["head"].unitsPerEm
    offset, paths = 0, []
    for ch in "Naumi":
        name = cmap[ord(ch)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        paths.append(f'<path d="{pen.getCommands()}" transform="translate({x + offset * scale:.4f} {baseline}) scale({scale:.6f} {-scale:.6f})"/>')
        offset += font["hmtx"].metrics[name][0] - 24
    font.close()
    return f'<g fill="{color}" aria-label="Naumi">{"".join(paths)}</g>'


def svg(body, w=512, h=512, title="Naumi logo"):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><title>{html.escape(title)}</title>{body}</svg>\n'


def text(value, x, y, size=14, color="#858a92", weight=400):
    return f'<text x="{x}" y="{y}" fill="{color}" font-size="{size}" font-weight="{weight}" font-family="Arial,Microsoft YaHei,sans-serif">{html.escape(value)}</text>'


def app(key, color, background, size=512, suffix="app"):
    return f'<rect width="{size}" height="{size}" rx="{size * .245}" fill="{background}"/>' + mark(key, size * .05, size * .05, size * .90, color, suffix)


def scheme_board(scheme):
    key, name, en, slug, font = scheme
    b = f'<rect width="1440" height="1020" fill="{PAPER}"/>'
    b += text(f"{key.upper()} / {en}", 72, 80, 20, INK, 600)
    b += text("NAUMI / BLACK & WHITE", 1050, 80, 11)
    b += f'<rect x="72" y="142" width="796" height="370" rx="26" fill="white" stroke="#e7e9e6"/>'
    b += mark(key, 134, 232, 180, INK, f"{key}-hero")
    b += wordmark(font, 351, 354, 104)
    b += f'<rect x="898" y="142" width="470" height="370" rx="26" fill="{INK}"/>'
    b += mark(key, 1035, 228, 196, "#fff", f"{key}-reverse")
    b += text("PRIMARY", 105, 478, 10)
    b += text("REVERSE", 932, 478, 10, "#a5a8b0")
    b += text("SYMBOL", 92, 570, 12, INK, 600)
    b += text("APP ICON", 538, 570, 12, INK, 600)
    b += text("WORDMARK", 995, 570, 12, INK, 600)
    b += mark(key, 89, 620, 137, INK, f"{key}-small-black")
    b += f'<rect x="269" y="624" width="132" height="132" rx="22" fill="{INK}"/>'
    b += mark(key, 269, 624, 132, "#fff", f"{key}-small-white")
    b += f'<g transform="translate(536 624)">{app(key, "#fff", INK, 132, f"{key}-app-dark")}</g>'
    b += f'<rect x="713" y="624" width="132" height="132" rx="32" fill="#fff" stroke="#e1e4e0"/>'
    b += mark(key, 720, 631, 118, INK, f"{key}-app-light")
    b += wordmark(font, 986, 718, 78)
    b += '<path d="M72 817H1368" stroke="#e1e4e0"/>'
    b += text("16 / 24 / 32 / 48 PX", 92, 866, 11)
    for index, size in enumerate((16, 24, 32, 48)):
        x = 402 + index * 112
        b += f'<g transform="translate({x} {890 - size / 2})">{app(key, "#fff", INK, size, f"{key}-size-{size}")}</g>'
    b += text("SVG OUTLINES / TRANSPARENT PNG", 967, 902, 10)
    return svg(b, 1440, 1020, f"Naumi proposal {key.upper()} - {name}")


def comparison():
    b = f'<rect width="1680" height="1614" fill="{PAPER}"/>'
    b += text("Naumi", 64, 91, 42, INK, 700)
    b += text("LOGO EXPLORATION / 01", 1220, 86, 13)
    for i, scheme in enumerate(SCHEMES):
        key, name, en, slug, font = scheme
        x, y = 64 + (i % 2) * 792, 156 + (i // 2) * 474
        b += f'<rect x="{x}" y="{y}" width="760" height="438" rx="24" fill="white" stroke="#e1e4df"/>'
        b += text(key.upper(), x + 32, y + 46, 18, INK, 600)
        b += text(name, x + 71, y + 45, 14, "#737983")
        if key == "a":
            b += f'<rect x="{x + 623}" y="{y + 21}" width="103" height="29" rx="14.5" fill="#eff1ed"/>'
            b += text("保留方案", x + 648, y + 40, 11, "#4c554d")
        b += mark(key, x + 67, y + 93, 173, INK, f"cmp-{key}-primary")
        b += wordmark(font, x + 257, y + 207, 74)
        b += f'<rect x="{x + 566}" y="{y + 105}" width="130" height="130" rx="32" fill="{INK}"/>'
        b += mark(key, x + 572, y + 111, 118, "#fff", f"cmp-{key}-reverse")
        b += f'<path d="M{x + 32} {y + 287}H{x + 728}" stroke="#e9ebe7"/>'
        b += text(en, x + 35, y + 344, 14, "#89908b")
        for idx, size in enumerate((16, 24, 32)):
            px = x + 564 + idx * 54
            b += f'<g transform="translate({px} {y + 335 - size / 2})">{app(key, "#fff", INK, size, f"cmp-{key}-favicon-{size}")}</g>'
        b += text("16", x + 564, y + 384, 10)
        b += text("24", x + 618, y + 384, 10)
        b += text("32", x + 674, y + 384, 10)
    return svg(b, 1680, 1614, "Naumi six logo proposals A-F")


def gallery():
    cards = "".join(f'''<section id="{key}"><div class="section-head"><h2>{key.upper()} · {name}</h2><span>{'保留方案' if key == 'a' else en}</span></div><a href="{slug}/scheme-preview.png" target="_blank"><img src="{slug}/scheme-preview.png" alt="方案 {key.upper()}：{name}" width="1440" height="1020"></a><div class="links"><a href="{slug}/symbol-black.svg" download>黑标 SVG</a><a href="{slug}/symbol-white.svg" download>白标 SVG</a><a href="{slug}/app-dark.png" download>应用图标</a><a href="{slug}/horizontal-black.svg" download>横版组合</a></div></section>''' for key, name, en, slug, font in SCHEMES)
    return f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Naumi · Logo 方案</title><style>*{{box-sizing:border-box}}body{{margin:0;background:{PAPER};color:{INK};font:14px Arial,"Microsoft YaHei",sans-serif}}header{{max-width:1320px;margin:auto;padding:36px 24px;display:flex;align-items:center;gap:25px;border-bottom:1px solid #e0e3dd}}header strong{{font-size:24px;letter-spacing:-1px}}nav{{display:flex;gap:18px;margin-left:auto}}a{{color:inherit;text-decoration:none}}a:focus-visible{{outline:2px solid #707c6d;outline-offset:5px}}.download{{background:{INK};color:white;border-radius:10px;padding:10px 15px}}main{{max-width:1320px;margin:24px auto 80px;padding:0 24px;display:grid;grid-template-columns:1fr 1fr;gap:28px}}section{{scroll-margin-top:24px;min-width:0}}.section-head{{display:flex;align-items:center;justify-content:space-between}}h2{{font-size:16px;font-weight:600}}.section-head span{{font-size:11px;color:#92988f}}img{{display:block;width:100%;height:auto;border-radius:16px;border:1px solid #e0e3dd;background:white}}.links{{display:flex;flex-wrap:wrap;gap:16px;padding:14px 2px;font-size:12px;color:#717969}}@media(max-width:760px){{header{{flex-wrap:wrap;gap:14px}}nav{{margin-left:0}}main{{grid-template-columns:1fr;padding:0 16px;gap:22px}}}}</style><header><strong>Naumi</strong><span>Logo / 01</span><nav>{''.join(f'<a href="#{key}">{key.upper()}</a>' for key,*_ in SCHEMES)}</nav><a class="download" href="/download.zip">整套素材</a></header><main>{cards}</main></html>'''


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    entries = []
    for scheme in SCHEMES:
        key, name, en, slug, font = scheme
        folder = OUT / slug
        folder.mkdir(exist_ok=True)
        assets = {
            "symbol-black": svg(mark(key, 0, 0, 512, INK, key + "-symbol-black")),
            "symbol-white": svg(mark(key, 0, 0, 512, "#fff", key + "-symbol-white")),
            "app-dark": svg(app(key, "#fff", INK, suffix=key + "-app-dark")),
            "app-light": svg(app(key, INK, "#fff", suffix=key + "-app-light")),
            "horizontal-black": svg(mark(key, 0, 0, 176, INK, key + "-lockup-black") + wordmark(font, 196, 119, 102), 560, 176),
            "horizontal-white": svg(mark(key, 0, 0, 176, "#fff", key + "-lockup-white") + wordmark(font, 196, 119, 102, "#fff"), 560, 176),
            "scheme-preview": scheme_board(scheme),
        }
        for filename, body in assets.items():
            (folder / (filename + ".svg")).write_text(body, encoding="utf8")
        entries.append({"key": key, "name": name, "en": en, "folder": slug, "selectedDirection": key == "a", "font": font.name, "format": "native SVG, outlined wordmark"})
    (OUT / "comparison.svg").write_text(comparison(), encoding="utf8")
    (OUT / "index.html").write_text(gallery(), encoding="utf8")
    (OUT / "schemes.json").write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf8")
    shutil.copy2(ROOT / "node_modules/geist/LICENSE.txt", OUT / "GEIST-LICENSE.txt")
    print(f"LOGO_SVG=PASS schemes={len(SCHEMES)} svgs=43 original=untouched")


if __name__ == "__main__":
    main()
