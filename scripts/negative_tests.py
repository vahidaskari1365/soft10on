#!/usr/bin/env python3
"""تست منفی امنیت 10on — ماتریس نقش × مسیر حساس با نتیجه مورد انتظار و واقعی."""
import json
import urllib.request
import urllib.error

BASE = 'http://localhost:3000'

def req(method, path, body=None, cookie=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    if data:
        r.add_header('Content-Type', 'application/json')
    if cookie:
        r.add_header('Cookie', cookie)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0

def login(username):
    r = urllib.request.Request(BASE + '/api/auth/login', data=json.dumps({'username': username, 'password': '123456'}).encode(), method='POST')
    r.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            set_cookie = resp.headers.get('Set-Cookie', '')
            token = set_cookie.split(';')[0]
            return token
    except Exception:
        return None

# ——— نشست‌ها ———
C = {}
for role, user in [('patient', 'patient'), ('reception', 'reception'), ('doctor', 'doctor'), ('admin', 'manager')]:
    C[role] = login(user) or ''

BOGUS = 'sina_session=forged-token-abc.invalid.sig'
CTX = [('anon', None), ('bogus', BOGUS), ('patient', C['patient']), ('reception', C['reception']), ('doctor', C['doctor']), ('admin', C['admin'])]

def get_json(path, cookie):
    r = urllib.request.Request(BASE + path)
    if cookie:
        r.add_header('Cookie', cookie)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except Exception:
        return {}

# ——— داده‌های واقعی ———
patients = get_json('/api/patients', C['admin']).get('patients', [])
other_pid = patients[0]['id'] if patients else 'cmx-nope'
me_patient = get_json('/api/auth/me', C['patient']).get('user', {})
own_pid = me_patient.get('patientId') or 'cmx-nope'
appts = get_json('/api/appointments', C['admin']).get('appointments', get_json('/api/appointments', C['admin']).get('items', []))
if not appts:
    appts = get_json('/api/appointments?date=2026-11-20', C['admin']).get('appointments', [])
appt_id = appts[0]['id'] if appts else 'cmx-nope'
tasks = get_json('/api/tasks', C['admin'])
tasks = tasks if isinstance(tasks, list) else (tasks.get('items') or tasks.get('tasks') or [])
task_id = tasks[0]['id'] if tasks else 'cmx-nope'

# ——— ماتریس تست: (نام، متد، مسیر، بدنه، انتظارها) ———
# انتظارها به ترتیب: anon, bogus, patient, reception, doctor, admin
T = [
    ('patients_list',        'GET',    '/api/patients',                        None, [401,401,403,200,200,200]),
    ('patients_other_id',    'GET',    f'/api/patients/{other_pid}',           None, [401,401,403,200,200,200]),
    ('patients_own_id',      'GET',    f'/api/patients/{own_pid}',             None, [401,401,200,200,200,200]),
    ('appts_list',           'GET',    '/api/appointments',                    None, [401,401,403,200,200,200]),
    ('appts_post_empty',     'POST',   '/api/appointments',                    {},   [401,401,403,400,400,400]),
    ('appts_patch_invalid',  'PATCH',  f'/api/appointments/{appt_id}',         {'status':'X'}, [401,401,403,400,400,400]),
    ('tasks_list',           'GET',    '/api/tasks',                           None, [401,401,403,200,200,200]),
    ('tasks_post_empty',     'POST',   '/api/tasks',                           {},   [401,401,403,400,400,400]),
    ('tasks_patch_invalid',  'PATCH',  f'/api/tasks/{task_id}',                {'status':'X'}, [401,401,403,400,400,400]),
    ('expenses_list',        'GET',    '/api/expenses',                        None, [401,401,403,200,403,200]),
    ('finance_list',         'GET',    '/api/finance',                         None, [401,401,403,200,403,200]),
    ('finance_export',       'GET',    '/api/finance/export?month=1405-08',    None, [401,401,403,200,403,200]),
    ('checks_list',          'GET',    '/api/checks',                          None, [401,401,403,200,403,200]),
    ('cash_list',            'GET',    '/api/cash',                            None, [401,401,403,200,403,200]),
    ('inventory_list',       'GET',    '/api/inventory',                       None, [401,401,403,200,403,200]),
    ('suppliers_list',       'GET',    '/api/suppliers',                       None, [401,401,403,403,403,200]),
    ('payroll_list',         'GET',    '/api/payroll',                         None, [401,401,403,403,403,200]),
    ('reports_list',         'GET',    '/api/reports?month=1405-08',           None, [401,401,403,200,403,200]),
    ('dashboard_list',       'GET',    '/api/dashboard',                       None, [401,401,403,200,200,200]),
    ('records_other',        'GET',    f'/api/records?patient={other_pid}',    None, [401,401,403,200,200,200]),
    ('records_own',          'GET',    '/api/records',                         None, [401,401,200,400,400,400]),
    ('assistant_empty',      'POST',   '/api/assistant',                       {},   [401,401,400,400,400,400]),
    ('settings_list',        'GET',    '/api/settings',                        None, [401,401,403,403,403,200]),
    ('staff_list',           'GET',    '/api/staff',                           None, [401,401,403,200,403,200]),
    ('staff_post_empty',     'POST',   '/api/staff',                           {},   [401,401,403,403,403,400]),
    ('invoices_list',        'GET',    '/api/invoices',                        None, [401,401,403,200,200,200]),
    # — مسیرهای جدید فاز تکمیل —
    ('rooms_list',           'GET',    '/api/rooms',                           None, [401,401,403,200,200,200]),
    ('rooms_post_empty',     'POST',   '/api/rooms',                           {},   [401,401,403,403,403,400]),
    ('holidays_list',        'GET',    '/api/holidays',                        None, [401,401,403,200,200,200]),
    ('holidays_post_empty',  'POST',   '/api/holidays',                        {},   [401,401,403,403,403,400]),
    ('ledger_trial',         'GET',    '/api/ledger?view=trial',               None, [401,401,403,200,403,200]),
    ('ledger_post_empty',    'POST',   '/api/ledger',                          {},   [401,401,403,403,403,400]),
    ('prescriptions_list',   'GET',    '/api/prescriptions',                   None, [401,401,200,401,401,401]),
    ('prescriptions_post_empty', 'POST', '/api/prescriptions',               {},   [401,401,403,403,400,400]),
    ('treatments_list',      'GET',    '/api/treatments',                      None, [401,401,200,401,401,401]),
    ('treatments_post_empty','POST',   '/api/treatments',                      {},   [401,401,403,403,400,400]),
    ('audit_list',           'GET',    '/api/audit',                           None, [401,401,403,403,403,200]),
    ('services_list',        'GET',    '/api/services',                        None, [401,401,403,200,200,200]),
    ('services_post_empty',  'POST',   '/api/services',                        {},   [401,401,403,403,403,400]),
    ('plans_list',           'GET',    '/api/plans',                           None, [401,401,403,200,200,200]),
    ('tickets_list',         'GET',    '/api/tickets',                         None, [401,401,403,200,200,200]),
    ('patient_docs_list',    'GET',    f'/api/patients/{other_pid}/documents', None, [401,401,403,200,200,200]),
    ('patient_timeline',     'GET',    f'/api/patients/{other_pid}/timeline',  None, [401,401,403,200,200,200]),
    ('patient_emergency',    'GET',    f'/api/patients/{other_pid}/emergency', None, [401,401,403,200,200,200]),
    ('appt_history',         'GET',    f'/api/appointments/{appt_id}/history', None, [401,401,403,200,200,200]),
]

rows, passed, failed = [], 0, 0
for name, method, path, body, exp in T:
    actuals = []
    for label, cookie in CTX:
        code = req(method, path, body, cookie)
        actuals.append(code)
    marks = []
    ok = True
    for i, (a, e) in enumerate(zip(actuals, exp)):
        # پزشک برای patients_own هم مجاز است؛ فقط سلول‌هایی که انتظار مشخص دارند سنجیده می‌شوند
        if e == 'x':
            marks.append('·')
            continue
        good = a == e
        if not good:
            ok = False
        marks.append(('OK' if good else f"got {a}≠{e}"))
    if ok:
        passed += 1
        verdict = 'PASS'
    else:
        failed += 1
        verdict = 'FAIL'
    rows.append(f"{verdict}  {name:20s} actual={actuals} expected={exp}")

out = '\n'.join(rows)
print(out)
print(f"\nsetup: otherPatient={other_pid[:8]}… ownPatient={own_pid[:8]}… appt={appt_id[:8]}… task={task_id[:8]}…")
print(f"TOTAL={len(T)}  PASS={passed}  FAIL={failed}")
with open('/home/z/my-project/scripts/last-negative-tests.txt', 'w') as f:
    f.write(out + f"\nTOTAL={len(T)} PASS={passed} FAIL={failed}\n")
