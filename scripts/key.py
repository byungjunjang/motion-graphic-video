"""생성 그림의 마젠타(#FF00FF) 바탕을 지워 투명 PNG 로 만든다.

AI 이미지(codex-image) 절차는 .claude/skills/motion-video/references/ai-image.md 에 있다. 처음 AI 이미지 첫 영상의 src/key.py 로 썼다.

사용 · python3 scripts/key.py <입력.png> <출력.png> [--split] [--pad 12]
  --split  · 떨어진 덩어리(인물·소품)를 왼쪽부터 <출력>-1.png, -2.png … 로 따로 저장한다
알고리즘 · 마젠타 정도 m = min(R, B) - G 로 알파를 정하고, 반투명 가장자리는 마젠타 섞임을 빼서 원래 색을 되살린다.
가장자리 띠에서만 마젠타 번짐을 눌러 보라 테두리를 없앤다. 그래서 그림 안쪽 색은 바뀌지 않는다.
"""
import os
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

LO, HI = 40.0, 190.0          # m 이 LO 이하면 불투명, HI 이상이면 완전 투명


def key(path):
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    m = np.minimum(R, B) - G
    alpha = 1.0 - np.clip((m - LO) / (HI - LO), 0.0, 1.0)
    # 반투명 가장자리: P = a*F + (1-a)*K → F = (P - (1-a)*K) / a
    K = np.array([255.0, 0.0, 255.0], dtype=np.float32)
    a = np.maximum(alpha, 1e-3)[..., None]
    fg = np.clip((rgb - (1.0 - alpha[..., None]) * K) / a, 0, 255)
    # 가장자리 띠(투명 영역에서 3px 안)에서만 마젠타 번짐 누르기
    band = ndimage.binary_dilation(alpha < 0.98, iterations=3) & (alpha > 0.02)
    s = np.maximum(0.0, np.minimum(fg[..., 0], fg[..., 2]) - fg[..., 1])
    fg[..., 0] = np.where(band, fg[..., 0] - s, fg[..., 0])
    fg[..., 2] = np.where(band, fg[..., 2] - s, fg[..., 2])
    alpha = np.where(alpha < 0.02, 0.0, alpha)
    out = np.dstack([np.clip(fg, 0, 255), alpha * 255.0]).astype(np.uint8)
    return out


def crop(arr, pad):
    ys, xs = np.nonzero(arr[..., 3] > 5)
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad + 1, arr.shape[0])
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad + 1, arr.shape[1])
    return arr[y0:y1, x0:x1], (x0, y0, x1 - x0, y1 - y0)


def main():
    args = sys.argv[1:]
    src, dst = args[0], args[1]
    split = '--split' in args
    pad = int(args[args.index('--pad') + 1]) if '--pad' in args else 12
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)   # assets/cut/ 이 아직 없어도 된다
    arr = key(src)
    if not split:
        c, box = crop(arr, pad)
        Image.fromarray(c).save(dst)
        print(dst, 'box', box, 'size', c.shape[1], 'x', c.shape[0])
        return
    solid = ndimage.binary_dilation(arr[..., 3] > 20, iterations=18)   # 가까운 조각은 한 덩어리로 묶는다
    lab, n = ndimage.label(solid)
    objs = ndimage.find_objects(lab)
    items = []
    for i, sl in enumerate(objs):
        area = int((lab[sl] == i + 1).sum())
        if area < 4000:
            continue
        piece = arr.copy()
        piece[..., 3] = np.where(lab == i + 1, piece[..., 3], 0)
        items.append((sl[1].start, piece))
    items.sort(key=lambda t: t[0])
    stem = dst[:-4] if dst.endswith('.png') else dst
    for k, (_, piece) in enumerate(items, 1):
        c, box = crop(piece, pad)
        p = f'{stem}-{k}.png'
        Image.fromarray(c).save(p)
        print(p, 'box', box, 'size', c.shape[1], 'x', c.shape[0])


if __name__ == '__main__':
    main()
