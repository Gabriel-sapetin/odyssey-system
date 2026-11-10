from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
import re

root = Path(r'D:\odyssey-system\tmp\se-doc\diagram-expanded-review3-render')
files = sorted(root.glob('page-*.png'), key=lambda p: int(re.search(r'page-(\d+)', p.stem).group(1)))
thumb_w, thumb_h = 420, 550
for start in range(0, len(files), 6):
    batch = files[start:start + 6]
    sheet = Image.new('RGB', (thumb_w * 3, thumb_h * 2), 'white')
    draw = ImageDraw.Draw(sheet)
    for i, path in enumerate(batch):
        im = Image.open(path).convert('RGB')
        im.thumbnail((thumb_w - 12, thumb_h - 35))
        x, y = (i % 3) * thumb_w + 6, (i // 3) * thumb_h + 26
        sheet.paste(im, (x, y))
        draw.text((x, y - 20), f'Page {start + i + 1}', fill='black')
        draw.rectangle((x - 1, y - 1, x + im.width, y + im.height), outline='#888888')
    sheet.save(root / f'contact-{start + 1:02d}-{start + len(batch):02d}.png')
print(f'created {((len(files) + 5) // 6)} contact sheets from {len(files)} pages')
