"""r14 sheets: refine-steps.png, final.png (candidate sheet with real neighbours), before-after.png"""
import json, sys
from PIL import Image, ImageDraw
from present import candidate, shadowed, F, SANS, SERIF
OUT = '/workspace/cunmu-shots/compare/r14'
steps = [('renders/step0-r13.png', 'r13 原稿', '整体偏上偏左（对比度加权重心 504,474）'),
         ('renders/step1-centred.png', '1 居中 + 圆角 + 阴影', '重心移到 ~512,514；圆角 44→30；阴影改为柔和的灰绿'),
         ('renders/step2-rhythm.png', '2 角度节奏 + 配色', '-12°/-2°/8° 等距；略缩 0.95 留白；靛蓝、赭黄微调'),
         ('renders/step3-slivers.png', '3 露边均匀（定稿）', '两条露边宽度一致；阴影再轻一点；题签 58×196')]
S = 440; gap = 50
W = len(steps) * S + (len(steps) + 1) * gap; H = S + 450
c = Image.new('RGBA', (W, H), (240, 238, 234, 255)); d = ImageDraw.Draw(c)
d.text((gap, 24), '「一叠封面」r14 细化过程', font=F(SERIF, 40), fill=(28, 26, 24))
for i, (p, t, note) in enumerate(steps):
    x = gap + i * (S + gap); im = Image.open(p).convert('RGB')
    shadowed(c, im, (x, 100), S)
    d.text((x, 100 + S + 30), t, font=F(SERIF, 30), fill=(28, 26, 24))
    f = F(SANS, 20); line = ''; yy = 100 + S + 80
    for ch in note:
        if d.textlength(line + ch, font=f) > S: d.text((x, yy), line, font=f, fill=(90, 86, 80)); line = ''; yy += 28
        line += ch
    d.text((x, yy), line, font=f, fill=(90, 86, 80))
    xx = x
    for s in (60, 40, 29):
        shadowed(c, im, (xx, 100 + S + 170 + (60 - s)), s); xx += s + 18
    for s, bg in ((60, (22, 22, 24)),):
        pass
# the hand-placed favicons, at size and ×6
xx = gap; yy = H - 20
c.convert('RGB').save(f'{OUT}/refine-steps.png')
candidate('renders/final.png', '', '一叠封面（定稿）', '三张封面叠在一起，最前面一张只贴着题签：存下的是名字。', f'{OUT}/final.png')
# final sheet: the 16 cell shows the hand-placed favicon (what tabs and the .ico actually use)
fs = Image.open(f'{OUT}/final.png').convert('RGBA'); fav = Image.open('renders/favicon-16.png').convert('RGBA')
for row, bg in enumerate([(246, 245, 242), (22, 22, 24)]):
    t = Image.new('RGBA', (16, 16), bg + (255,)); t.alpha_composite(fav)
    fs.paste(t.resize((64, 64), Image.NEAREST), (1200 + 639, 150 + row * 290 + 98))
d = ImageDraw.Draw(fs)
d.text((1200, 1310), '16 格为手绘像素版（favicon / .ico 实际使用）', font=F(SANS, 22), fill=(90, 86, 80))
fs.convert('RGB').save(f'{OUT}/final.png')
# before / after
b = Image.new('RGBA', (2 * 600 + 3 * 70, 900), (240, 238, 234, 255)); d = ImageDraw.Draw(b)
for i, (p, t) in enumerate([('../r13/renders/c4-covers.png', 'r13 候选 4'), ('renders/final.png', 'r14 定稿')]):
    x = 70 + i * 670; im = Image.open(p).convert('RGB'); shadowed(b, im, (x, 60), 600)
    tw = d.textlength(t, font=F(SERIF, 40)); d.text((x + 300 - tw / 2, 690), t, font=F(SERIF, 40), fill=(28, 26, 24))
    for j, s in enumerate((60, 40, 29)):
        shadowed(b, im, (x + 200 + j * 80 + (60 - s) // 2, 780 + (60 - s) // 2), s)
b.convert('RGB').save(f'{OUT}/before-after.png')
print('ok')
