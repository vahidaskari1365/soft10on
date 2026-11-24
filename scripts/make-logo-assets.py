"""ساخت خروجی‌های لوگوی 10on از PNG خام کاربر.
- 10on-logo.png       : اثر اصلی کاربر (خطوط سفید) — برای سطوح تیره (سایدبار، لاگین، topbar در حالت تیره)
- 10on-logo-light.png : نسخهٔ سطح روشن — حلقه و IO تیره + دیسک سفیدپر با حروف ON تیره
- src/app/icon.png    : فاواکون 128px — پلیت تیرهٔ گوشه‌گرد + لوگوی سفید (در تب روشن و تیره مرئی)
"""
from collections import deque
from PIL import Image

SRC = '/home/z/my-project/upload/00-1.png'
OUT_BLACK = '/home/z/my-project/public/10on-logo.png'
OUT_LIGHT = '/home/z/my-project/public/10on-logo-light.png'
OUT_ICON = '/home/z/my-project/src/app/icon.png'

im = Image.open(SRC).convert('RGBA')
w, h = im.size
px = im.load()

# اگر PNG اصلی پس‌زمینهٔ شفاف دارد مستقیم از آلفای خودش استفاده می‌کنیم؛
# در غیر این صورت فقط پس‌زمینهٔ سفیدِ متصل به لبه‌ها حذف می‌شود (دایرهٔ سفید داخل پیل حفظ می‌ماند)
alpha_hist = im.getchannel('A').histogram()
has_alpha = alpha_hist[0] > w * h * 0.05

if has_alpha:
    rgba = im
else:
    def is_bg(x, y):
        r, g, b, a = px[x, y]
        return a == 0 or (r > 238 and g > 238 and b > 238)

    outside = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(x, y) and not outside[y][x]:
                outside[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg(x, y) and not outside[y][x]:
                outside[y][x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not outside[ny][nx] and is_bg(nx, ny):
                outside[ny][nx] = True
                q.append((nx, ny))

    rgba = Image.new('RGBA', (w, h))
    rpx = rgba.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            rpx[x, y] = (r, g, b, 0 if outside[y][x] else a)

rgba = rgba.crop(rgba.getbbox())

# ————— نسخهٔ سطح روشن: خطوط تیره + دیسک سفیدپر + حروف ON تیره —————
# کل اثر مات → تیره؛ سپس دیسک ON (بزرگ‌ترین مؤلفهٔ متصل) سفیدپر می‌شود و
# حروف ON (شکاف‌های شفاف داخل دیسک) تیره رنگ می‌گیرند.
DARK = (23, 28, 34, 255)          # هم‌خانوادهٔ سایدبار (#0a0e12)
WHITE = (255, 255, 255, 255)

def largest_component_bbox(alpha_img):
    w, h = alpha_img.size
    ap = alpha_img.load()
    seen = [[False] * w for _ in range(h)]
    best = None
    for y0 in range(h):
        for x0 in range(w):
            if ap[x0, y0] > 128 and not seen[y0][x0]:
                q = deque([(x0, y0)])
                seen[y0][x0] = True
                minx = maxx = x0
                miny = maxy = y0
                count = 0
                while q:
                    x, y = q.popleft()
                    count += 1
                    minx, maxx = min(minx, x), max(maxx, x)
                    miny, maxy = min(miny, y), max(maxy, y)
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and ap[nx, ny] > 128:
                            seen[ny][nx] = True
                            q.append((nx, ny))
                if best is None or count > best[0]:
                    best = (count, minx, miny, maxx, maxy)
    return best  # (count, minx, miny, maxx, maxy)

rgba.save(OUT_BLACK)

alpha_ch = rgba.getchannel('A')
comp = largest_component_bbox(alpha_ch)
_, dx0, dy0, dx1, dy1 = comp
cx, cy = (dx0 + dx1) / 2, (dy0 + dy1) / 2
radius = max(dx1 - dx0, dy1 - dy0) / 2

op_px, lp_px = rgba.load(), None
light = Image.new('RGBA', rgba.size, (0, 0, 0, 0))
lp_px = light.load()
for y in range(rgba.height):
    for x in range(rgba.width):
        r, g, b, a = op_px[x, y]
        d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
        if a > 128:
            # شکل مات اصلی → تیره (حلقه، IO، و دیسک که بعداً سفید می‌شود)
            lp_px[x, y] = DARK
            if d <= radius:
                lp_px[x, y] = WHITE
        else:
            if d <= radius - 2:
                # شکاف داخل دیسک = حروف ON → تیره
                lp_px[x, y] = DARK
light.save(OUT_LIGHT)

# فاواکون: پلیت تیرهٔ گوشه‌گرد + لوگوی سفیدِ اصلی کاربر
PAD = 10
side = max(rgba.width, rgba.height) + PAD * 2
plate = Image.new('RGBA', (side, side), (0, 0, 0, 0))
ppx = plate.load()
R = 28
for y in range(side):
    for x in range(side):
        inside = PAD <= x < side - PAD and PAD <= y < side - PAD
        if not inside:
            continue
        rx = min(x - PAD, side - PAD - 1 - x, R)
        ry = min(y - PAD, side - PAD - 1 - y, R)
        if rx * rx + ry * ry <= R * R or (x - PAD >= R and side - PAD - 1 - x >= R) or (y - PAD >= R and side - PAD - 1 - y >= R):
            ppx[x, y] = (10, 14, 18, 255)  # #0a0e12
lw = side - PAD * 2
lh = round(rgba.height * lw / rgba.width)
logo_small = rgba.resize((lw, lh), Image.LANCZOS)
plate.alpha_composite(logo_small, (PAD, (side - lh) // 2))
plate.resize((128, 128), Image.LANCZOS).save(OUT_ICON)

for p in (OUT_BLACK, OUT_LIGHT, OUT_ICON):
    t = Image.open(p)
    print(p.split('/')[-1], t.size, t.mode)
