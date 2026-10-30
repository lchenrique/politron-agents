"""Extrai a geometria do mascote aprovado; não altera a imagem de referência."""
from pathlib import Path
import json
import cv2
import numpy as np
from scipy.ndimage import gaussian_filter1d
from skimage.measure import find_contours

ROOT = Path(__file__).resolve().parents[2]
LAB = Path(__file__).resolve().parent
image = cv2.imread(str(LAB / 'reference.png'))
gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
SCALE = 160 / 360  # Extensão entre os pixels extremos da primeira silhueta.


def sample(contour, count):
    # Marching squares recupera a borda entre pixels, em vez de encolher
    # a forma até os centros dos pixels de findContours.
    x, y, w, h = cv2.boundingRect(contour)
    x, y = max(0, x - 3), max(0, y - 3)
    region = gray[y:y + h + 6, x:x + w + 6]
    edges = find_contours(region, 128)
    closed = [edge for edge in edges if np.allclose(edge[0], edge[-1])]
    edge = max(closed, key=lambda edge: cv2.contourArea(edge[:, ::-1].astype('float32')))
    points = edge[:-1, ::-1] + [x, y]
    points = gaussian_filter1d(points, .5, axis=0, mode='wrap')
    points = np.vstack([points, points[0]])
    lengths = np.r_[0, np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1))]
    targets = np.linspace(0, lengths[-1], count, endpoint=False)
    return np.column_stack([np.interp(targets, lengths, points[:, axis]) for axis in [0, 1]])


def path(points):
    # Spline cardinal fechada: o SVG preserva curvas, sem raster embutido.
    def pair(point):
        return ' '.join(f'{value:.3f}' for value in point)
    result = 'M' + pair(points[0])
    for i in range(len(points)):
        previous, start = points[(i - 1) % len(points)], points[i]
        end, following = points[(i + 1) % len(points)], points[(i + 2) % len(points)]
        result += ' C' + pair(start + (end - previous) / 6)
        result += ' ' + pair(end - (following - start) / 6) + ' ' + pair(end)
    return result + ' Z'


def trace(contour, origin, count=48):
    return path((sample(contour, count) - origin) * SCALE + [120.5, 100.5])


art, manifest = {}, []
for pose, (left, right) in zip(['idle', 'focus', 'happy', 'sleep'], [(50, 490), (510, 950), (970, 1470), (1490, 1940)]):
    crop = gray[170:600, left:right]
    white, _ = cv2.findContours((crop > 128).astype('uint8'), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    white = sorted(white, key=cv2.contourArea, reverse=True)
    body = white[0] + [[[left, 170]]]
    x, y, w, h = cv2.boundingRect(body)
    origin = np.array([x + (w - 1) / 2, y + (h - 1) / 2])
    body_mask = np.zeros(gray.shape, np.uint8)
    cv2.drawContours(body_mask, [body], -1, 255, -1)
    dark = ((gray < 110) & (cv2.erode(body_mask, np.ones((5, 5), np.uint8)) > 0)).astype('uint8')
    contours, hierarchy = cv2.findContours(dark, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    features = [(c, hierarchy[0][i]) for i, c in enumerate(contours) if cv2.contourArea(c) > 40]
    outer = [c for c, hierarchy in features if hierarchy[3] == -1]
    outer.sort(key=lambda c: cv2.boundingRect(c)[1])
    mouth = max(outer, key=lambda c: cv2.boundingRect(c)[1])
    remaining = [c for c in outer if c is not mouth]
    brow = None
    if pose == 'focus':
        brow = min(remaining, key=lambda c: cv2.boundingRect(c)[1])
        remaining = [c for c in remaining if c is not brow]
    remaining.sort(key=lambda c: cv2.boundingRect(c)[0])
    glints = sorted([c for c, hierarchy in features if hierarchy[3] != -1], key=lambda c: cv2.boundingRect(c)[0])
    # OpenCV posiciona centros em inteiros; SVG posiciona centros em n + 0,5.
    points = (sample(body, 180) - origin) * SCALE + [120.5, 100.5]
    weight = np.clip((points[:, 1] - 100) / 70, 0, 1)
    variants = []
    for phase in [1, -1]:
        liquid = points.copy()
        liquid[:, 0] += weight * .65 * np.sin(points[:, 1] / 17) * phase
        liquid[:, 1] += weight * 1.1 * np.sin((points[:, 0] - 120) / 19 + phase)
        variants.append(path(liquid))
    hands = []
    if pose == 'happy':
        for hand in sorted(white[1:3], key=lambda c: cv2.boundingRect(c)[0]):
            hand = hand + [[[left, 170]]]
            center = sample(hand, 64).mean(axis=0)
            hands.append({'x': float((center[0] - origin[0]) * SCALE + 120.5), 'y': float((center[1] - origin[1]) * SCALE + 100.5), 'path': path((sample(hand, 48) - center) * SCALE)})
    art[pose] = {'body': path(points), 'liquidA': variants[0], 'liquidB': variants[1], 'eyes': [trace(c, origin) for c in remaining], 'glints': [trace(c, origin, 24) for c in glints], 'mouth': trace(mouth, origin, 64), 'brow': trace(brow, origin) if brow is not None else None, 'hands': hands}
    # Referência na mesma escala/viewBox que o renderer, para comparação objetiva.
    matrix = np.array([[SCALE, 0, 100 - origin[0] * SCALE], [0, SCALE, 100 - origin[1] * SCALE]])
    normalized = cv2.warpAffine(image, matrix, (200, 200), flags=cv2.INTER_AREA, borderValue=(25, 22, 21))
    cv2.imwrite(str(LAB / 'comparison' / f'reference-{pose}.png'), normalized)
    body_target = cv2.warpAffine(body_mask, matrix, (200, 200), flags=cv2.INTER_NEAREST)
    cv2.imwrite(str(LAB / 'comparison' / f'body-mask-{pose}.png'), body_target)
    manifest.append({'id': pose, 'sourceBounds': [x, y, w, h], 'sourceOrigin': origin.tolist(), 'scale': SCALE, 'normalizedViewBox': [20, 0, 200, 200], 'eyeBounds': [cv2.boundingRect(c) for c in remaining], 'glintBounds': [cv2.boundingRect(c) for c in glints]})

out = ROOT / 'apps/desktop/src/renderer/src/features/app/boo-reference-art.ts'
out.write_text('/** Geometria extraída da arte aprovada. Regenerar com design-systems/boo-reference/trace_reference.py. */\nexport const BOO_REFERENCE_ART = ' + json.dumps(art, ensure_ascii=False, indent=2) + ' as const\n', encoding='utf-8')
(LAB / 'asset-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
(LAB / 'art.json').write_text(json.dumps(art), encoding='utf-8')
(LAB / 'visual-map.md').write_text('# Geometria do Boo aprovado\n\nFonte: reference.png, 1983 × 793 px. Os quatro personagens são medidos individualmente; não se reinterpreta a silhueta.\n\nCamadas: preenchimento do corpo; olhos com os recortes claros preservados; boca; sobrancelha somente no foco; mãos separadas somente na pose feliz. O SVG continua paramétrico e animado, sem incorporar o PNG.\n\nEscala comum: 160/360. Centro da caixa de cada silhueta alinhado a (120,100), viewBox (20,0,200,200). O SVG recebe +0,5 unidade para converter centros inteiros do OpenCV em centros de pixels do rasterizador. Contornos extraídos por limiar de luminância; spline fechada com 180 pontos para o corpo, 48 para olhos e 64 para boca. A máscara binária ignora a textura e a iluminação residual do PNG gerado.\n\nFidelidade medida em repouso; a deformação ambiente altera apenas a parte inferior em até 1,1 unidade. Cores do agente e acessórios personalizados permanecem variações deliberadas.\n', encoding='utf-8')
print(json.dumps({'generated': str(out), 'poses': [x['id'] for x in manifest], 'bytes': out.stat().st_size}))
