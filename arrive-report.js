/* ARRIVE — وحدة التقرير (Report module)
 * تبني تقريرًا بصيغة A4 من نفس دوال الحساب المستخدمة في اللوحة، دون أي حساب جديد للمؤشرات.
 * التصميم من design-system/arrive-tokens.css و arrive-ui.css و arrive-report.css فقط.
 */
(function(){
  'use strict';
  const MISSING = 'غير محدد بالمصدر';
  const N = v => (v===null||v===undefined||Number.isNaN(v)) ? '—' : Number(v).toLocaleString('en-US');
  const N1 = v => (v===null||v===undefined||Number.isNaN(v)) ? '—' : Number(v).toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1});
  const esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const SEV = {
    crit:{l:'حرجة',c:'rejected',i:'fa-circle-exclamation'}, critical:{l:'حرجة',c:'rejected',i:'fa-circle-exclamation'},
    high:{l:'مرتفعة',c:'pending',i:'fa-triangle-exclamation'},
    med:{l:'متوسطة',c:'progress',i:'fa-circle-info'}, medium:{l:'متوسطة',c:'progress',i:'fa-circle-info'},
    low:{l:'منخفضة',c:'neutral',i:'fa-minus'}
  };
  const sev = p => { const s = SEV[p] || null; return s ? `<span class="badge ${s.c}"><i class="fa-solid ${s.i}"></i>${s.l}</span>` : esc(MISSING); };
  const miss = () => `<span class="rp-miss">${MISSING}</span>`;
  let savedTheme = null, tempCharts = [];

  function periodOf(rows){
    const d = rows.map(r=>r.date_added).filter(Boolean).sort();
    return d.length ? {from:d[0], to:d[d.length-1]} : null;
  }
  function filterChips(){
    const chips = [...document.querySelectorAll('#activeFiltersBar .active-filter-chip')].map(c=>c.textContent.replace(/\s+/g,' ').replace(/[✕×]/g,'').trim()).filter(Boolean);
    return chips;
  }

  /* ---------- charts: نسخ بدون حركة بألوان الطباعة، من نفس بيانات رسوم اللوحة ---------- */
  function chartImage(live, w, h){
    if(!live || typeof Chart==='undefined') return '';
    try{
      const cv = document.createElement('canvas'); cv.width = w*2; cv.height = h*2;
      const holder = document.createElement('div'); holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:'+w+'px;height:'+h+'px';
      holder.appendChild(cv); document.body.appendChild(holder);
      const type = live.config.type, donut = type==='doughnut'||type==='pie';
      const data = JSON.parse(JSON.stringify(live.data));
      const opt = { animation:false, responsive:false, devicePixelRatio:1, indexAxis: live.options.indexAxis||'x',
        plugins:{ legend:{ display: donut || data.datasets.length>1, position:'bottom', labels:{ color:'#334155', font:{family:"'Cairo','Inter',sans-serif", size:22}, boxWidth:22, padding:18 } }, tooltip:{enabled:false} },
        layout:{padding:8} };
      if(!donut){
        opt.scales = {};
        const src = live.options.scales || {};
        Object.keys(src).forEach(k=>{
          const s = src[k];
          opt.scales[k] = { type:s.type, position:s.position, display:s.display!==false, beginAtZero:true,
            grid:{ display: k!=='x' || (live.options.indexAxis==='y'), color:'#E2E8F0' },
            ticks:{ color:'#475569', font:{family:"'Cairo','Inter',sans-serif", size:20}, autoSkip: type==='line', maxTicksLimit:10, maxRotation:0, precision:0 },
            title: (s.title && s.title.text) ? { display:true, text:s.title.text, color:'#475569', font:{family:"'Cairo','Inter',sans-serif", size:20} } : undefined };
        });
      } else { opt.cutout = '58%'; }
      const c = new Chart(cv, { type, data, options: opt });
      const url = cv.toDataURL('image/png');
      c.destroy(); holder.remove();
      return url;
    }catch(e){ console.warn('report chart failed', e); return ''; }
  }
  const liveChart = name => { try{ return eval(name); }catch(e){ return null; } };

  /* ---------- page shell ---------- */
  function page(inner, opts){
    opts = opts || {};
    return `<section class="rp-page${opts.land?' land':''}${opts.cover?' cover':''}">${inner}</section>`;
  }
  function head(title, ctx){
    return `<header class="rp-head">
      <div class="rp-head-brand"><span class="rp-logo-tile"><img src="assets/arrive-logo.png" alt="ARRIVE"></span><span class="rp-head-sys">إدارة المراجعة التشغيلية</span></div>
      <div class="rp-head-title">${esc(ctx.reportTitle)}</div>
      <div class="rp-head-period num">${esc(ctx.periodText)}</div>
    </header>
    <div class="rp-section"><h2>${esc(title)}</h2></div>`;
  }
  function foot(){ return `<footer class="rp-foot"><span>ARRIVE · إدارة المراجعة التشغيلية</span><span class="rp-pn num"></span></footer>`; }
  function tableWrap(cols, rowsHtml, cls){
    return `<table class="rp-table ${cls||''}"><thead><tr>${cols.map(c=>`<th${c.w?` style="width:${c.w}"`:''}${c.num?' class="num"':''}>${c.t}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
  }
  function chunk(a, n){ const o=[]; for(let i=0;i<a.length;i+=n) o.push(a.slice(i,i+n)); return o; }

  /* ---------- build ---------- */
  function build(){
    const rows = getFiltered();
    const pages = [];
    const per = periodOf(rows);
    const ctx = {
      reportTitle:'تقرير متابعة الشكاوى',
      periodText: per ? `الفترة: ${per.from} → ${per.to}` : 'الفترة: '+MISSING
    };
    if(!rows.length){
      pages.push(page(head('لا توجد بيانات',ctx)+`<div class="rp-empty"><i class="fa-regular fa-folder-open"></i><p>لا توجد بيانات متاحة وفقًا للفلاتر المحددة.</p></div>`+foot()));
      return pages;
    }
    const m = computeCoreExecutiveMetrics(rows);
    const {prevHalf, currHalf} = splitByDateHalves(rows);
    const mPrev = prevHalf.length ? computeCoreExecutiveMetrics(prevHalf) : null;
    const mCurr = computeCoreExecutiveMetrics(currHalf.length ? currHalf : rows);
    const health = computeHealthScore(rows);
    const alerts = (computeAlerts(rows)||[]);
    const insights = computeInsights(rows)||[];
    const actions = computeActionCenter(rows)||[];
    const summary = computeExecutiveSummary(rows)||{};
    const chips = filterChips();
    const refresh = (document.getElementById('headerLastUpdate')||{}).textContent || MISSING;
    const today = new Date().toISOString().slice(0,10);

    /* 1) الغلاف */
    pages.push(page(`
      <div class="rp-cover-top"><img class="rp-cover-logo" src="assets/arrive-logo.png" alt="ARRIVE"></div>
      <div class="rp-cover-main">
        <div class="rp-cover-kicker">إدارة المراجعة التشغيلية</div>
        <h1>تقرير متابعة الشكاوى والتعويضات</h1>
        <div class="rp-cover-rule"></div>
        <dl class="rp-cover-meta">
          <div><dt>الفترة المشمولة</dt><dd class="num">${per?`${per.from} → ${per.to}`:MISSING}</dd></div>
          <div><dt>عدد السجلات</dt><dd class="num">${N(rows.length)}</dd></div>
          <div><dt>عوامل التصفية</dt><dd>${chips.length?esc(chips.join('، ')):'لا توجد (كل السجلات)'}</dd></div>
          <div><dt>آخر تحديث للبيانات</dt><dd class="num">${esc(refresh)}</dd></div>
          <div><dt>تاريخ إصدار التقرير</dt><dd class="num">${today}</dd></div>
        </dl>
      </div>
      <div class="rp-cover-foot">مصدر البيانات: لوحة متابعة الشكاوى · جميع الأرقام محسوبة من السجلات المعروضة ضمن عوامل التصفية أعلاه</div>`,{cover:true}));

    /* 2) الملخص التنفيذي */
    const hs = health ? `<div class="rp-health">
        <div class="rp-ring"><svg viewBox="0 0 100 100"><circle class="t" cx="50" cy="50" r="42"/><circle class="f" cx="50" cy="50" r="42" style="stroke:${health.bandColor};stroke-dasharray:${(2*Math.PI*42).toFixed(1)};stroke-dashoffset:${((1-health.score/100)*2*Math.PI*42).toFixed(1)}"/></svg><div class="rp-ring-n"><b class="num">${health.score}</b><span>من 100</span></div></div>
        <div><div class="rp-lbl">مؤشر الصحة التنفيذي</div><div class="rp-band">${esc(health.bandLabel)}</div></div></div>` : '';
    const kp = (l,v,u,tone) => `<div class="rp-kpi ${tone||''}"><div class="rp-kpi-l">${l}</div><div class="rp-kpi-v num">${v}${u?`<small>${u}</small>`:''}</div></div>`;
    const attention = alerts.filter(a=>a.count>0).sort((a,b)=>({crit:0,high:1,med:2,low:3}[a.priority]??9)-({crit:0,high:1,med:2,low:3}[b.priority]??9));
    const reasons = (summary.topReasons||[]).slice(0,5);
    pages.push(page(head('الملخص التنفيذي',ctx)+`
      <div class="rp-exec-top">${hs}
        <div class="rp-kpis">
          ${kp('إجمالي الشكاوى',N(m.total),'','tone-brand')}
          ${kp('الشكاوى المفتوحة',N(m.open),'','tone-under-action')}
          ${kp('الشكاوى المغلقة',N(m.closed),'','tone-success')}
          ${kp('الالتزام بـ SLA',m.slaCompliance===null?'—':m.slaCompliance,m.slaCompliance===null?'':'%',m.slaCompliance!==null&&m.slaCompliance<70?'tone-violation':'tone-success')}
        </div>
      </div>
      <div class="rp-cols">
        <div>
          <h3>ما يحتاج انتباه الإدارة</h3>
          ${attention.length ? tableWrap([{t:'البند'},{t:'العدد',num:true,w:'18mm'},{t:'الخطورة',w:'28mm'}], attention.map(a=>`<tr><td>${esc(a.desc)}</td><td class="num">${N(a.count)}</td><td>${sev(a.priority)}</td></tr>`).join('')) : '<p class="rp-note">لا توجد تنبيهات نشطة ضمن البيانات الحالية.</p>'}
        </div>
        <div>
          <h3>أكثر أسباب الشكاوى تكرارًا</h3>
          ${reasons.length ? `<div class="rp-bars">${reasons.map(r=>`<div class="rp-bar-row"><span class="n">${esc(r.name)}</span><span class="tr"><span class="fl" style="width:${Math.max(3,Math.round(r.count/reasons[0].count*100))}%"></span></span><span class="p num">${r.pct}%</span></div>`).join('')}</div>` : '<p class="rp-note">لا توجد تصنيفات كافية للعرض.</p>'}
          <div class="rp-facts">
            <div><span>إجمالي التعويضات</span><b class="num">${N(m.totalComp)} ج.م</b></div>
            <div><span>متوسط زمن الحل</span><b class="num">${m.avgResolution===null?'—':N1(m.avgResolution)+' يوم'}</b></div>
            <div><span>معدل إغلاق الشكاوى</span><b class="num">${m.closureRate===null?'—':m.closureRate+'%'}</b></div>
          </div>
        </div>
      </div>`+foot()));

    /* 3) ملخص المؤشرات */
    const rowK = (label, key, fmt, lower, rate) => {
      const c = mCurr[key], p = mPrev ? mPrev[key] : null;
      let diff = '—';
      if(mPrev && c!=null && p!=null){
        diff = rate ? `${(c-p)>0?'+':(c-p)<0?'−':''}${Math.abs(c-p).toFixed(0)} نقطة`
                    : (p!==0 ? `${(c-p)>0?'+':(c-p)<0?'−':''}${Math.abs((c-p)/p*100).toFixed(1)}%` : '—');
      }
      return `<tr><td>${label}</td><td class="num strong">${c==null&&m[key]==null?'—':fmt(m[key])}</td><td class="num">${p==null?'—':fmt(p)}</td><td class="num">${c==null?'—':fmt(c)}</td><td class="num" dir="ltr">${diff}</td><td>${mPrev?kpiTrend(c,p,lower):'<span class="rp-note">لا توجد بيانات كافية</span>'}</td></tr>`;
    };
    const f0 = v=>N(v), fp = v=>v==null?'—':v+'%', fd = v=>v==null?'—':N1(v)+' يوم', fm = v=>N(Math.round(v))+' ج.م';
    const kpiRows = [
      rowK('إجمالي الشكاوى','total',f0,true), rowK('الشكاوى المفتوحة','open',f0,true), rowK('الشكاوى المغلقة','closed',f0,false),
      rowK('الالتزام بـ SLA (هدف 4 أيام)','slaCompliance',fp,false,true), rowK('متوسط زمن الحل','avgResolution',fd,true),
      rowK('متوسط زمن تنفيذ التعويض','avgCompensationSla',fd,true), rowK('إجمالي التعويضات','totalComp',fm,true),
      rowK('معدل إغلاق الشكاوى','closureRate',fp,false,true), rowK('متوسط التعويض','avgComp',fm,true), rowK('متوسط الشكاوى لكل معالج','avgPerHandler',v=>v==null?'—':N1(v),true)
    ].join('');
    const factors = health ? health.factors : [];
    pages.push(page(head('ملخص المؤشرات الرئيسية',ctx)+`
      <p class="rp-note">القيمة الكلية محسوبة على كل السجلات المعروضة. المقارنة بين نصفي الفترة: النصف الأول مقابل النصف الأخير من السجلات مرتبة بتاريخ الإضافة (نفس منهج اللوحة).</p>
      ${tableWrap([{t:'المؤشر'},{t:'القيمة الكلية',num:true,w:'26mm'},{t:'النصف الأول',num:true,w:'26mm'},{t:'النصف الأخير',num:true,w:'26mm'},{t:'التغيّر',num:true,w:'24mm'},{t:'الاتجاه',w:'26mm'}],kpiRows)}
      ${factors.length?`<h3>مكوّنات مؤشر الصحة التنفيذي</h3>`+tableWrap([{t:'العامل'},{t:'الوزن',num:true,w:'24mm'},{t:'الدرجة (0–100)',num:true,w:'34mm'}],factors.map(f=>`<tr><td>${esc(f.label)}</td><td class="num">${Math.round(f.weight*100)}%</td><td class="num">${Math.round(f.score)}</td></tr>`).join(''),'rp-compact'):''}`+foot()));

    /* 4) التحليل التفصيلي */
    const imgs = {
      trend: chartImage(liveChart('chartTrend'),1000,300),
      status: chartImage(liveChart('chartStatus'),480,300),
      type: chartImage(liveChart('chartType'),480,300),
      branch: chartImage(liveChart('chartBranch'),1000,320),
      cls: chartImage(liveChart('chartClassification'),1000,320)
    };
    const fig = (t,sub,src) => `<div class="rp-fig"><div class="rp-cap"><b>${t}</b><span>${sub}</span></div>${src?`<img src="${src}" alt="${esc(t)}">`:`<div class="rp-note">${MISSING}</div>`}</div>`;
    pages.push(page(head('التحليل التفصيلي (1/2): الاتجاه والتوزيعات',ctx)+
      fig('الاتجاه اليومي للشكاوى','عدد الشكاوى الواردة يوميًا خلال الفترة',imgs.trend)+
      `<div class="rp-two">${fig('حالة التعويض','توزيع الشكاوى حسب الحالة',imgs.status)}${fig('نوع الشكوى','توزيع الشكاوى حسب النوع',imgs.type)}</div>`+foot()));
    pages.push(page(head('التحليل التفصيلي (2/2): الفروع والتصنيفات',ctx)+
      fig('الشكاوى حسب الفرع','أعلى الفروع من حيث عدد الشكاوى',imgs.branch)+
      fig('تصنيف المشكلة','أكثر الأسباب تكرارًا',imgs.cls)+foot()));

    /* 5) أداء مسؤولي الشكاوى */
    let handlers = [];
    try{ handlers = computeHandlerPerformance(rows).filter(h=>h.count>0).sort((a,b)=>b.count-a.count); }catch(e){}
    if(handlers.length){
      const cl = {green:['accepted','fa-circle-check','ممتاز'],yellow:['progress','fa-circle-info','جيد'],orange:['pending','fa-triangle-exclamation','يحتاج متابعة'],red:['rejected','fa-circle-exclamation','حرج']};
      chunk(handlers,14).forEach((grp,gi,all)=>{
        pages.push(page(head('أداء مسؤولي الشكاوى'+(all.length>1?` (${gi+1}/${all.length})`:''),ctx)+
          tableWrap([{t:'المسؤول'},{t:'الشكاوى',num:true},{t:'المغلقة',num:true},{t:'المفتوحة',num:true},{t:'الالتزام بـ SLA',num:true},{t:'متوسط الحل (يوم)',num:true},{t:'الدرجة',num:true},{t:'التقييم'}],
            grp.map(h=>{const c=cl[h.colorKey]||cl.orange;return `<tr><td>${esc(h.owner)}</td><td class="num">${N(h.count)}</td><td class="num">${N(h.closed)}</td><td class="num">${N(h.open)}</td><td class="num">${Math.round(h.slaCompliance*100)}%</td><td class="num">${N1(h.avgSla)}</td><td class="num strong">${h.score}</td><td><span class="badge ${c[0]}"><i class="fa-solid ${c[1]}"></i>${c[2]}</span></td></tr>`;}).join(''))+
          `<p class="rp-note">التقييم والدرجة كما تحسبهما اللوحة دون تعديل.</p>`+foot()));
      });
    }

    /* 6) النتائج والملاحظات (Findings) */
    if(insights.length){
      const rank = {critical:0,high:1,medium:2,low:3};
      const sorted = insights.slice().sort((a,b)=>(rank[a.priority]??9)-(rank[b.priority]??9));
      const strip = s => String(s||'').replace(/<b>/g,'<strong>').replace(/<\/b>/g,'</strong>');
      chunk(sorted,6).forEach((grp,gi,all)=>{
        const base = gi*6;
        pages.push(page(head('النتائج والملاحظات'+(all.length>1?` (${gi+1}/${all.length})`:''),ctx)+
          tableWrap([{t:'م',w:'9mm',num:true},{t:'الملاحظة'},{t:'الأثر'},{t:'الخطورة',w:'22mm'},{t:'الإجراء الموصى به'},{t:'المسؤول / الحالة / الاستحقاق',w:'30mm'}],
            grp.map((f,i)=>`<tr><td class="num">${base+i+1}</td><td>${strip(f.problem)}</td><td>${esc(f.impact)}</td><td>${sev(f.priority)}</td><td>${esc(f.action)}</td><td>${miss()}</td></tr>`).join(''),'rp-findings')+
          `<p class="rp-note">السبب الجذري والمسؤول والحالة وتاريخ الاستحقاق غير متوفرة في مصدر البيانات؛ لذلك لم تُستنتج ولم يُفترض لها قيم.</p>`+foot()));
      });
    }

    /* 7) جدول التوصيات */
    if(actions.length){
      const rank = {critical:0,high:1,medium:2,low:3};
      const sorted = actions.slice().sort((a,b)=>(rank[a.priority]??9)-(rank[b.priority]??9));
      chunk(sorted,6).forEach((grp,gi,all)=>{
        pages.push(page(head('التوصيات وخطة الإجراءات'+(all.length>1?` (${gi+1}/${all.length})`:''),ctx)+
          tableWrap([{t:'م',w:'9mm',num:true},{t:'المشكلة'},{t:'التأثير'},{t:'الإجراء المطلوب'},{t:'المسؤول',w:'30mm'},{t:'الأولوية',w:'24mm'},{t:'الحالة',w:'26mm'}],
            grp.map((a,i)=>`<tr><td class="num">${gi*6+i+1}</td><td>${esc(a.desc)}</td><td>${esc(a.impact)}</td><td><b>${esc(a.title)}</b></td><td>${a.owner?esc(a.owner):miss()}</td><td>${sev(a.priority)}</td><td>${miss()}</td></tr>`).join(''),'rp-recs')+
          `<p class="rp-note">المسؤول والأولوية كما تحددهما قواعد مركز الإجراءات في اللوحة. الحالة غير متوفرة في المصدر ولا تُعرض شارة حالة افتراضية.</p>`+foot()));
      });
    }

    /* 8) الختام */
    pages.push(page(head('الختام ومنهجية الإعداد',ctx)+`
      <div class="rp-close">
        <h3>أساس الإعداد</h3>
        <ul>
          <li>عدد السجلات المشمولة: <b class="num">${N(rows.length)}</b> سجلًا، للفترة <b class="num">${per?`${per.from} → ${per.to}`:MISSING}</b>.</li>
          <li>عوامل التصفية: ${chips.length?esc(chips.join('، ')):'لا توجد (كل السجلات).'}</li>
          <li>مصدر البيانات: الجدول الحي المرتبط باللوحة (Google Sheets عبر Apps Script)، وآخر تحديث: <b class="num">${esc(refresh)}</b>.</li>
          <li>الشكوى «مفتوحة» إذا كانت حالتها «جارى» أو «التحقيق»، وما عدا ذلك «مغلقة»؛ والالتزام بـ SLA = نسبة الشكاوى التي حُلّت خلال 4 أيام أو أقل.</li>
          <li>مقارنة الاتجاه تتم بين نصفي السجلات مرتبة بتاريخ الإضافة، وليست مقارنة بشهر تقويمي سابق.</li>
        </ul>
        <h3>حدود التقرير</h3>
        <ul>
          <li>لا يتضمن مصدر البيانات حاليًا: السبب الجذري، المسؤول عن التنفيذ، حالة الإجراء، وتاريخ الاستحقاق؛ ولذلك تظهر «${MISSING}».</li>
          <li>ما ورد من تفسيرات في الملاحظات والتوصيات هو مخرجات قواعد اللوحة الآلية، ويحتاج اعتمادًا من الإدارة قبل اعتباره قرارًا.</li>
        </ul>
        <div class="rp-sign">
          <div><span>إعداد</span><i></i></div><div><span>مراجعة</span><i></i></div><div><span>اعتماد</span><i></i></div>
        </div>
        <div class="rp-end">نهاية التقرير</div>
      </div>`+foot()));
    return pages;
  }

  /* ---------- open / close / print ---------- */
  function open(){
    const ov = document.getElementById('reportOverlay'); if(!ov) return;
    savedTheme = document.documentElement.getAttribute('data-theme');
    document.documentElement.removeAttribute('data-theme');       // التقرير دائمًا بالمظهر الفاتح
    let pages;
    try{ pages = build(); }catch(e){ console.error(e); pages = [page(`<div class="rp-empty"><p>تعذّر إعداد التقرير. أعد المحاولة بعد تحديث اللوحة.</p></div>`)]; }
    ov.innerHTML = `<div class="rp-toolbar">
        <div class="rp-tb-title"><i class="fa-solid fa-file-lines"></i> معاينة التقرير</div>
        <div class="rp-tb-actions">
          <button type="button" class="icon-btn primary-on-blue" id="rpPrint"><i class="fa-solid fa-print"></i> طباعة / حفظ PDF</button>
          <button type="button" class="icon-btn" id="rpClose"><i class="fa-solid fa-xmark"></i> إغلاق</button>
        </div></div>
      <div class="rp-stage">${pages.join('')}</div>`;
    const sheets = ov.querySelectorAll('.rp-page');
    sheets.forEach((p,i)=>{ const pn = p.querySelector('.rp-pn'); if(pn) pn.textContent = `صفحة ${i+1} من ${sheets.length}`; });
    ov.hidden = false; ov.setAttribute('aria-hidden','false');
    document.body.classList.add('report-open');
    if(!document.getElementById('rpPageStyle')){ const st=document.createElement('style'); st.id='rpPageStyle'; st.textContent='@page{size:A4 portrait;margin:0}'; document.head.appendChild(st); }
    ov.scrollTop = 0;
    document.getElementById('rpClose').onclick = close;
    document.getElementById('rpPrint').onclick = ()=> window.print();
    document.addEventListener('keydown', onKey);
  }
  function onKey(e){ if(e.key==='Escape') close(); }
  function close(){
    const ov = document.getElementById('reportOverlay'); if(!ov) return;
    ov.hidden = true; ov.setAttribute('aria-hidden','true'); ov.innerHTML = '';
    document.body.classList.remove('report-open');
    const ps=document.getElementById('rpPageStyle'); if(ps) ps.remove();
    if(savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
    document.removeEventListener('keydown', onKey);
  }
  window.ArriveReport = { open, close, build };
})();
