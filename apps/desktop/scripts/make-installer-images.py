"""Generates the NSIS installer graphics from the app icon.

Run from apps/desktop:  python scripts/make-installer-images.py
Writes src-tauri/installer/header.bmp (150x57) and sidebar.bmp (164x314),
the sizes NSIS Modern UI expects. Re-run after changing the logo.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ICON = ROOT / "src-tauri" / "icons" / "icon.png"
OUT = ROOT / "src-tauri" / "installer"

BG = (12, 12, 14)
GOLD = (201, 169, 110)
TEXT = (244, 244, 245)
MUTED = (161, 161, 170)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    for name in (["segoeuib.ttf", "arialbd.ttf"] if bold else ["segoeui.ttf", "arial.ttf"]):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def logo(size: int) -> Image.Image:
    return Image.open(ICON).convert("RGBA").resize((size, size), Image.LANCZOS)


def sidebar() -> None:
    img = Image.new("RGB", (164, 314), BG)
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, 3, 314], fill=GOLD)
    img.paste(logo(72), (46, 70), logo(72))
    draw.text((82, 168), "Velora", font=font(24, bold=True), fill=TEXT, anchor="mm")
    draw.text((82, 196), "Interview copilot", font=font(12), fill=MUTED, anchor="mm")
    img.save(OUT / "sidebar.bmp")


def header() -> None:
    # The header sits on the right of a white page strip, so use a light background.
    img = Image.new("RGB", (150, 57), (255, 255, 255))
    img.paste(logo(40), (102, 8), logo(40))
    img.save(OUT / "header.bmp")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    sidebar()
    header()
    print(f"Wrote {OUT / 'sidebar.bmp'} and {OUT / 'header.bmp'}")
