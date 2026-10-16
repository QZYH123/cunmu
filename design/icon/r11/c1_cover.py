"""1 · 题签: the front cover of a thread-bound book, full bleed. 磁青 cloth, the paper
title slip, silk thread over the right edge."""
import sys; from lib import *

def render(slip='paper', cover='#1F2C47', out='c1.png', thread_x=868, mark=True):
    # cover cloth
    base = col(cover)
    h_cloth = weave_height(4.2, seed=3, angle=0.0) * 0.35 + 0.25 * fbm([60, 20], 5)
    d, _ = light(h_cloth, 2.2, amb=0.55)
    img = mul(fill(base), d)
    # big soft light: brighter upper left, falls off to the lower right
    g = 1.18 - 0.42 * np.clip((X / U * 0.55 + Y / U * 0.85) / 1024, 0, 1.2)
    img = mul(img, g)
    # the cover is pressed where the thread runs: a faint groove along the binding line
    tx = thread_x
    holes = [130, 380, 644, 894]
    # slip
    sx, sy, sw, shh = 214, 106, 156, 520
    sd_s = sd_rrect(sx, sy + shh / 2, sw, shh, 3)
    m_s = cov(sd_s)
    sh = shadow(m_s, [(2, 4, 3, 0.35), (8, 18, 20, 0.35), (16, 40, 60, 0.2)])
    img = mul(img, 1 - sh)
    if slip == 'paper':
        pc = col('#EDE3CC')
    else:
        pc = col(slip)
    hp = paper_height(11, 0.9) * 0.18 + bevel(sd_s, 3, 'soft') * 1.2
    dp, sp = light(hp, 1.5, amb=0.6, spec=0.04, shin=8)
    paper = mul(fill(pc), dp)
    paper = paper * (1 + 0.05 * fbm([30, 8], 21)[..., None])
    # slight edge darkening (old paper)
    paper = mul(paper, 1 - 0.10 * smooth(-14, 0, sd_s))
    paper = mul(paper, 1.06 - 0.12 * (Y / U - sy) / shh)
    # printed frame (双边) in cinnabar or ink
    if slip == 'paper':
        fc = col('#B5402A')
        fr = np.maximum(cov(np.abs(sd_rrect(sx, sy + shh / 2, sw - 26, shh - 26, 1)) - 1.2),
                        cov(np.abs(sd_rrect(sx, sy + shh / 2, sw - 38, shh - 38, 1)) - 0.6))
        ink = fr * (0.85 + 0.15 * noise(3, 40))
        paper = over(paper, mul(fill(fc), dp), np.clip(ink, 0, 1))
    img = over(img, paper, m_s)
    # thread: a line down the binding and four wraps over the right edge
    th = np.zeros((N, N), np.float32); tw = 9
    def seg_sd(x0, y0, x1, y1, r):
        px, py = X / U - x0, Y / U - y0; bx, by = x1 - x0, y1 - y0
        t = np.clip((px * bx + py * by) / (bx * bx + by * by), 0, 1)
        return np.hypot(px - bx * t, py - by * t) - r
    sds = [seg_sd(tx, -20, tx, 1044, tw / 2)] + [seg_sd(tx, y, 1060, y, tw / 2) for y in holes]
    sd_t = np.minimum.reduce(sds)
    m_t = cov(sd_t)
    # hole dimples in the cloth before the thread goes over them
    for y in holes:
        dimple = cov(sd_circle(tx, y, 9), 3)
        img = mul(img, 1 - 0.55 * blur(dimple, 3))
    img = mul(img, 1 - shadow(m_t, [(2, 3, 2.5, 0.45), (5, 9, 9, 0.3)]))
    # groove: the cover dips under the thread
    img = mul(img, 1 - 0.18 * blur(cov(sd_t - 10), 8) * (1 - m_t))
    ht = bevel(sd_t, tw / 2, 'round') * 3.0
    # twist: fine diagonal ridges along the thread
    tw_r = 0.35 * np.sin((X / U + Y / U) * 2 * np.pi / 6.0)
    ht = ht + tw_r * m_t
    dt, st = light(ht, 1.3, amb=0.45, spec=0.25, shin=18)
    thread = mul(fill(col('#E9E2D2')), dt) + st[..., None]
    img = over(img, thread, m_t)
    if mark:
        pass
    return img

if __name__ == '__main__':
    import json
    args = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    out = args.pop('out', '/tmp/c1.png')
    finish(render(**args)).save(out); print(out)
