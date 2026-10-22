"""اختبارات منطق المؤشرات (قبول/رفض/مفتوحة/إزالة التكرار/الفلاتر).
كل البيانات هنا اصطناعية للاختبار فقط — ليست بيانات تشغيلية.
التشغيل:  python3 tests/kpi-logic.test.py   (يحتاج: pip install playwright + chromium)
Chart.js يُستبدل بـ chart-stub.js لأن الاختبار لا يفحص الرسم بل الحسابات والـDOM."""
import os, sys
from playwright.sync_api import sync_playwright
HERE=os.path.dirname(os.path.abspath(__file__))
URL='file://'+os.path.join(HERE,'..','index.html')
STUB=open(os.path.join(HERE,'chart-stub.js')).read()
ACC,REJ,INV,UND='تم قبول التعويض','تم رفض التعويض','جارى التحقيق','غير محدد'
def row(i,status,rev,branch='الرئيسى',**k):
    d=dict(id=i,owner='A',admin='x',complainant='c',policy='',content='c'+str(i),type='شكوى تخص التوصيل',date_added='2026-06-10',investigation_result_date='2026-06-11',month='يونيو',branch=branch,classification='ك',investigation_result='',status=status,compensation_amount=None,compensation_bearer='',compensation_review_result=rev,confirm_review='',review_date='',compensation_date='',sla_days=1,faulty_person='',notes='')
    d.update(k); return d
def load(pg,rows):
    pg.evaluate('(r)=>renderDataset(r)',rows); pg.wait_for_timeout(1300)
def kpis(pg):
    return pg.evaluate("""()=>{const t=s=>document.querySelector(s).textContent.trim();
      const _r=getFiltered(), _a=_r.filter(d=>compDecisionOf(d)==='accepted').length, RJ=_r.filter(d=>compDecisionOf(d)==='rejected').length, RP=fmtPctPair(_a,RJ)[1];
      const open=[...document.querySelectorAll('#execCoreGrid .exec-core-card')].find(c=>c.textContent.includes('الشكاوى المفتوحة')).querySelector('.exec-core-value').textContent.trim();
      return {total:t('#kpiTotal'),acc:t('#kpiAcceptRate'),accPct:t('#kpiAcceptPct'),rej:String(RJ),rejPct:RP,open}}""")
results=[]
def check(name,cond,detail=''):
    results.append((name,bool(cond),detail)); print(('PASS' if cond else 'FAIL'),name,detail)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1440,'height':900}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    def route(r):
        u=r.request.url
        if 'Chart.js' in u: r.fulfill(body=STUB,content_type='application/javascript')
        elif u.startswith('file://'): r.continue_()
        else: r.abort()
    pg.route('**/*',route); pg.goto(URL); pg.wait_for_timeout(1200)

    # 1) شكوى مفتوحة + مراجعة فارغة => مفتوحة
    load(pg,[row('1',INV,None)]); check('1 مفتوحة + فارغ => مفتوحة', kpis(pg)['open']=='1')
    # 2) شكوى مغلقة + مراجعة فارغة => غير مفتوحة (حتى مع مسافات فقط)
    load(pg,[row('1',ACC,None),row('2',REJ,'   '),row('3',UND,'')]); check('2 مغلقة + فارغ => غير مفتوحة', kpis(pg)['open']=='0',str(kpis(pg)))
    # 3-5) حالات المراجعة المفتوحة (مع اختلافات الكتابة) حتى لو الشكوى مغلقة
    load(pg,[row('1',ACC,'مراجعة الشكاوي')]); check('3 مراجعة الشكاوي => مفتوحة', kpis(pg)['open']=='1')
    load(pg,[row('1',REJ,'رد  الشكاوى')]); check('4 رد الشكاوي (مسافتان وى) => مفتوحة', kpis(pg)['open']=='1')
    load(pg,[row('1',ACC,' معلقه ')]); check('5 معلقة (ه بدل ة + مسافات) => مفتوحة', kpis(pg)['open']=='1')
    load(pg,[row('1',ACC,'To be paid'),row('2',ACC,'تم التعويض مسبقا')]); check('5b قيم أخرى لا تفتح الشكوى', kpis(pg)['open']=='0')
    # 6) مقبول/مرفوض/غير محسوم
    load(pg,[row('1',ACC,'x'),row('2','التعويض مسبقا','x'),row('3',REJ,'x'),row('4',INV,'x'),row('5',UND,'x')])
    k=kpis(pg); check('6 «التعويض مسبقا» غير مقبول: مقبول=1 مرفوض=1 والنسب من المحسوم فقط (2)', k['acc']=='1' and k['rej']=='1' and k['accPct']=='50.0%' and k['rejPct']=='50.0%',str(k))
    # 6b) المجموع = 100% حتى مع حالة التقريب (15 مقبولة + 1 مرفوضة)
    load(pg,[row(str(i),ACC,'x') for i in range(15)]+[row('99',REJ,'x')])
    k=kpis(pg); s=float(k['accPct'][:-1])+float(k['rejPct'][:-1]); check('6b مجموع النسبتين = 100.0', abs(s-100)<1e-9,str(k))
    # 6c) لا محسوم => لا نسب مضللة
    load(pg,[row('1',INV,'x')]); k=kpis(pg); check('6c بلا محسوم => —', k['accPct']=='—' and k['rejPct']=='—')
    # 6d) حالة تحتوي رفض وقبول معًا لا تُعدّ مرتين
    load(pg,[row('1','تم رفض التعويض مسبقا','x'),row('2',ACC,'x')]); k=kpis(pg); check('6d تصنيف حصري (لا عدّ مزدوج)', k['acc']=='1' and k['rej']=='1' and k['accPct']=='50.0%',str(k))
    # 7) مكررات وأرقام فارغة/غير صالحة
    rows=[row('1',ACC,'x'),row('1',ACC,'x'),row('2',INV,None),row('2',REJ,'x'),row('',ACC,'x'),row('   ',ACC,'x'),row('-',ACC,'x'),row('#N/A',ACC,'x'),row('3',ACC,'x'),row(None,ACC,'x')]
    load(pg,rows); k=kpis(pg); q=pg.evaluate('window.ARRIVE_DATA_QUALITY')
    check('7 إزالة التكرار: 3 شكاوى فريدة فقط', k['total']=='3',str(k))
    check('7b رقم فارغ/غير صالح لا يُدمج مع غيره ويُسجَّل', q['noId']==3 and q['invalidId']==2,str(q))
    check('7c تكرار بيانات مختلفة يُرصد كتعارض', q['conflictingDuplicateIds']==['2'],str(q))
    check('7d تكرار الرقم لا يضاعف المفتوحة (الأول فقط: قيد التحقيق)', k['open']=='1',str(k))
    # 8) أثر الفلاتر على كل المؤشرات
    rows=[row('1',ACC,'x','أ'),row('2',REJ,'مراجعة الشكاوي','أ'),row('3',REJ,'x','ب'),row('4',INV,None,'ب'),row('5',ACC,'x','ب')]
    load(pg,rows); a=kpis(pg)
    pg.evaluate("()=>{const e=document.getElementById('fBranch'); e.value='ب'; syncMultiSelectUI('fBranch'); render();}"); pg.wait_for_timeout(1300); f=kpis(pg)
    check('8 قبل الفلتر', a['total']=='5' and a['acc']=='2' and a['rej']=='2' and a['open']=='2',str(a))
    check('8b بعد فلتر الفرع ب: الإجمالي 3 / قبول 1 / رفض 1 / مفتوحة 1', f['total']=='3' and f['acc']=='1' and f['rej']=='1' and f['open']=='1',str(f))
    pg.evaluate("()=>{const e=document.getElementById('fReviewResult'); e.value='مراجعة الشكاوي'; syncMultiSelectUI('fReviewResult'); document.getElementById('fBranch').value=''; syncMultiSelectUI('fBranch'); render();}"); pg.wait_for_timeout(1300); f2=kpis(pg)
    check('8c فلتر نتيجة المراجعة', f2['total']=='1' and f2['open']=='1' and f2['rej']=='1',str(f2))
    # 10) أشكال القيم الفعلية المكتشفة (To be paid / refused / معلقة / رد الشكاوي / فارغ) — بيانات اصطناعية بنفس الأشكال
    PRIOR='التعويض مسبقا'
    rows=[row('r1',ACC,'To be paid'),row('r2',ACC,'To be paid'),row('r3',ACC,'To be paid'),row('r4',ACC,'refused'),
          row('r5',REJ,'refused'),row('r6',REJ,'refused'),row('r7',INV,'معلقة'),row('r8',ACC,'معلقة'),
          row('r9',REJ,'رد الشكاوي'),row('r10',ACC,None,compensation_amount=100),row('r11',INV,None),
          row('r12',PRIOR,'تم التعويض مسبقا'),row('-',ACC,'To be paid')]
    load(pg,rows); k=kpis(pg)
    check('10 مصدر القرار الحالي = الحالة: مقبول 6 / مرفوض 3 / 66.7% / 33.3%', k['acc']=='6' and k['rej']=='3' and k['accPct']=='66.7%' and k['rejPct']=='33.3%',str(k))
    check('10b المفتوحة = اتحاد بلا تكرار (r7,r8,r9,r11 = 4) لا 5 (جمع بسيط)', k['open']=='4',str(k))
    pr=pg.evaluate('arriveProfileData()')
    check('10c تداخل المفتوحة: حالة 2 / مراجعة 3 / مشترك 1 / اتحاد 4', (pr['openOverlap']['byStatus'],pr['openOverlap']['byReviewState'],pr['openOverlap']['inBoth'],pr['openOverlap']['union'])==(2,3,1,4),str(pr['openOverlap']))
    check('10d الفارغ: 2 سجل، واحد منهما له مبلغ > 0 وهو مغلق (لا يُحتسب مفتوحًا)', pr['emptyReview']['count']==2 and pr['emptyReview']['withAmountGreaterThanZero']==1,str(pr['emptyReview']))
    d=pr['decisionBySource']; check('10e مقارنة المصدرين: الحالة 6/3 مقابل المراجعة 3/3 مع رصد الاختلاف', d['status']['accepted']==6 and d['review']['accepted']==3 and d['review']['rejected']==3 and len(d['disagreements'])>0,str(d))
    ex=pr['dataQuality']['excluded']; check('10f السجل غير الصالح مُستبعد ومسجَّل بسببه (لا يُدمج)', len(ex)==1 and ex[0]['reason']=='رقم شكوى غير صالح' and pr['records']==12,str(ex))
    # التبديل لمصدر المراجعة (غير معتمد — للتحقق فقط)
    pg.evaluate("()=>{COMPENSATION_DECISION_SOURCE='review'; render();}"); pg.wait_for_timeout(1300); k=kpis(pg)
    check('10g لو اعتُمد مصدر المراجعة: 3 / 3 / 50.0% / 50.0%', k['acc']=='3' and k['rej']=='3' and k['accPct']=='50.0%' and k['rejPct']=='50.0%',str(k))
    pg.evaluate("()=>{COMPENSATION_DECISION_SOURCE='status'; PRIOR_COMPENSATION_COUNTS_AS_ACCEPTED=false; render();}"); pg.wait_for_timeout(1300); k=kpis(pg)
    check('10h القاعدة المعتمدة (استبعاد «التعويض مسبقا»): 6 / 3 / 66.7% / 33.3%', k['acc']=='6' and k['rej']=='3' and k['accPct']=='66.7%' and k['rejPct']=='33.3%',str(k))
    pg.evaluate("()=>{PRIOR_COMPENSATION_COUNTS_AS_ACCEPTED=true; render();}"); pg.wait_for_timeout(1300); k=kpis(pg)
    check('10i الرجوع للقاعدة القديمة (true): 7 / 3 / 70.0% / 30.0%', k['acc']=='7' and k['rej']=='3' and k['accPct']=='70.0%' and k['rejPct']=='30.0%',str(k))
    check('9 لا أخطاء JavaScript', not errs, str(errs))
    b.close()
bad=[r for r in results if not r[1]]
print(f'\n{len(results)-len(bad)}/{len(results)} passed'); sys.exit(1 if bad else 0)
