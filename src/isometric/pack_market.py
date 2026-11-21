"""Pack Blender plates using Pillow and NumPy. Runtime assets need no modeling tools."""
from pathlib import Path
import os
import shutil

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

src = Path(os.environ.get("MARKET_RENDER_DIR", "/tmp/campaigntwin-market-render"))
assets = Path(__file__).resolve().parent / 'assets'
assets.mkdir(exist_ok=True)
def denoise(image):
    # Use a local median as the guide so single bright samples do not survive as outlines.
    data = np.asarray(image, dtype=np.float32)
    guide = np.asarray(image.filter(ImageFilter.MedianFilter(3)),dtype=np.float32)
    pad = np.pad(data,((2,2),(2,2),(0,0)),mode='edge')
    pad_guide = np.pad(guide,((2,2),(2,2),(0,0)),mode='edge')
    total = np.zeros_like(data)
    weights = np.zeros((*data.shape[:2],1),dtype=np.float32)
    h,w = data.shape[:2]
    for dy in range(-2,3):
        for dx in range(-2,3):
            shift = pad_guide[dy+2:dy+2+h,dx+2:dx+2+w]
            difference = np.mean((guide-shift)**2,axis=2,keepdims=True)
            weight = np.exp(-difference/(2*11**2) - (dx*dx+dy*dy)/(2*1.4**2))
            total += pad[dy+2:dy+2+h,dx+2:dx+2+w]*weight
            weights += weight
    filtered = Image.fromarray(np.uint8(np.clip(total/weights,0,255)))
    return ImageEnhance.Color(filtered).enhance(1.10)
for name in ('east','west'):
    image = denoise(Image.open(src/(name+'.png')).convert('RGB'))
    image.save(assets/(name+'.webp'), quality=94, method=6)
    depth = Image.open(src/(name+'-depth0001.png')).convert('L')
    depth.resize((680,425),Image.Resampling.BILINEAR).save(assets/(name+'-depth.png'),optimize=True)
Image.open(src/'shoppers.png').save(assets/'shoppers.webp',quality=96,method=6)
shutil.copyfile(src/'projection.json',assets/'projection.json')
