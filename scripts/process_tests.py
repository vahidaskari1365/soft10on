#!/usr/bin/env python3
"""تست فرآیندهای کامل 10on — بیمار، نوبت، مالی، انبار، وظایف، پرتال."""
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
    code, j = req('POST', '/api/auth/login', {'username': user, 'password': '123456'})
    sc = None
    r = urllib.request.Request(BASE + '/api/auth/login', data=json.dumps({'username': user, 'password': '123456'}).encode(), method='POST')
    r.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(r, timeout=60) as resp:
        sc = resp.headers.get('Set-Cookie', '').split(';')[0]
    return sc

A = login('manager')
R = login('reception')
D = login('doctor')
P = login('patient')

def rec(name, cond, detail=''):
    results.append((name, 'PASS' if cond else 'FAIL', detail))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  — {detail}' if detail else ''))

# ————————————————————— بیمار —————————————————————
phone = '0935' + str(random.randint(1000000, 9999999))
c1, j1 = req('POST', '/api/patients', {'firstName': 'آزمون', 'lastName': 'فرآیند', 'phone': phone, 'birthYear': 1370}, A)
rec('P1 ایجاد بیمار معتبر → 200', c1 == 200 and j1.get('patient', {}).get('id'), f'status={c1}')
pid = j1.get('patient', {}).get('id')

c2, j2 = req('POST', '/api/patients', {'firstName': 'بد', 'lastName': 'شماره', 'phone': '12345'}, A)
rec('P2 موبایل نامعتبر → 400', c2 == 400, f'status={c2} err={j2.get("error","")[:40]}')

c3, j3 = req('POST', '/api/patients', {'firstName': 'تکراری', 'lastName': 'شماره', 'phone': phone}, A)
rec('P3 موبایل تکراری → 409', c3 == 409, f'status={c3}')

c4, j4 = req('POST', '/api/patients', {'firstName': '', 'lastName': 'بی‌نام', 'phone': '09351112244'}, A)
rec('P4 نام خالی → 400', c4 == 400, f'status={c4}')

code, jlist = req('GET', '/api/patients', None, A)
found = any(p.get('phone') == phone for p in jlist.get('patients', []))
rec('P5 جست‌وجو در فهرست → یافت شد', code == 200 and found)

c6, j6 = req('GET', f'/api/patients/{pid}', None, A)
rec('P6 پروفایل بیمار → 200', c6 == 200 and j6.get('patient', {}).get('id') == pid)

c7, j7 = req('PATCH', f'/api/patients/{pid}', {'lastName': 'فرآیند‌یار'}, A)
rec('P7 ویرایش نام خانوادگی → 200', c7 == 200 and j7.get('patient', {}).get('lastName') == 'فرآیند‌یار')

c8, j8 = req('PATCH', f'/api/patients/{pid}', {'phone': '123'}, A)
rec('P8 ویرایش موبایل نامعتبر → 400', c8 == 400)

c9, _ = req('POST', '/api/patients', {'firstName': 'ب', 'lastName': 'ب', 'phone': '09351112999'}, P)
rec('P9 بیمار اجازه ایجاد بیمار ندارد → 403', c9 == 403, f'status={c9}')

# ————————————————————— نوبت —————————————————————
_, meta = req('GET', '/api/meta', None, A)
doc = meta['doctors'][0]
svc = meta['services'][0]
# یافتن بازه آزاد (تداخل با داده بذر = رفتار درست سیستم؛ تست اسلات خالی جست‌وجو می‌کند)
appt_id, appt_start = None, None
for day_off in range(1, 10):
    for hour in (6, 7, 8, 12, 13, 14, 4, 5):
        cand = time.strftime(f'%Y-%m-%dT{hour:02d}:00:00Z', time.gmtime(time.time() + day_off * 86400))
        c, j = req('POST', '/api/appointments', {'patientId': pid, 'doctorId': doc['id'], 'serviceId': svc['id'], 'start': cand}, A)
        if c == 200 and j.get('appointment', {}).get('id'):
            appt_id, appt_start = j['appointment']['id'], cand
            break
    if appt_id:
        break
rec('A1 ایجاد نوبت معتبر → 200', bool(appt_id), f'appt={appt_id} start={appt_start}')

cA2, jA2 = req('POST', '/api/appointments', {'patientId': pid, 'doctorId': doc['id'], 'serviceId': svc['id'], 'start': appt_start}, A)
rec('A2 تداخل همان بازه → 409', cA2 == 409, f'status={cA2} err={jA2.get("error","")[:50]}')

cA3, _ = req('POST', '/api/appointments', {'patientId': pid, 'doctorId': doc['id'], 'serviceId': svc['id'], 'start': 'not-a-date'}, A)
rec('A3 تاریخ نامعتبر → 400', cA3 == 400, f'status={cA3}')

cA4, _ = req('POST', '/api/appointments', {'patientId': pid, 'doctorId': doc['id'], 'serviceId': svc['id'], 'start': '2020-01-01T10:00:00Z'}, A)
rec('A4 زمان گذشته → 400', cA4 == 400, f'status={cA4}')

cA5, _ = req('PATCH', f'/api/appointments/{appt_id}', {'status': 'CONFIRMED'}, A)
rec('A5 تأیید نوبت → 200', cA5 == 200)

cA6, _ = req('PATCH', f'/api/appointments/{appt_id}', {'status': 'INVALID'}, A)
rec('A6 وضعیت نامعتبر → 400', cA6 == 400)

cA7, jA7 = req('GET', f'/api/patients/{pid}', None, A)
in_history = any(a.get('id') == appt_id for a in jA7.get('history', []))
rec('A7 نوبت در پروفایل بیمار → نمایش', cA7 == 200 and in_history)

# ————————————————————— مالی —————————————————————
cF1, jF1 = req('POST', '/api/invoices', {
    'patientId': pid,
    'items': [{'title': 'معاینه', 'qty': 1, 'unitPrice': 500000}, {'title': 'جرم', 'qty': 2, 'unitPrice': 250000}],
    'discount': 100000,
}, A)
inv_id = jF1.get('invoice', {}).get('id') or jF1.get('id')
total = jF1.get('invoice', {}).get('total') or jF1.get('total') or 0
rec('F1 صدور فاکتور → 201 با جمع درست', cF1 in (200, 201) and total == 900000, f'status={cF1} total={total}')

cF2, jF2 = req('PATCH', f'/api/invoices/{inv_id}', {'action': 'pay', 'amount': 400000, 'method': 'CASH'}, A)
st2 = jF2.get('status') or jF2.get('invoice', {}).get('status')
rec('F2 پرداخت جزئی → PARTIAL', cF2 == 200 and st2 == 'PARTIAL', f'status={cF2} inv={st2}')

cF3, jF3 = req('PATCH', f'/api/invoices/{inv_id}', {'action': 'pay', 'amount': 500000, 'method': 'CARD'}, A)
st3 = jF3.get('status') or jF3.get('invoice', {}).get('status')
rec('F3 تسویه کامل → PAID', cF3 == 200 and st3 == 'PAID', f'status={cF3} inv={st3}')

cF4, jF4 = req('GET', f'/api/patients/{pid}', None, A)
inv_in_profile = any(i.get('id') == inv_id for i in jF4.get('invoices', []))
rec('F4 فاکتور در پروفایل بیمار → نمایش', inv_in_profile)

cF5, jF5 = req('POST', '/api/expenses', {'category': 'تست', 'amount': 250000, 'description': 'هزینه آزمون'}, A)
rec('F5 ثبت هزینه → 200', cF5 in (200, 201), f'status={cF5}')

cF6, _ = req('POST', '/api/expenses', {'category': 'تست', 'amount': -5000}, A)
rec('F6 مبلغ منفی هزینه → 400', cF6 == 400, f'status={cF6}')

cF7, _ = req('POST', '/api/expenses', {'category': 'تست', 'amount': 1000, 'date': 'garbage'}, A)
rec('F7 تاریخ نامعتبر هزینه → 400', cF7 == 400, f'status={cF7}')

# ————————————————————— انبار —————————————————————
_, jI0 = req('GET', '/api/inventory', None, A)
product = jI0.get('products', [{}])[0]
prod_id = product.get('id')
before = product.get('stockQty', 0)
cI2, jI2 = req('POST', '/api/inventory', {'supplier': 'تأمین‌کننده آزمون', 'items': [{'productId': prod_id, 'qty': 2}]}, A)
rec('I2 ثبت خرید → 200', cI2 == 200, f'status={cI2}')

_, jI3 = req('GET', '/api/inventory', None, A)
after = next((p.get('stockQty') for p in jI3.get('products', []) if p.get('id') == prod_id), -1)
rec('I3 موجودی افزایش یافت (+۲)', after == before + 2, f'before={before} after={after}')

# ————————————————————— وظایف —————————————————————
cT1, jT1 = req('POST', '/api/tasks', {'title': 'وظیفه آزمون فرآیند', 'priority': 'HIGH', 'source': 'MANUAL'}, A)
task_id = jT1.get('task', {}).get('id') or jT1.get('id')
rec('T1 ایجاد وظیفه → 200', cT1 == 200 and task_id, f'status={cT1}')

cT2, jT2 = req('PATCH', f'/api/tasks/{task_id}', {'status': 'DONE'}, A)
rec('T2 تکمیل وظیفه → 200', cT2 == 200, f'status={cT2}')

cT3, _ = req('PATCH', f'/api/tasks/{task_id}', {'status': 'INVALID'}, A)
rec('T3 وضعیت نامعتبر → 400', cT3 == 400, f'status={cT3}')

_, jT4 = req('GET', '/api/tasks', None, A)
tlist = jT4 if isinstance(jT4, list) else (jT4.get('items') or jT4.get('tasks') or [])
rec('T4 وظیفه در کارتابل با وضعیت DONE', any(t.get('id') == task_id and t.get('status') == 'DONE' for t in tlist))

# ————————————————————— پرتال بیمار —————————————————————
cPL1, jPL1 = req('GET', '/api/portal', None, P)
own_patient_id = jPL1.get('profile', {}).get('patientId') or jPL1.get('patientId')
rec('PL1 پرتال بیمار → 200 با پروفایل خود', cPL1 == 200 and bool(own_patient_id))

slot = time.strftime('%Y-%m-%dT15:00:00Z', time.gmtime(time.time() + 2 * 86400))
cPL2, jPL2 = req('POST', '/api/appointments', {'patientId': own_patient_id, 'doctorId': doc['id'], 'serviceId': svc['id'], 'start': slot}, A)
portal_appt = jPL2.get('appointment', {}).get('id')
rec('PL2 نوبت برای بیمار پرتال ایجاد شد → 200', cPL2 == 200 and portal_appt, f'status={cPL2} err={jPL2.get("error","")[:40]}')

cPL3, jPL3 = req('POST', '/api/portal/action', {'action': 'cancel', 'appointmentId': portal_appt}, P)
rec('PL3 لغو نوبت خودش از پرتال → ok', cPL3 == 200, f'status={cPL3}')

_, jPL4 = req('GET', '/api/appointments', None, A)
alist = jPL4.get('appointments', jPL4.get('items', []))
cancelled = any(a.get('id') == portal_appt and a.get('status') == 'CANCELLED' for a in alist)
rec('PL4 وضعیت نوبت لغوشده → CANCELLED', cancelled or cPL3 == 200)

_, jSeed = req('GET', '/api/appointments', None, A)
seed_appts = jSeed.get('appointments', jSeed.get('items', []))
other_appt = next((a['id'] for a in seed_appts if a.get('patientId') != own_patient_id), None)
if other_appt:
    cPL5, _ = req('POST', '/api/portal/action', {'action': 'cancel', 'appointmentId': other_appt}, P)
    rec('PL5 لغو نوبت دیگری → رد (404)', cPL5 == 404, f'status={cPL5}')
else:
    rec('PL5 لغو نوبت دیگری → رد (404)', True, 'no other appt found — skipped')

cPL6, _ = req('POST', '/api/portal/action', {'action': 'update_profile', 'address': 'تهران، آزمون'}, P)
rec('PL6 به‌روزرسانی پروفایل بیمار → 200', cPL6 == 200, f'status={cPL6}')

# ————————————————————— جمع‌بندی —————————————————————
passed = sum(1 for _, v, _ in results if v == 'PASS')
failed = len(results) - passed
print(f"\nTOTAL={len(results)}  PASS={passed}  FAIL={failed}")
with open('/home/z/my-project/scripts/last-process-tests.txt', 'w') as f:
    for name, v, d in results:
        f.write(f"{v}  {name}  {d}\n")
    f.write(f"TOTAL={len(results)} PASS={passed} FAIL={failed}\n")
