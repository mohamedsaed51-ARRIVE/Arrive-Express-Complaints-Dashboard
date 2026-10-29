// اختبارات أمان لوحة الشكاوى — بيانات اصطناعية فقط. Chart.js يُستبدل بـ tests/chart-stub.js (CDN محجوب).
// التشغيل: node tests/security.test.js     INDEX=<مسار> لاختبار نسخة أخرى.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const INDEX = process.env.INDEX || path.join(__dirname, '..', 'index.html');
const STUB = fs.readFileSync(path.join(__dirname, 'chart-stub.js'), 'utf8');
const X = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
const ATTR = '" autofocus onfocus="window.__xss=(window.__xss||0)+1" x="';
let pass = 0, fail = 0;
const check = (n, c, extra) => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c || extra === undefined ? '' : ' ' + JSON.stringify(extra))); };
const base = (i) => ({ id: String(100 + i), owner: 'منى', admin: 'x', complainant: 'عميل ' + i, policy: 'P' + i, content: 'محتوى عادي "بين علامتين" & رمز', type: 'شكوى تخص التوصيل', date_added: '2026-06-1' + (i % 9), investigation_result_date: '2026-06-2' + (i % 9), month: 'يونيو', branch: 'الرئيسى', classification: 'تصنيف', investigation_result: 'تم التحقيق', status: 'جارى التحقيق', compensation_amount: 100 + i, compensation_bearer: 'الفرع', compensation_review_result: '', confirm_review: '', review_date: '', compensation_date: '', sla_days: 1, faulty_person: '', notes: 'ملاحظة' });
const FIELDS = ['owner', 'admin', 'complainant', 'policy', 'content', 'type', 'branch', 'classification', 'investigation_result', 'status', 'compensation_bearer', 'compensation_review_result', 'confirm_review', 'faulty_person', 'notes'];
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
  const logs = []; pg.on('console', (m) => logs.push(m.text()));
  await pg.route('**/*', (r) => { const u = r.request().url();
    if (u.includes('Chart.js')) return r.fulfill({ status: 200, contentType: 'text/javascript', body: STUB });
    return u.startsWith('file:') ? r.continue() : r.abort(); });
  await pg.addInitScript(() => { window.__blobs = []; const o = URL.createObjectURL; URL.createObjectURL = (b) => { window.__blobs.push(b); return o.call(URL, b); }; });
  await pg.goto('file://' + INDEX, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(2000);
  // صفوف ضارة: كل حقل بحمولة وسم، وبعضها بحمولة كسر attribute، + صفوف CSV الصيغ + صف عادي
  const rows = [];
  FIELDS.forEach((f, i) => { rows.push(Object.assign(base(i), { [f]: X + f })); rows.push(Object.assign(base(i + 50), { [f]: ATTR })); });
  rows.push(Object.assign(base(90), { complainant: '=HYPERLINK("http://x","c")', owner: '+1+1', branch: '-2+3', content: '@SUM(1)' }));
  rows.push(Object.assign(base(91), { complainant: 'اسم عادي - A+B', content: 'نص عادي', compensation_amount: -5 }));
  await pg.evaluate((r) => renderDataset(r), rows);
  await pg.waitForTimeout(2500);
  // CSV (التصدير السريع + تصدير لوحة المقارنة)
  await pg.evaluate("document.getElementById('qaExport').click()"); await pg.waitForTimeout(400);
  await pg.evaluate("exportPanelCsv('L')"); await pg.waitForTimeout(400);
  const outs = await pg.evaluate(async () => Promise.all(window.__blobs.map((x) => x.text())));
  check('CSV: تم توليد ملفين', outs.length >= 2, outs.length);
  // تفاعل: فتح نافذة التفاصيل لعدة صفوف، فتح كل خانات الفلاتر، فتح التقرير
  await pg.evaluate(() => { document.querySelectorAll('.ms-option input[type=checkbox]').forEach((c) => { if (!c.checked) c.click(); }); });
  await pg.waitForTimeout(800);
  for (let i = 0; i < 12; i++) { await pg.evaluate((k) => { const r = document.querySelectorAll('#tbody tr, tbody tr')[k]; if (r) r.click(); }, i); await pg.waitForTimeout(80); }
  await pg.evaluate(() => { DATA.slice(0, 40).forEach((d) => { try { openModal(d); } catch (e) {} }); });
  await pg.evaluate(() => { try { window.ArriveReport && window.ArriveReport.open(); } catch (e) {} });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => { document.querySelectorAll('[onfocus],[autofocus]').forEach((e) => e.focus && e.focus()); });
  check('تسجيل التشخيص: لا [TRACE] في Console افتراضيًا', !logs.some((t) => t.includes('[TRACE]')), logs.filter((t) => t.includes('[TRACE]')).slice(0, 2));
  const reportOk = await pg.evaluate(() => { try { const h = document.body.innerHTML; return /rp-cover|rp-page/.test(h); } catch (e) { return false; } });
  check('التقرير يُبنى بعد استبدال eval (يحوي صفحات التقرير)', reportOk);
  const n = await pg.evaluate('window.__xss||0');
  check('XSS: لا تنفيذ لأي حمولة (15 حقلًا × وسم/attribute — جدول، نوافذ، تقرير، فلاتر)', n === 0, n);
  check('XSS: لا img[onerror] ولا onfocus في DOM', (await pg.evaluate("document.querySelectorAll('img[onerror],[onfocus]').length")) === 0);
  check('الوظيفة: النص العادي ظاهر بعلاماته (اسم عادي - A+B)', await pg.evaluate("document.body.innerText.includes('اسم عادي - A+B')"));
  check('لا أخطاء JavaScript', errs.length === 0, errs.slice(0, 2));
  for (const [i, o] of outs.slice(0, 2).entries()) {
    const body = o.replace(/^\ufeff/, '').split('\r\n').slice(1).join('\n');
    // خلية نصية خطرة = تبدأ بـ = + @ Tab أو بـ - ليست رقمًا خالصًا (الرقم السالب الحقيقي مسموح)
    const bad = body.match(/(^|,)"([=+@\t]|-(?!\d+(\.\d+)?"))/gm) || [];
    check(`CSV #${i + 1}: لا خلية نصية خطرة (= + - @ Tab)`, bad.length === 0, bad.slice(0, 3));
  }
  const o1 = outs[0] || ''; if (process.env.DBG) console.log('DBG lines', o1.split('\r\n').length, 'hasHYP', o1.includes('HYPERLINK'), o1.split('\r\n').slice(-3));
  check("CSV #1: القيم الخطرة سبقها ' (=HYPERLINK, +1+1, -2+3)", o1.includes("\"'=HYPERLINK(") && o1.includes("\"'+1+1\"") && o1.includes("\"'-2+3\""));
  check('CSV #1: القيمة العادية والرقم السالب -5 لم يتغيرا', o1.includes('اسم عادي - A+B') && o1.includes('"-5"'));
  await b.close();
  console.log(`\n${pass}/${pass + fail} اختبارًا ناجحًا`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
