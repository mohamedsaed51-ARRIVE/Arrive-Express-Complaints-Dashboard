'use strict';

const crypto = require('node:crypto');
const { validateRequest, buildInstructions } = require('./core');

const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
const buckets = globalThis.__arriveAiRateBuckets || (globalThis.__arriveAiRateBuckets = new Map());

function send(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  return res.end(JSON.stringify(payload));
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const left = crypto.createHash('sha256').update(a).digest();
  const right = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(left, right) && a.length === b.length;
}

function allowedOrigins() {
  return (process.env.AI_ALLOWED_ORIGINS || '').split(',').map(value => value.trim().replace(/\/$/, '')).filter(Boolean);
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin || !/^https?:\/\//i.test(origin)) return false;
  return allowedOrigins().includes(origin.replace(/\/$/, ''));
}

function rateLimit(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') || 'unknown';
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || now - bucket.startedAt >= WINDOW_MS) {
    buckets.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= MAX_REQUESTS_PER_WINDOW;
}

function getResponseText(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const parts = [];
  for (const item of (Array.isArray(data.output) ? data.output : [])) {
    for (const content of (Array.isArray(item.content) ? item.content : [])) {
      if (content.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'الطريقة غير مدعومة.' });
  }
  if (!allowedOrigins().length) return send(res, 503, { error: 'خدمة AI غير مهيأة: يجب ضبط AI_ALLOWED_ORIGINS.' });
  if (!originAllowed(req)) return send(res, 403, { error: 'مصدر الطلب غير مسموح.' });

  const expectedCode = process.env.AI_ACCESS_CODE;
  if (!expectedCode) return send(res, 503, { error: 'خدمة AI غير مهيأة: يجب ضبط AI_ACCESS_CODE.' });
  if (!safeEqual(req.headers['x-arrive-ai-access'], expectedCode)) return send(res, 401, { error: 'رمز الوصول غير صحيح.' });
  if (!rateLimit(req)) return send(res, 429, { error: 'تم الوصول إلى حد الطلبات. حاول مرة أخرى بعد قليل.' });

  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return send(res, 503, { error: 'مفتاح مزود AI غير مضبوط في إعدادات الاستضافة.' });
  const parsed = validateRequest(req.body);
  if (parsed.error) return send(res, 400, { error: parsed.error });

  const model = process.env.AI_MODEL || 'gpt-4.1-mini';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        instructions: buildInstructions(),
        input: 'سؤال المستخدم:\n' + parsed.question + '\n\nملخص البيانات المعتمدة (JSON):\n' + JSON.stringify(parsed.summary),
        max_output_tokens: 900,
        store: false
      }),
      signal: controller.signal
    });
    if (!upstream.ok) {
      const status = upstream.status;
      if (status === 429) return send(res, 503, { error: 'مزود AI مشغول حاليًا. حاول لاحقًا.' });
      console.error('[arrive-ai] provider error status:', status);
      return send(res, 502, { error: 'تعذر إكمال التحليل لدى مزود AI.' });
    }
    const result = await upstream.json();
    const answer = getResponseText(result);
    if (!answer) return send(res, 502, { error: 'لم يرجع مزود AI إجابة قابلة للعرض.' });
    return send(res, 200, { answer, model, generatedAt: new Date().toISOString() });
  } catch (error) {
    const isTimeout = error && error.name === 'AbortError';
    console.error('[arrive-ai] request failed:', isTimeout ? 'timeout' : 'network error');
    return send(res, isTimeout ? 504 : 502, { error: isTimeout ? 'استغرق التحليل وقتًا أطول من المسموح.' : 'تعذر الاتصال بخدمة AI.' });
  } finally {
    clearTimeout(timeout);
  }
};
