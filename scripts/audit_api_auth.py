#!/usr/bin/env python3
"""ممیزی مجوزهای API — استخراج گاردهای نشست/نقش برای هر متد HTTP در هر route."""
import os
import re
import sys

ROOT = 'src/app/api'
METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
GUARD_RE = re.compile(r"getSessionUser|requireRole|session\s*=|const session")
ROLE_RE = re.compile(r"role\s*(?:!==|===)\s*'([A-Z_]+)'|roles\.includes|requireRole\('([^']+)'")

rows = []
for dirpath, _, files in sorted(os.walk(ROOT)):
    for fn in sorted(files):
        if not fn.endswith('.ts'):
            continue
        path = os.path.join(dirpath, fn)
        rel = path.replace(ROOT, '/api')
        src = open(path).read()
        for m in METHODS:
            # پیدا کردن بلوک متد
            match = re.search(rf"export async function {m}\b", src)
            if not match:
                continue
            start = match.start()
            # تا شروع متد بعدی یا پایان فایل
            nxt = re.search(r"export async function (?:GET|POST|PATCH|PUT|DELETE)\b", src[match.end():])
            end = match.end() + (nxt.start() if nxt else len(src))
            body = src[start:end]
            has_guard = bool(GUARD_RE.search(body[:1200]))
            roles = set()
            for rm in ROLE_RE.finditer(body):
                roles.add(rm.group(1) or rm.group(2))
            flag = ''
            if not has_guard and 'public-booking' not in path and 'auth/' not in path:
                flag = ' ← NO-GUARD'
            r = ','.join(sorted(roles)) if roles else ('session-only' if has_guard else '—')
            rows.append(f"{rel:34s} {m:6s} guard={'Y' if has_guard else 'N'}{flag}  roles=[{r}]")

print('\n'.join(rows))
print(f"\ntotal method-handlers: {len(rows)}")
