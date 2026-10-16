"""where the stack sits: bbox and mass centre of everything that differs from the tile"""
import sys, numpy as np
from PIL import Image
for f in sys.argv[1:]:
    im = np.asarray(Image.open(f).convert('RGB')).astype(int)
    ref = im[:, :40].mean(1)[:, None, :]
    d = np.abs(im - ref).sum(2)
    m = d > 90
    ys, xs = np.nonzero(m); wgt = d[m]
    print(f.split('/')[-1], 'bbox x', xs.min(), xs.max(), 'y', ys.min(), ys.max(),
          'bbox-c (%.0f,%.0f)' % ((xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2),
          'mass (%.0f,%.0f)' % (xs.mean(), ys.mean()), 'contrast-weighted (%.0f,%.0f)' % ((xs * wgt).sum() / wgt.sum(), (ys * wgt).sum() / wgt.sum()))
