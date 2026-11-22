#!/usr/bin/env python3
"""تبدیل مکانیکی routeهای getSessionUser به tenantHandler/platformHandler.
- brace matching دقیق برای بستن wrapper
- استخراج نقش‌ها از گیت‌های موجود (حفظ دقیق semantics)
- فایل‌های استثنا: auth/login (عمومی), public-booking (بدون سشن), plans (پلتفرمی)
"""
import re, sys, glob

CLINIC_ROLES = "'ADMIN', 'MANAGER', 'RECEPTIONIST', 'DOCTOR', 'ACCOUNTANT'"
SKIP = ['auth/login']

def transform(src: str, path: str):
    changed = False
    # هر هندلر export async function را پیدا کن
    for m in list(re.finditer(r"export async function (GET|POST|PATCH|PUT|DELETE)\s*\(([^)]*)\)\s*\{", src)):
        verb, arglist = m.group(1), m.group(2)
        start = m.start()
        body_open = m.end() - 1  # موقعیت {
        # brace matching
        depth = 0; end = None
        for i in range(body_open, len(src)):
            if src[i] == '{': depth += 1
            elif src[i] == '}':
                depth -= 1
                if depth == 0: end = i; break
        if end is None: continue
        block = src[start:end+1]

        if 'getSessionUser' not in block: continue

        # گیت session را استخراج و تحلیل کن
        gate = re.search(r"  const session = await getSessionUser\(\)\n  if \(!session\) return [^\n]+\n", block)
        roles = []
        patient_self_line = None
        if gate:
            after = block[gate.end():gate.end()+400]
            for line in after.split('\n'):
                if 'session.role' not in line and not patient_self_line:
                    break
                if 'session.role' in line and 'patientId' in line:
                    patient_self_line = line  # چک خودِ بیمار — باید در بدنه بماند
                    break
                mm = re.findall(r"session\.role\s*(!==|===)\s*'([A-Z_]+)'", line)
                if mm:
                    for op, role in mm:
                        if op == '!==':
                            if role == 'PATIENT':
                                roles = ['ADMIN', 'MANAGER', 'RECEPTIONIST', 'DOCTOR', 'ACCOUNTANT']
                            else:
                                roles.append(role)
                    continue
                break

        # هندلر جدید
        has_request = 'request' in arglist
        has_params = 'params' in arglist
        wrapper_args = []
        wrapper_args.append('session')
        wrapper_args.append('request' if has_request else '_request')
        wrapper_args.append('{ params }' if has_params else None)

        if '/plans' in path:
            wrapper = f"export const {verb} = platformHandler()(async ({', '.join(a for a in wrapper_args if a)}) => {{"
        else:
            rl = ', '.join(roles)
            wrapper = f"export const {verb} = tenantHandler({rl})(async ({', '.join(a for a in wrapper_args if a)}) => {{"

        new_block = block
        if gate:
            # گیت را حذف کن (session از wrapper می‌آید)
            new_block = new_block.replace(gate.group(0), '')
            # خط نقش اضافی بعد از گیت را حذف کن (اگر الگوی ساده role-check بود)
            for line in re.findall(r"  if \((?:session\.role[^\n]*)\) ?\n?    return NextResponse\.json\(\{ error: 'دسترسی مجاز نیست' \}, \{ status: 403 \}\)\n", new_block):
                if 'patientId' in line: continue
                new_block = new_block.replace(line, '', 1)
        # جایگزینی هدر
        new_block = new_block.replace(block[:block.index('\n')], wrapper, 1)
        # بستن wrapper — آخرین } بلوک
        new_block = new_block[:new_block.rfind('}')] + '})' + new_block[new_block.rfind('}')+1:]
        # اگر session در بدنه استفاده نمی‌شود و پارامتر بی‌استفاده خطا بدهد → _
        if not re.search(r"\bsession\b", new_block[len(wrapper):]):
            new_block = new_block.replace('(session,', '(_session,', 1).replace('(session)', '()', 1) if wrapper_args[0]=='session' and not wrapper_args[1] else new_block.replace('async (session,', 'async (_session,', 1)
        src = src[:start] + new_block + src[end+1:]
        changed = True
    if changed and "from '@/lib/auth'" in src:
        src = src.replace("import { getSessionUser } from '@/lib/auth'\n", '')
        src = src.replace("import { getSessionUser, revokeAllSessions } from '@/lib/auth'", "import { revokeAllSessions } from '@/lib/auth'")
    if changed and "from '@/lib/tenant'" not in src:
        # import بعد از اولین import
        src = re.sub(r"(import [^\n]+\n)", r"\1import { tenantHandler, platformHandler } from '@/lib/tenant'\n", src, count=1)
    return src, changed

files = [f for f in glob.glob('src/app/api/**/route.ts', recursive=True)
         if not any(s in f for s in SKIP)
         and 'tenantHandler' not in open(f, encoding='utf-8').read()
         and 'platformHandler' not in open(f, encoding='utf-8').read()]
print(f'{len(files)} فایل برای تبدیل')
done = 0
for f in files:
    src = open(f, encoding='utf-8').read()
    try:
        new, changed = transform(src, f)
    except Exception as e:
        print('ERR', f, str(e)[:80]); continue
    if changed:
        open(f, 'w', encoding='utf-8').write(new)
        done += 1
print(f'تبدیل‌شده: {done}')
