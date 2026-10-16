"""Tiny 2.5D icon renderer: signed distances for shapes, height maps for material,
lighting from the height map, soft layered shadows. Everything is float RGB 0..1 at
N px (rendered at 2x and reduced at the end)."""
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

N = 2048                       # working size; the icon is 1024 at the end
Y, X = np.mgrid[0:N, 0:N].astype(np.float32) + 0.5
U = N / 1024.0                 # 1 unit = 1 px of the final 1024 icon

def hexc(h):
    h = h.lstrip('#'); return np.array([int(h[i:i+2], 16) / 255 for i in (0, 2, 4)], np.float32)

def to_lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def to_srgb(c):
    c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)

def col(h): return to_lin(hexc(h))           # work in linear light

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

# ---- shapes as signed distance (negative inside), in final-1024 units --------------
def sd_rrect(cx, cy, w, h, r, X=X, Y=Y):
    px, py = X / U - cx, Y / U - cy
    qx, qy = np.abs(px) - w / 2 + r, np.abs(py) - h / 2 + r
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r

def sd_circle(cx, cy, r):
    return np.hypot(X / U - cx, Y / U - cy) - r

def sd_from_mask(m):
    """signed distance (1024 units) from a boolean mask"""
    inside = ndi.distance_transform_edt(m)
    outside = ndi.distance_transform_edt(~m)
    return (outside - inside) / U

def poly_mask(pts, ss=1):
    im = Image.new('L', (N, N), 0); ImageDraw.Draw(im).polygon([(x * U, y * U) for x, y in pts], fill=255)
    return np.asarray(im, np.float32) / 255

def cov(sd, aa=0.6):
    """coverage 0..1 with anti-aliasing (aa in 1024 units)"""
    return np.clip(0.5 - sd / aa, 0, 1).astype(np.float32)

def squircle_sd(n=5.0, size=1024, margin=0):
    """iOS-like continuous corner tile, as signed distance approx (via mask)"""
    a = (size - 2 * margin) / 2
    px, py = np.abs(X / U - 512) / a, np.abs(Y / U - 512) / a
    f = (px ** n + py ** n) ** (1 / n)
    return (f - 1) * a

def text_mask(ch, font, size, cx, cy, index=0, weight_px=0):
    f = ImageFont.truetype(font, int(size * U), index=index)
    im = Image.new('L', (N, N), 0); d = ImageDraw.Draw(im)
    l, t, r, b = d.textbbox((0, 0), ch, font=f)
    d.text((cx * U - (l + r) / 2, cy * U - (t + b) / 2), ch, font=f, fill=255)
    m = np.asarray(im, np.float32) / 255
    if weight_px: m = ndi.grey_dilation(m, size=int(weight_px * U))
    return m

# ---- noise ---------------------------------------------------------------------------
_rng = np.random.default_rng(7)
def noise(scale, seed=0, aniso=(1, 1)):
    """smooth value noise, feature size ~scale (1024 units); aniso stretches (sx, sy)"""
    rng = np.random.default_rng(seed)
    n = rng.standard_normal((N, N)).astype(np.float32)
    s = scale * U / 2.5
    n = ndi.gaussian_filter(n, (s * aniso[1], s * aniso[0]), mode='wrap')
    return n / (n.std() + 1e-6)

def fbm(scales, seed=0, aniso=(1, 1)):
    out = np.zeros((N, N), np.float32); w = 1.0; tot = 0
    for i, s in enumerate(scales):
        out += w * noise(s, seed + i * 13, aniso); tot += w; w *= 0.6
    return out / tot

def paper_height(seed=0, fibre=1.0):
    """paper: soft cloudiness + short fibres"""
    h = 0.6 * fbm([40, 12, 4], seed)
    rng = np.random.default_rng(seed + 99)
    f = np.zeros((N, N), np.float32)
    k = int(2600 * fibre)
    xs, ys = rng.integers(0, N, k), rng.integers(0, N, k)
    ang = rng.uniform(0, np.pi, k); ln = rng.uniform(6, 26, k) * U
    im = Image.new('L', (N, N), 0); d = ImageDraw.Draw(im)
    for x, y, a, l in zip(xs, ys, ang, ln):
        d.line([(x, y), (x + np.cos(a) * l, y + np.sin(a) * l)], fill=int(rng.uniform(60, 160)), width=1)
    f = ndi.gaussian_filter(np.asarray(im, np.float32) / 255, 0.7 * U)
    return h + 2.2 * f * fibre

def weave_height(period=5.0, seed=0, angle=0.0):
    """plain-weave cloth: warp/weft threads alternating over and under"""
    p = period * U
    c, s = np.cos(angle), np.sin(angle)
    x, y = X * c + Y * s, -X * s + Y * c
    jit = noise(30, seed) * 0.25 * p
    xx, yy = x + jit, y + noise(30, seed + 1) * 0.25 * p
    i, j = np.floor(xx / p), np.floor(yy / p)
    fx, fy = xx / p - i, yy / p - j
    warp = np.sin(np.pi * fx) ** 0.7 * (0.6 + 0.4 * np.sin(np.pi * fy))
    weft = np.sin(np.pi * fy) ** 0.7 * (0.6 + 0.4 * np.sin(np.pi * fx))
    top = ((i + j) % 2 == 0)
    h = np.where(top, warp + 0.25, weft + 0.25)
    # slubs: threads vary in thickness along their length
    h *= 1 + 0.18 * noise(14, seed + 2, (1, 3))
    return h.astype(np.float32)

# ---- light -----------------------------------------------------------------------------
LIGHT = np.array([-0.45, -0.75, 0.9], np.float32); LIGHT /= np.linalg.norm(LIGHT)

def normals(h, strength=1.0):
    gy, gx = np.gradient(h * strength / U)
    n = np.stack([-gx, -gy, np.ones_like(h)], -1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)

def light(h, strength=1.0, amb=0.35, spec=0.0, shin=30, L=LIGHT):
    """returns (diffuse factor ~1 on flat, specular) for a height map in 1024-px units"""
    n = normals(h, strength)
    ndl = np.clip((n * L).sum(-1), 0, 1)
    flat = L[2]
    d = amb + (1 - amb) * ndl / flat
    if spec:
        H = L + np.array([0, 0, 1], np.float32); H /= np.linalg.norm(H)
        sp = spec * np.clip((n * H).sum(-1), 0, 1) ** shin
    else:
        sp = 0
    return d.astype(np.float32), sp

def bevel(sd, width, curve='round'):
    """height profile rising inside a shape over `width` (1024 units)"""
    t = np.clip(-sd / width, 0, 1)
    if curve == 'round': return np.sqrt(1 - (1 - t) ** 2)
    if curve == 'soft': return smooth(0, 1, t)
    return t

def blur(a, sigma):
    return ndi.gaussian_filter(a, sigma * U) if sigma > 0 else a

def shift(a, dx, dy):
    return ndi.shift(a, (dy * U, dx * U), order=1, mode='constant')

def shadow(mask, layers):
    """layers: [(dx, dy, sigma, opacity), ...] → darkness 0..1"""
    out = np.zeros_like(mask)
    for dx, dy, sg, op in layers:
        out = 1 - (1 - out) * (1 - op * blur(shift(mask, dx, dy), sg))
    return out

def over(dst, src, a):
    a = a[..., None] if a.ndim == 2 else a
    return dst * (1 - a) + src * a

def mul(img, f):
    return img * (f[..., None] if np.ndim(f) == 2 else f)

def fill(c):
    return np.broadcast_to(c, (N, N, 3)).astype(np.float32).copy()

def finish(img, alpha=None, size=1024, grain=0.0):
    """linear float → 8-bit sRGB PIL image at size"""
    if grain:
        img = img * (1 + grain * np.random.default_rng(3).standard_normal((N, N, 1)).astype(np.float32))
    s = (to_srgb(img) * 255 + 0.5).clip(0, 255).astype(np.uint8)
    im = Image.fromarray(s, 'RGB')
    if alpha is not None:
        im.putalpha(Image.fromarray((np.clip(alpha, 0, 1) * 255).astype(np.uint8), 'L'))
    return im.resize((size, size), Image.LANCZOS)

SERIF = '/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc'
SERIF_R = '/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc'
SANS = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
