"""refs-board.png: the reference icons, masked, labelled"""
import json, os
from PIL import Image, ImageDraw, ImageFont
from review import masked
R = '/workspace/cunmu-shots/compare/r13/refs'
log = [l for l in json.load(open(f'{R}/refs.json')) if os.path.exists(f"{R}/{l[0].replace(' ', '_')}.png")]
F = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 22, index=2)
cols, cell = 8, 200
rows = (len(log) + cols - 1) // cols
W, H = cols * cell + 60, rows * (cell + 60) + 120
c = Image.new('RGBA', (W, H), (240, 238, 234, 255)); d = ImageDraw.Draw(c)
d.text((30, 30), '参考图标（内部参考，来自 App Store 公开图标）', font=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 34, index=2), fill=(30, 30, 30))
for i, (short, name, seller, url) in enumerate(log):
    im = Image.open(f"{R}/{short.replace(' ', '_')}.png").convert('RGB')
    x, y = 30 + (i % cols) * cell + 20, 100 + (i // cols) * (cell + 60)
    m = masked(im, 150); c.alpha_composite(m, (x, y))
    tw = d.textlength(short, font=F); d.text((x + 75 - tw / 2, y + 160), short, font=F, fill=(60, 60, 60))
c.convert('RGB').save('/workspace/cunmu-shots/compare/r13/refs-board.png'); print(len(log))
