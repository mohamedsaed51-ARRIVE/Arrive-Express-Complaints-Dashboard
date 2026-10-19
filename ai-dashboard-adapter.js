/* ARRIVE AI data adapter: read-only bridge to existing dashboard functions. */
(function () {
  'use strict';
  if (window.__ARRIVE_AI_ADAPTER__) return;
  window.__ARRIVE_AI_ADAPTER__ = true;

  function selectedValues(id) {
    const element = document.getElementById(id);
    if (!element) return [];
    return Array.from(element.selectedOptions || []).map(option => option.value).filter(Boolean);
  }

  function activeFilters() {
    const filters = {};
    const fields = {
      fOwner: 'مسؤول الشكوى',
      fBranch: 'الفرع المتسبب',
      fType: 'نوع الشكوى',
      fStatus: 'حالة الشكوى',
      fMonth: 'شهر إضافة الشكوى',
      fClassification: 'تصنيف المشكلة',
      fCompMonth: 'شهر التعويض',
      fSender: 'اسم الراسل',
      fBearer: 'جهة تحمل التعويض',
      fReviewResult: 'نتيجة مراجعة التعويض',
      fConfirm: 'تأكيد المراجعة'
    };
    Object.entries(fields).forEach(([id, label]) => {
      const values = selectedValues(id);
      if (values.length) filters[label] = values.slice(0, 12);
    });
    const dateFrom = document.getElementById('fDateFrom')?.value;
    const dateTo = document.getElementById('fDateTo')?.value;
    const reviewFrom = document.getElementById('fReviewFrom')?.value;
    const reviewTo = document.getElementById('fReviewTo')?.value;
    if (dateFrom) filters['تاريخ الشكوى من'] = dateFrom;
    if (dateTo) filters['تاريخ الشكوى إلى'] = dateTo;
    if (reviewFrom) filters['تاريخ المراجعة من'] = reviewFrom;
    if (reviewTo) filters['تاريخ المراجعة إلى'] = reviewTo;
    if (document.getElementById('fSearch')?.value.trim()) filters['البحث النصي'] = 'مفعّل (لم يُرسل نص البحث للخصوصية)';
    return filters;
  }

  function monthlyMetrics(rows) {
    const groups = new Map();
    (rows || []).forEach(row => {
      const month = String(row.date_added || '').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) return;
      if (!groups.has(month)) groups.set(month, []);
      groups.get(month).push(row);
    });
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-24).map(([month, items]) => {
      const accepted = items.filter(row => typeof compDecisionOf === 'function' && compDecisionOf(row) === 'accepted').length;
      const rejected = items.filter(row => typeof compDecisionOf === 'function' && compDecisionOf(row) === 'rejected').length;
      const resolution = items.map(row => row.sla_resolution_days).filter(value => typeof value === 'number' && Number.isFinite(value));
      const compensationSla = items.map(row => row.sla_compensation_days).filter(value => typeof value === 'number' && Number.isFinite(value));
      const companyRows = items.filter(row => typeof isCompanyBearer === 'function' && isCompanyBearer(row));
      const open = items.filter(row => typeof isOpenByStatus === 'function' && isOpenByStatus(row)).length;
      return {
        month,
        complaints: items.length,
        compensationAccepted: accepted,
        compensationRejected: rejected,
        compensationDecisionUnresolved: items.length - accepted - rejected,
        compensationAmountTotal: typeof sumCompensation === 'function' ? Math.round(sumCompensation(items) * 100) / 100 : null,
        companyCompensationAmount: typeof sumCompanyCompensation === 'function' ? Math.round(sumCompanyCompensation(items) * 100) / 100 : null,
        openByStatus: open,
        avgResolutionDays: resolution.length ? Math.round((resolution.reduce((a, b) => a + b, 0) / resolution.length) * 100) / 100 : null,
        resolutionSlaValidCount: resolution.length,
        avgCompensationSlaDays: compensationSla.length ? Math.round((compensationSla.reduce((a, b) => a + b, 0) / compensationSla.length) * 100) / 100 : null,
        compensationSlaValidCount: compensationSla.length
      };
    });
  }

  window.arriveAIGetContext = function () {
    if (typeof getFiltered !== 'function' || !Array.isArray(window.DATA) && typeof DATA === 'undefined') {
      throw new Error('بيانات الداشبورد لم تجهز بعد. جرّب مرة أخرى بعد تحميل البيانات.');
    }
    const filteredRows = getFiltered();
    const allRows = Array.isArray(DATA) ? DATA : [];
    const demoBanner = document.getElementById('demoModeBanner');
    const dataMode = demoBanner && !demoBanner.classList.contains('hidden') ? 'demo' : (typeof hasLiveDataOnce !== 'undefined' && hasLiveDataOnce ? 'live' : 'unknown');
    return {
      filteredRows,
      monthlyMetrics: monthlyMetrics(allRows),
      activeFilters: activeFilters(),
      dataMode
    };
  };
})();
