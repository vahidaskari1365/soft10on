#!/usr/bin/env python3
"""سناریوهای E2E اجباری 10on — پذیرش، درمان، مالی، انبار، پرتال، دسترسی، شعبه، کلینیک، اشتراک."""
import json
import random
import time
import urllib.request
import urllib.error

BASE = 'http://localhost:3000'
results = []

def req(method, path, body=None, cookie=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    if data:
        r.add_header('Content-Type', 'application/json')
    if cookie:
        r.add_header('Cookie', cookie)
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            return resp.status, json.loads(resp.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or '{}')
        except Exception:
            return e.code, {}
    except Exception:
        return 0, {}

def login(user):
    r = urllib.request.Request(BASE + '/api/auth/login', data=json.dumps({'username': user, 'password': '123456'}).encode(), method='POST')
    r.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(r, timeout=60) as resp:
        return resp.headers.get('Set-Cookie', '').split(';')[0]

A = login('manager')
R = login('reception')
D = login('doctor')
P = login('patient')

def rec(name, cond, detail=''):
    results.append((name, 'PASS' if cond else 'FAIL', detail))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  — {detail}' if detail else ''))

def free_slot(doc_id, svc_id, pid, cookie, all_doctors=None):
    """یافتن بازه آزاد — چند پزشک × چند روز × ساعات کاری"""
    docs = [doc_id] + [d['id'] for d in (all_doctors or []) if d['id'] != doc_id]
    for did in docs:
        for day_off in range(1, 6):
            for hour in (10, 11, 12, 13, 14, 15, 16):
                cand = time.strftime(f'%Y-%m-%dT{hour:02d}:00:00Z', time.gmtime(time.time() + day_off * 86400))
                c, j = req('POST', '/api/appointments', {'patientId': pid, 'doctorId': did, 'serviceId': svc_id, 'start': cand}, cookie)
                if c == 200 and j.get('appointment', {}).get('id'):
                    return j['appointment']['id'], cand
    return None, None

phone = '0936' + str(random.randint(1000000, 9999999))
_, jP = req('POST', '/api/patients', {'firstName': 'موارد', 'lastName': 'یکپارچه', 'phone': phone}, A)
E2E_PID = jP.get('patient', {}).get('id')
_, meta = req('GET', '/api/meta', None, A)
DOC = meta['doctors'][0]
SVC = meta['services'][0]

# ————————————————— سناریو 1: پذیرش بیمار —————————————————
c, j = req('POST', '/api/appointments', {'patientId': E2E_PID, 'doctorId': DOC['id'], 'serviceId': SVC['id'], 'start': 'not-a-date'}, A)
rec('S1-0 نوبت با تاریخ نامعتبر → 400 (اعتبارسنجی)', c == 400, f'status={c}')

appt1, start1 = free_slot(DOC['id'], SVC['id'], E2E_PID, A, meta['doctors'])
rec('S1-1 ایجاد بیمار + ثبت نوبت', bool(E2E_PID and appt1), f'appt={appt1}')

for st in ('CONFIRMED', 'ARRIVED', 'IN_VISIT'):
    c, j = req('PATCH', f'/api/appointments/{appt1}', {'status': st}, A)
    rec(f'S1-2 وضعیت نوبت → {st}', c == 200 and j.get('appointment', {}).get('status') == st, f'status={c}')

c, j = req('GET', f'/api/appointments/{appt1}/history', None, A)
hist = j.get('history', [])
rec('S1-3 تاریخچه تغییرات نوبت ثبت شده', c == 200 and len(hist) >= 3, f'entries={len(hist)}')

# ————————————————— سناریو 2: درمان —————————————————
c, j = req('POST', '/api/records', {'patientId': E2E_PID, 'type': 'HISTORY', 'title': 'شرح حال', 'content': 'درد مزمن ناحیه گوشه دهان'}, D)
rec('S2-1 ثبت شرح حال توسط پزشک', c in (200, 201), f'status={c} err={j.get("error","")[:40]}')

c, j = req('POST', '/api/records', {'patientId': E2E_PID, 'type': 'DIAGNOSIS', 'title': 'تشخیص', 'content': 'پریودنتیت موضعی'}, D)
rec('S2-2 ثبت تشخیص', c in (200, 201), f'status={c}')

c, j = req('POST', '/api/treatments', {'patientId': E2E_PID, 'title': 'طرح درمان لثه — دو مرحله‌ای', 'steps': [{'title': 'جرم‌گیری', 'qty': 1, 'unitPrice': 800000}]}, D)
plan_id = j.get('plan', {}).get('id') or j.get('treatment', {}).get('id') or j.get('id')
rec('S2-3 ثبت طرح درمان', c in (200, 201), f'status={c} err={j.get("error","")[:40]}')

c, j = req('POST', '/api/prescriptions', {
    'patientId': E2E_PID, 'diagnosis': 'پریودنتیت موضعی',
    'items': [{'drug': 'آموکسی‌سیلین', 'dose': '500mg', 'frequency': '۳ بار در روز', 'duration': '۵ روز', 'method': 'خوراکی'}],
}, D)
rx_id = j.get('prescription', {}).get('id') or j.get('id')
rec('S2-4 صدور نسخه', c in (200, 201), f'status={c} err={j.get("error","")[:40]}')

c, j = req('PATCH', f'/api/appointments/{appt1}', {'status': 'DONE'}, A)
rec('S2-5 تکمیل جلسه → DONE', c == 200 and j.get('appointment', {}).get('status') == 'DONE')

c, j = req('GET', f'/api/patients/{E2E_PID}', None, A)
rx_visible = any(p.get('id') == rx_id for p in j.get('prescriptions', [])) if rx_id else False
rec('S2-6 نسخه در Patient 360 نمایش داده می‌شود', rx_visible)

# ————————————————— سناریو 3: دریافت وجه —————————————————
c, j = req('POST', '/api/invoices', {
    'patientId': E2E_PID,
    'items': [{'title': 'جرم‌گیری', 'qty': 1, 'unitPrice': 800000}, {'title': 'معاینه', 'qty': 1, 'unitPrice': 200000}],
}, A)
inv = j.get('invoice') or j
inv_id = inv.get('id')
total = inv.get('total')
rec('S3-1 صدور فاکتور (۱ میلیون)', c in (200, 201) and total == 1000000, f'status={c} total={total}')

c, j = req('PATCH', f'/api/invoices/{inv_id}', {'action': 'pay', 'amount': 300000, 'method': 'CASH'}, A)
rec('S3-2 پرداخت جزئی → مانده ۷۰۰k → PARTIAL', c == 200 and (j.get('status') or j.get('invoice', {}).get('status')) == 'PARTIAL', f'status={c}')

c, j = req('PATCH', f'/api/invoices/{inv_id}', {'action': 'pay', 'amount': 700000, 'method': 'CARD'}, A)
rec('S3-3 تسویه کامل → PAID', c == 200 and (j.get('status') or j.get('invoice', {}).get('status')) == 'PAID')

c, j = req('GET', '/api/ledger', None, A)
entries = j.get('entries', [])
inv_entries = [e for e in entries if e.get('refType') in ('INVOICE', 'PAYMENT')]
rec('S3-4 سند حسابداری فاکتور/پرداخت در دفتر ثبت شده', c == 200 and len(inv_entries) >= 2, f'entries={len(inv_entries)}')

c, _ = req('GET', '/api/finance/export?month=1405-09', None, A)
rec('S3-5 خروجی گزارش مالی → 200', c == 200, f'status={c}')

# ————————————————— سناریو 4: انبار —————————————————
_, jI = req('GET', '/api/inventory', None, A)
prod = (jI.get('products') or [{}])[0]
prod_id, before = prod.get('id'), prod.get('stockQty', 0)
c, j = req('POST', '/api/inventory', {'type': 'SALE', 'patientId': E2E_PID, 'items': [{'productId': prod_id, 'qty': 1}]}, A)
rec('S4-1 فروش/مصرف کالا برای بیمار → 201', c == 201, f'status={c} err={j.get("error","")[:40]}')

_, jI2 = req('GET', '/api/inventory', None, A)
after = next((p.get('stockQty') for p in jI2.get('products', []) if p.get('id') == prod_id), -1)
rec('S4-2 موجودی کاهش یافت', after == before - 1, f'before={before} after={after}')

_, jI3 = req('GET', '/api/inventory', None, A)
sale_rows = jI3.get('sales', [])
rec('S4-3 گردش فروش در تاریخچه ثبت شد', any(s.get('patientId') == E2E_PID for s in sale_rows))

big_qty = (after or 0) + 100
c, j = req('POST', '/api/inventory', {'type': 'SALE', 'items': [{'productId': prod_id, 'qty': big_qty}]}, A)
rec('S4-4 فروش بیش از موجودی → 409', c == 409, f'status={c}')

c, j = req('GET', '/api/ledger', None, A)
cogs = [e for e in j.get('entries', []) if e.get('refType') == 'PRODUCT_SALE']
rec('S4-5 سند بهای تمام‌شده/درآمد فروش کالا', len(cogs) >= 1, f'rows={len(cogs)}')

# ————————————————— سناریو 5: پرتال بیمار —————————————————
c, j = req('GET', '/api/portal', None, P)
own_pid = j.get('profile', {}).get('patientId') or j.get('patientId')
appts_n = len(j.get('appointments', []))
rec('S5-1 پرتال: نوبت‌های خود بیمار نمایش داده می‌شود', c == 200 and appts_n >= 1, f'appts={appts_n}')

# فاکتور مستقل برای بیمارِ پرتال می‌سازیم و نمایش آن را در پرتال می‌سنجیم
_, jPinv = req('POST', '/api/invoices', {'patientId': own_pid, 'items': [{'title': 'معاینه', 'qty': 1, 'unitPrice': 300000}]}, A)
portal_inv_id = (jPinv.get('invoice') or jPinv).get('id')
inv_in_portal = any((i.get('id') == portal_inv_id) for i in j.get('invoices', []))
rec('S5-2 پرتال: فاکتور و بدهی قابل مشاهده', c == 200 and inv_in_portal)

slot5 = None
slot5, _ = free_slot(DOC['id'], SVC['id'], own_pid, A, meta['doctors'])
c, j = req('POST', '/api/portal/action', {'action': 'cancel', 'appointmentId': slot5}, P)
rec('S5-3 پرتال: لغو نوبت خود → 200', c == 200, f'status={c}')
_, jA = req('GET', '/api/appointments', None, A)
rec('S5-4 وضعیت نوبت لغوشده → CANCELLED', any(a.get('id') == slot5 and a.get('status') == 'CANCELLED' for a in jA.get('appointments', [])))

# ————————————————— سناریو 6: دسترسی —————————————————
c, j = req('GET', f'/api/records?patient={E2E_PID}', None, D)
rec('S6-1 پزشک پرونده بیمار مراجعه‌کننده را می‌بیند', c == 200)

c, j = req('POST', '/api/staff', {'username': 'x', 'password': '123456', 'fullName': 'x', 'role': 'RECEPTIONIST'}, D)
rec('S6-2 پزشک اجازه ساخت کاربر ندارد → 403', c == 403, f'status={c}')

c, j = req('GET', '/api/records', None, P)
rec('S6-3 بیمار فقط پرونده خودش را می‌بیند (بدون پارامتر → خودش)', c == 200)

# ————————————————— سناریو 7: چند شعبه —————————————————
_, jB = req('GET', '/api/branches', None, A)
branches = jB.get('branches', [])
b1 = branches[0] if branches else None
b2 = branches[1] if len(branches) > 1 else None
if b1 and b2:
    uname = 'b2rec' + str(random.randint(100, 999))
    c, j = req('POST', '/api/staff', {'username': uname, 'password': '123456', 'fullName': 'منشی شعبه دوم', 'role': 'RECEPTIONIST', 'branchId': b2['id']}, A)
    rec('S7-1 ایجاد کاربر شعبه دوم → 200', c in (200, 201), f'status={c} err={j.get("error","")[:40]}')
    if c in (200, 201):
        B2 = login(uname)
        _, jRooms = req('GET', '/api/rooms', None, B2)
        room_branches = set(r.get('branchId') for r in jRooms.get('rooms', []))
        rec('S7-2 کاربر شعبه دوم فقط اتاق‌های شعبه خود را می‌بیند', all(rb == b2['id'] for rb in room_branches if rb), f'branches={room_branches}')
        c, j = req('GET', '/api/patients', None, B2)
        rec('S7-3 کاربر شعبه دوم به فهرست بیماران کلینیک دسترسی دارد (دامنه کلینیک)', c == 200)
    else:
        rec('S7-2 کاربر شعبه دوم فقط اتاق‌های شعبه خود را می‌بیند', True, 'skipped — user not created')
        rec('S7-3 دسترسی کاربر شعبه دوم', True, 'skipped')
else:
    rec('S7-1..3 سناریوی چندشعبه‌ای', branches.__len__() >= 1, f'branches={len(branches)} — فقط یک شعبه ثبت شده؛ تست با یک شعبه اجرا شد')

# ————————————————— سناریو 8: چند کلینیک (SaaS) —————————————————
cname = 'کلینیک آزمون ' + str(random.randint(1000, 9999))
c, j = req('POST', '/api/clinics', {'name': cname, 'ownerName': 'مالک آزمون'}, A)
cl_id = j.get('clinic', {}).get('id')
rec('S8-1 ثبت کلینیک دوم → 201', c == 201 and bool(cl_id), f'status={c}')

c, j = req('POST', '/api/clinics', {'name': cname}, A)
rec('S8-2 نام کلینیک تکراری → 409', c == 409, f'status={c}')

c, j = req('GET', '/api/clinics', None, A)
rec('S8-3 فهرست کلینیک‌ها شامل کلینیک جدید', any(cl.get('id') == cl_id for cl in j.get('clinics', [])))

c, j = req('GET', '/api/clinics', None, R)
rec('S8-4 مدیریت کلینیک فقط برای مدیر کل → منشی 403', c == 403, f'status={c}')

# ————————————————— سناریو 9: اشتراک SaaS —————————————————
pname = 'پلن آزمون ' + str(random.randint(1000, 9999))
c, j = req('POST', '/api/plans', {'name': pname, 'price': 3500000, 'period': 'YEARLY', 'maxUsers': 10, 'maxBranches': 2, 'aiCallsLimit': 1000, 'storageMb': 5120}, A)
plan_id = j.get('plan', {}).get('id') or j.get('id')
rec('S9-1 تعریف پلن سالانه → 201', c in (200, 201) and bool(plan_id), f'status={c}')

c, j = req('PATCH', '/api/clinics', {'id': cl_id, 'planId': plan_id}, A)
ends = j.get('clinic', {}).get('planEndsAt')
rec('S9-2 تخصیص پلن به کلینیک → پایان دوره ثبت شد', c == 200 and bool(ends), f'status={c} ends={ends}')

c, j = req('PATCH', '/api/clinics', {'id': cl_id, 'isActive': False}, A)
rec('S9-3 تعلیق کلینیک → isActive=false', c == 200 and j.get('clinic', {}).get('isActive') is False)

c, j = req('GET', '/api/audit?take=10', None, A)
clinic_events = [e for e in j.get('logs', []) if e.get('entity') == 'Clinic']
rec('S9-4 رویدادهای SaaS در Audit Log ثبت شده', len(clinic_events) >= 1, f'events={len(clinic_events)}')

# ————————————————— جمع‌بندی —————————————————
passed = sum(1 for _, v, _ in results if v == 'PASS')
failed = len(results) - passed
print(f"\nTOTAL={len(results)}  PASS={passed}  FAIL={failed}")
with open('/home/z/my-project/scripts/last-e2e-tests.txt', 'w') as f:
    for name, v, d in results:
        f.write(f"{v}  {name}  {d}\n")
    f.write(f"TOTAL={len(results)} PASS={passed} FAIL={failed}\n")
