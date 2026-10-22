"""Draws the demo's sample pictures (DEMO-3): flat illustrations, no people, no real places.
Run: python3 scripts/make-demo-pictures.py  -> public/demo-pictures/<name>.jpg and <name>-thumb.jpg
Needs Pillow. The pictures are checked in; rerun only to change them."""
import math, os, random
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'demo-pictures')
W, H = 1200, 900
random.seed(7)

def sky(d, top, bottom, w=W, h=H):
    for y in range(h):
        t = y / h
        d.line([(0, y), (w, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))

def hill(d, base, amp, freq, phase, color, w=W, h=H):
    pts = [(x, base + amp * math.sin(x / w * math.pi * freq + phase)) for x in range(0, w + 10, 10)]
    d.polygon(pts + [(w, h), (0, h)], fill=color)

def cloud(d, x, y, s, color=(255, 255, 255)):
    for dx, dy, r in [(0, 0, 40), (45, -15, 50), (95, 0, 40), (50, 15, 42)]:
        d.ellipse([x + dx * s - r * s, y + dy * s - r * s, x + dx * s + r * s, y + dy * s + r * s], fill=color)

def pumpkins():
    im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im)
    sky(d, (255, 196, 120), (255, 236, 200))
    d.ellipse([880, 90, 1020, 230], fill=(255, 245, 210))
    hill(d, 520, 25, 2, 0.5, (196, 150, 90))
    hill(d, 600, 18, 3, 1.2, (120, 140, 70))
    for i in range(14):
        x = 60 + (i % 7) * 165 + random.randint(-25, 25); y = 640 + (i // 7) * 140 + random.randint(-15, 15)
        s = random.uniform(0.7, 1.15); w, h = 120 * s, 90 * s
        for k in range(-2, 3):
            d.ellipse([x + k * w * 0.18 - w * 0.35, y - h / 2, x + k * w * 0.18 + w * 0.35, y + h / 2], fill=(235 - abs(k) * 12, 120 - abs(k) * 10, 30), outline=(190, 90, 20), width=2)
        d.rectangle([x - 6 * s, y - h / 2 - 22 * s, x + 6 * s, y - h / 2 + 4], fill=(90, 110, 40))
    return im

def beach():
    im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im)
    sky(d, (255, 140, 120), (255, 214, 150))
    d.ellipse([500, 330, 700, 530], fill=(255, 238, 170))
    for i, y in enumerate(range(470, 640, 18)):
        d.rectangle([0, y, W, y + 18], fill=(40 + i * 6, 110 + i * 8, 170 + i * 5))
    hill(d, 650, 12, 1.5, 0, (240, 214, 160))
    d.line([(860, 520), (900, 760)], fill=(120, 80, 50), width=8)
    d.pieslice([720, 440, 1000, 640], 180, 360, fill=(230, 70, 80))
    for k in range(4):
        d.pieslice([720, 440, 1000, 640], 180 + k * 45, 202 + k * 45, fill=(250, 250, 245))
    d.ellipse([240, 760, 300, 790], fill=(250, 250, 250)); d.ellipse([300, 770, 340, 792], fill=(230, 120, 140))
    return im

def cake():
    im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im)
    sky(d, (250, 236, 245), (236, 222, 250))
    for i in range(12):
        x = i * 110 - 20; c = [(240, 90, 110), (90, 170, 230), (250, 200, 70), (120, 200, 140)][i % 4]
        d.line([(x, 60 + (i % 2) * 8), (x + 110, 60 + ((i + 1) % 2) * 8)], fill=(150, 130, 150), width=3)
        d.polygon([(x + 15, 66), (x + 95, 66), (x + 55, 150)], fill=c)
    d.rectangle([0, 700, W, H], fill=(170, 120, 90))
    d.ellipse([300, 640, 900, 740], fill=(240, 240, 245))
    d.rectangle([380, 470, 820, 690], fill=(250, 190, 210)); d.ellipse([380, 650, 820, 730], fill=(250, 190, 210))
    d.ellipse([380, 430, 820, 510], fill=(255, 235, 240))
    for k in range(9):
        d.ellipse([385 + k * 48, 495, 425 + k * 48, 535], fill=(255, 235, 240))
    for k in range(5):
        x = 450 + k * 75
        d.rectangle([x, 380, x + 16, 470], fill=[(90, 170, 230), (250, 200, 70), (120, 200, 140), (240, 90, 110), (160, 120, 220)][k])
        d.ellipse([x - 4, 340, x + 20, 382], fill=(255, 190, 60)); d.ellipse([x + 2, 352, x + 14, 378], fill=(255, 240, 160))
    return im

def snow():
    im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im)
    sky(d, (150, 190, 230), (225, 238, 250))
    d.polygon([(0, 560), (300, 200), (520, 480), (760, 160), (1200, 540), (1200, 900), (0, 900)], fill=(120, 140, 175))
    d.polygon([(250, 260), (300, 200), (350, 262), (320, 250), (300, 270), (280, 250)], fill=(250, 252, 255))
    d.polygon([(700, 230), (760, 160), (820, 235), (785, 222), (760, 245), (735, 222)], fill=(250, 252, 255))
    hill(d, 640, 30, 1.4, 0.3, (246, 249, 255))
    for x, y, s in [(120, 640, 1), (230, 680, 0.8), (980, 620, 1.1), (1080, 670, 0.9)]:
        for k in range(3):
            d.polygon([(x, y - 170 * s + k * 50 * s), (x - (50 + k * 18) * s, y - 80 * s + k * 50 * s), (x + (50 + k * 18) * s, y - 80 * s + k * 50 * s)], fill=(40, 100, 80))
        d.rectangle([x - 8 * s, y - 20 * s, x + 8 * s, y + 10 * s], fill=(100, 70, 50))
    d.polygon([(520, 760), (700, 760), (720, 740), (720, 770), (520, 780)], fill=(210, 60, 60))
    for _ in range(140):
        x, y, r = random.randint(0, W), random.randint(0, H), random.randint(2, 5)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255))
    return im

def kite():
    im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im)
    sky(d, (110, 180, 240), (200, 230, 250))
    cloud(d, 120, 160, 1.2); cloud(d, 760, 120, 0.9); cloud(d, 980, 260, 0.7)
    hill(d, 620, 40, 1.2, 0.8, (110, 180, 90)); hill(d, 700, 30, 2.2, 2.0, (80, 155, 75))
    kx, ky = 640, 260
    d.polygon([(kx, ky - 110), (kx + 80, ky), (kx, ky + 130), (kx - 80, ky)], fill=(240, 80, 90))
    d.polygon([(kx, ky - 110), (kx + 80, ky), (kx, ky)], fill=(250, 200, 70))
    d.polygon([(kx, ky + 130), (kx - 80, ky), (kx, ky)], fill=(250, 200, 70))
    pts = [(kx + i * 6, ky + 130 + i * 9 + 20 * math.sin(i / 3)) for i in range(40)]
    d.line(pts, fill=(80, 80, 120), width=3)
    for i in range(5, 40, 7):
        x, y = pts[i]; d.polygon([(x - 12, y - 8), (x + 12, y + 8), (x - 12, y + 8)], fill=(90, 170, 230))
    d.line([(kx, ky + 130), (900, 820)], fill=(250, 250, 250), width=1)
    return im

def sunflowers():
    im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im)
    sky(d, (140, 200, 245), (230, 245, 250))
    d.rectangle([0, 600, W, H], fill=(90, 150, 70))
    for i in range(7):
        x = 90 + i * 170 + random.randint(-20, 20); y = 330 + random.randint(-60, 80)
        d.line([(x, y), (x + random.randint(-15, 15), H)], fill=(60, 120, 50), width=12)
        d.ellipse([x - 70, y + 140, x - 10, y + 175], fill=(70, 140, 60))
        for a in range(0, 360, 24):
            r = math.radians(a)
            d.ellipse([x + 70 * math.cos(r) - 26, y + 70 * math.sin(r) - 26, x + 70 * math.cos(r) + 26, y + 70 * math.sin(r) + 26], fill=(250, 200, 40))
        d.ellipse([x - 48, y - 48, x + 48, y + 48], fill=(110, 70, 30))
    return im

def lake():
    im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im)
    sky(d, (250, 200, 160), (200, 220, 240))
    hill(d, 430, 40, 1.6, 0.4, (90, 120, 140))
    d.rectangle([0, 500, W, H], fill=(80, 140, 180))
    for y in range(520, H, 30):
        d.line([(random.randint(0, 600), y), (random.randint(600, W), y)], fill=(130, 180, 210), width=2)
    for x in range(-20, W, 70):
        h = random.randint(160, 260)
        d.polygon([(x, 500 - h), (x - 40, 500), (x + 40, 500)], fill=(30, 80, 60))
    d.polygon([(420, 680), (780, 680), (720, 720), (480, 720)], fill=(190, 90, 50))
    d.line([(560, 600), (640, 760)], fill=(120, 80, 50), width=6)
    return im

def bus():
    im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im)
    sky(d, (170, 210, 245), (235, 245, 252))
    cloud(d, 860, 140, 1.0)
    d.rectangle([0, 640, W, H], fill=(120, 120, 128)); d.rectangle([0, 620, W, 640], fill=(200, 200, 200))
    for x in range(40, W, 160): d.rectangle([x, 760, x + 90, 772], fill=(250, 250, 250))
    d.rounded_rectangle([230, 330, 980, 640], 30, fill=(250, 190, 30))
    d.rectangle([230, 520, 980, 545], fill=(30, 30, 30))
    for k in range(6): d.rounded_rectangle([270 + k * 105, 370, 355 + k * 105, 470], 10, fill=(190, 225, 245))
    d.rounded_rectangle([905, 370, 960, 600], 8, fill=(190, 225, 245))
    for x in (360, 840):
        d.ellipse([x - 60, 580, x + 60, 700], fill=(40, 40, 40)); d.ellipse([x - 25, 615, x + 25, 665], fill=(160, 160, 160))
    return im

SCENES = {'pumpkins': pumpkins, 'beach': beach, 'cake': cake, 'snow': snow, 'kite': kite, 'sunflowers': sunflowers, 'lake': lake, 'bus': bus}
os.makedirs(OUT, exist_ok=True)
for name, f in SCENES.items():
    im = f().filter(ImageFilter.SMOOTH)
    im.save(os.path.join(OUT, f'{name}.jpg'), quality=80, optimize=True, progressive=True)
    t = im.copy(); t.thumbnail((400, 400)); t.save(os.path.join(OUT, f'{name}-thumb.jpg'), quality=75, optimize=True)
    print(name)
