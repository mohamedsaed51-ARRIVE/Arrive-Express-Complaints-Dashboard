/* Optional ARRIVE AI assistant. Does not override existing dashboard functions. */
(function () {
  'use strict';
  if (window.__ARRIVE_AI_MOUNTED__) return;
  window.__ARRIVE_AI_MOUNTED__ = true;

  const css = [
    '#arrive-ai-launcher{position:fixed;z-index:9997;left:22px;bottom:22px;border:0;border-radius:999px;padding:13px 18px;background:#0837C9;color:#fff;font:700 14px/1.2 Cairo,Arial,sans-serif;box-shadow:0 8px 28px #102c2830;cursor:pointer;display:flex;gap:9px;align-items:center}',
    '#arrive-ai-panel{position:fixed;z-index:9998;left:22px;bottom:82px;width:min(440px,calc(100vw - 28px));max-height:min(76vh,720px);display:none;flex-direction:column;background:#fff;color:#0F172A;border:1px solid #E2E8F0;border-radius:18px;box-shadow:0 18px 60px #102c2833;overflow:hidden;font-family:Cairo,Arial,sans-serif}',
    '#arrive-ai-panel.is-open{display:flex}#arrive-ai-panel *{box-sizing:border-box}',
    '.arrive-ai-head{padding:15px 16px;background:#0837C9;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:10px}',
    '.arrive-ai-head strong{font-size:15px}.arrive-ai-head small{display:block;opacity:.85;margin-top:4px;font-size:11px}.arrive-ai-head button{border:0;background:transparent;color:#fff;font-size:22px;cursor:pointer}',
    '.arrive-ai-body{padding:14px;overflow:auto;display:flex;flex-direction:column;gap:10px}.arrive-ai-note{font-size:12px;line-height:1.7;color:#64748B}',
    '.arrive-ai-code{display:flex;gap:7px}.arrive-ai-code input,.arrive-ai-question{width:100%;border:1px solid #CBD5E1;border-radius:10px;padding:10px;background:#fff;color:#0F172A;font:inherit}',
    '.arrive-ai-question{min-height:84px;resize:vertical;line-height:1.6}.arrive-ai-btn{border:0;border-radius:10px;padding:10px 13px;background:#0837C9;color:#fff;font:600 13px Cairo,Arial,sans-serif;cursor:pointer;white-space:nowrap}',
    '.arrive-ai-btn.secondary{background:#F1F5F9;color:#0F172A}.arrive-ai-quick{display:flex;flex-wrap:wrap;gap:6px}.arrive-ai-quick button{border:1px solid #CBD5E1;background:#fff;color:#0F172A;border-radius:999px;padding:7px 9px;font:12px Cairo,Arial,sans-serif;cursor:pointer}',
    '.arrive-ai-answer{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8;font-size:13px;padding:12px;background:#F8FAFC;border-radius:12px;min-height:50px}.arrive-ai-status{font-size:12px;color:#64748B;min-height:18px}.arrive-ai-actions{display:flex;gap:8px;align-items:center}',
    '#arrive-ai-launcher:focus-visible,#arrive-ai-panel button:focus-visible,#arrive-ai-panel input:focus-visible,#arrive-ai-panel textarea:focus-visible{outline:3px solid #00C7E6;outline-offset:2px}',
    '@media(max-width:520px){#arrive-ai-launcher{left:12px;bottom:12px}#arrive-ai-panel{left:10px;bottom:70px;width:calc(100vw - 20px);max-height:80vh}}'
  ].join('');
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const launcher = document.createElement('button');
  launcher.id = 'arrive-ai-launcher';
  launcher.type = 'button';
  launcher.innerHTML = '<span aria-hidden="true">✦</span><span>مساعد ARRIVE الذكي</span>';
  launcher.setAttribute('aria-haspopup', 'dialog');
  launcher.setAttribute('aria-controls', 'arrive-ai-panel');
  launcher.setAttribute('aria-expanded', 'false');

  const panel = document.createElement('section');
  panel.id = 'arrive-ai-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-labelledby', 'arrive-ai-title');
  panel.innerHTML = [
    '<header class="arrive-ai-head"><div><strong id="arrive-ai-title">مساعد الشكاوى والتعويضات</strong><small>تحليل مجمع فقط — لا ينفذ أي إجراء</small></div><button type="button" id="arrive-ai-close" aria-label="إغلاق">×</button></header>',
    '<div class="arrive-ai-body">',
    '<div class="arrive-ai-note">المساعد يستخدم الفلاتر الحالية للملخص، ويقارن الأشهر من السجلات المحملة. لا تُرسل أسماء العملاء أو أرقام البوالص أو نصوص الشكاوى.</div>',
    '<label for="arrive-ai-access">رمز الوصول المعتمد من مسؤول النظام</label>',
    '<div class="arrive-ai-code"><input id="arrive-ai-access" type="password" autocomplete="current-password" placeholder="أدخل رمز الوصول"><button type="button" class="arrive-ai-btn secondary" id="arrive-ai-save">حفظ للجلسة</button></div>',
    '<div class="arrive-ai-quick">',
    '<button type="button" data-question="لخص أهم مؤشرات الشكاوى والتعويضات حسب الفلاتر الحالية.">ملخص المؤشرات</button>',
    '<button type="button" data-question="اكتشف مشكلات جودة البيانات والحالات التي تحتاج مراجعة من الملخص الحالي.">كشف المشكلات</button>',
    '<button type="button" data-question="قارن أداء الشكاوى والتعويضات شهريًا وحدد أكبر التحسنات والتراجعات.">مقارنة شهرية</button>',
    '<button type="button" data-question="جهز مسودة تقرير إداري مختصر بالأرقام والمشكلات والتوصيات.">تقرير الإدارة</button>',
    '</div><label for="arrive-ai-question">اسأل عن البيانات</label>',
    '<textarea id="arrive-ai-question" class="arrive-ai-question" maxlength="1200" placeholder="مثال: ما أكثر الفروع في الشكاوى المفتوحة؟ وما الإجراء المقترح؟"></textarea>',
    '<div class="arrive-ai-actions"><button type="button" id="arrive-ai-send" class="arrive-ai-btn">تحليل السؤال</button><button type="button" id="arrive-ai-copy" class="arrive-ai-btn secondary">نسخ الإجابة</button></div>',
    '<div id="arrive-ai-status" class="arrive-ai-status" aria-live="polite"></div>',
    '<div id="arrive-ai-answer" class="arrive-ai-answer" aria-live="polite">اكتب سؤالًا أو اختر أحد التحليلات السريعة.</div>',
    '<div class="arrive-ai-note">الأرقام الأساسية من الداشبورد. كل توصية مسودة للمراجعة البشرية، ولا يحدث تعديل تلقائي في الشكاوى أو التعويضات.</div>',
    '</div>'
  ].join('');
  document.body.append(launcher, panel);

  const $ = id => document.getElementById(id);
  const accessInput = $('arrive-ai-access');
  const questionInput = $('arrive-ai-question');
  const status = $('arrive-ai-status');
  const answer = $('arrive-ai-answer');
  const sendButton = $('arrive-ai-send');
  const accessStorageKey = 'arrive_ai_access_session';

  try { accessInput.value = sessionStorage.getItem(accessStorageKey) || ''; } catch (_) {}

  function setOpen(open) {
    panel.classList.toggle('is-open', open);
    launcher.setAttribute('aria-expanded', String(open));
    if (open) questionInput.focus();
  }
  launcher.addEventListener('click', () => setOpen(!panel.classList.contains('is-open')));
  $('arrive-ai-close').addEventListener('click', () => setOpen(false));
  $('arrive-ai-save').addEventListener('click', () => {
    try {
      sessionStorage.setItem(accessStorageKey, accessInput.value.trim());
      status.textContent = 'تم حفظ الرمز في جلسة المتصفح الحالية فقط.';
    } catch (_) { status.textContent = 'تعذر الحفظ؛ أدخل الرمز ثم أرسل السؤال.'; }
  });
  panel.querySelectorAll('[data-question]').forEach(button => button.addEventListener('click', () => {
    questionInput.value = button.dataset.question;
    questionInput.focus();
  }));
  $('arrive-ai-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(answer.textContent); status.textContent = 'تم نسخ الإجابة.'; }
    catch (_) { status.textContent = 'تعذر النسخ التلقائي؛ حدّد الإجابة وانسخها.'; }
  });

  function aggregate(rows) {
    const isOpen = row => !!(row.status && (row.status.includes('جارى') || row.status.includes('التحقيق')));
    const compRows = rows.filter(row => typeof row.compensation_amount === 'number' && Number.isFinite(row.compensation_amount));
    const resolution = rows.map(row => row.sla_resolution_days).filter(value => typeof value === 'number' && Number.isFinite(value));
    const compensationSla = rows.map(row => row.sla_compensation_days).filter(value => typeof value === 'number' && Number.isFinite(value));
    const sum = list => list.reduce((total, row) => total + row.compensation_amount, 0);
    const countMissing = key => rows.filter(row => !String(row[key] == null ? '' : row[key]).trim()).length;
    const topCount = key => {
      const counts = new Map();
      rows.forEach(row => {
        const label = String(row[key] || 'غير محدد').slice(0, 100);
        counts.set(label, (counts.get(label) || 0) + 1);
      });
      return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, count]) => ({ label, count }));
    };
    const companyRows = compRows.filter(row => String(row.compensation_bearer || '').replace(/\s+/g, '').replace(/ة/g, 'ه') === 'الشركه');
    return {
      totalComplaints: rows.length,
      openByStatus: rows.filter(isOpen).length,
      closedByStatus: rows.filter(row => !isOpen(row)).length,
      compensationCountableRows: compRows.length,
      compensationAmountTotal: Math.round(sum(compRows) * 100) / 100,
      companyCompensationAmount: Math.round(sum(companyRows) * 100) / 100,
      avgResolutionDays: resolution.length ? Math.round((resolution.reduce((a, b) => a + b, 0) / resolution.length) * 100) / 100 : null,
      resolutionSlaValidCount: resolution.length,
      avgCompensationSlaDays: compensationSla.length ? Math.round((compensationSla.reduce((a, b) => a + b, 0) / compensationSla.length) * 100) / 100 : null,
      compensationSlaValidCount: compensationSla.length,
      missingInvestigationResult: countMissing('investigation_result'),
      missingInvestigationResultDate: countMissing('investigation_result_date'),
      missingCompensationDate: countMissing('compensation_date'),
      branches: topCount('branch'),
      statuses: topCount('status'),
      classifications: topCount('classification')
    };
  }

  function getContext() {
    if (typeof window.arriveAIGetContext !== 'function') throw new Error('لم يتم تهيئة موفر بيانات الداشبورد.');
    return window.arriveAIGetContext();
  }

  async function sendQuestion() {
    const question = questionInput.value.trim();
    const code = accessInput.value.trim();
    if (!question) { status.textContent = 'اكتب السؤال أولًا.'; return; }
    if (!code) { status.textContent = 'أدخل رمز الوصول المعتمد.'; accessInput.focus(); return; }
    sendButton.disabled = true;
    sendButton.textContent = 'جارٍ التحليل…';
    status.textContent = 'يتم تجهيز الملخص المجمع…';
    answer.textContent = '';
    try {
      const context = getContext();
      const summary = {
        generatedAt: new Date().toISOString(),
        activeFilters: context.activeFilters || {},
        currentFilteredData: aggregate(context.filteredRows || []),
        monthlyComparisonScope: 'كل السجلات المحملة، مجمعة حسب شهر إضافة الشكوى (date_added). مبلغ التعويض حسب شهر التعويض الصريح إن كان متاحًا، ولا يستنتج من تاريخ آخر.',
        monthlyComplaintMetrics: context.monthlyMetrics || [],
        dataMode: context.dataMode || 'unknown'
      };
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Arrive-AI-Access': code },
        body: JSON.stringify({ question, summary })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'تعذر تنفيذ التحليل.');
      answer.textContent = payload.answer || 'لم يتم إرجاع إجابة.';
      status.textContent = 'تم التحليل باستخدام ' + (payload.model || 'مزود AI') + ' — ' + new Date(payload.generatedAt || Date.now()).toLocaleString('ar-EG');
      try { sessionStorage.setItem(accessStorageKey, code); } catch (_) {}
    } catch (error) {
      status.textContent = error && error.message ? error.message : 'حدث خطأ غير متوقع.';
    } finally {
      sendButton.disabled = false;
      sendButton.textContent = 'تحليل السؤال';
    }
  }
  sendButton.addEventListener('click', sendQuestion);
  questionInput.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') sendQuestion();
  });

  window.__ARRIVE_AI_TEST__ = { aggregate };
})();
