"""Mede geometria e registra a comparação, sem tratar textura como identidade."""
from pathlib import Path
import json
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

lab = Path(__file__).resolve().parent / 'comparison'
reports = []
board = Image.new('RGB', (880, 1800), (21, 22, 25))
draw = ImageDraw.Draw(board)
font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 22)
for row, pose in enumerate(['idle', 'focus', 'happy', 'sleep']):
    reference = cv2.imread(str(lab / f'reference-{pose}.png'))
    render = cv2.imread(str(lab / f'render-{pose}.png'))
    target = cv2.imread(str(lab / f'body-mask-{pose}.png'), 0) > 128
    contours, _ = cv2.findContours((cv2.cvtColor(render, cv2.COLOR_BGR2GRAY) > 128).astype('uint8'), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    actual = np.zeros((200, 200), np.uint8)
    cv2.drawContours(actual, [max(contours, key=cv2.contourArea)], -1, 1, -1)
    actual = actual.astype(bool)
    def iou(a, b):
        return float(np.logical_and(a, b).sum() / np.logical_or(a, b).sum())
    inner = cv2.erode(target.astype('uint8'), np.ones((3, 3), np.uint8)) > 0
    ink_reference = (cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY) < 110) & inner
    ink_render = (cv2.cvtColor(render, cv2.COLOR_BGR2GRAY) < 110) & inner
    reports.append({'pose': pose, 'bodyIoU': iou(target, actual), 'faceInkIoU': iou(ink_reference, ink_render)})
    cv2.imwrite(str(lab / f'overlay-{pose}.png'), cv2.addWeighted(reference, .5, render, .5, 0))
    cv2.imwrite(str(lab / f'diff-{pose}.png'), np.clip(cv2.absdiff(reference, render).astype('uint16') * 3, 0, 255).astype('uint8'))
    for col, img in enumerate([reference, render]):
        board.paste(Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)).resize((400, 400)), (20 + col * 440, 40 + row * 450))
    draw.text((20, row * 450 + 8), 'Referência · ' + pose, fill='#bfc1c8', font=font)
    draw.text((460, row * 450 + 8), 'SVG no aplicativo', fill='#bfc1c8', font=font)
board.save(lab / 'side-by-side.png')
(lab / 'report.json').write_text(json.dumps(reports, indent=2), encoding='utf-8')
print(json.dumps(reports))
