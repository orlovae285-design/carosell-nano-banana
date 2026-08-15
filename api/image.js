// api/image.js — Vercel serverless function (Node), БЕЗ зовнішніх пакетів
// Генерує картинку через Nano Banana (Gemini image) з автоповтором при ліміті швидкості.
const MODEL = "gemini-3.1-flash-image"; // Nano Banana 2. Краща якість: "gemini-3-pro-image-preview"
const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent";

const SUFFIX =
  ", vertical 4:5 format, premium cinematic, clean background with empty space for text, absolutely no text, no letters, no words, no watermark";

const MAX_RETRIES = 3; // скільки разів повторити при 429/503/500

// Виклик Gemini з очікуванням і повтором, якщо сервіс зайнятий
async function callGeminiImage(key, text) {
  let last = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text }] }] }),
    });

    if (r.ok) return { ok: true, data: await r.json() };

    const errText = await r.text();
    last = { status: r.status, text: errText };

    // 429 = забагато запитів, 503/500 = сервіс перевантажений → чекаємо й повторюємо
    if (r.status === 429 || r.status === 503 || r.status === 500) {
      const waitMs = Math.round(700 * Math.pow(2, attempt) + Math.random() * 1200);
      await new Promise((res) => setTimeout(res, waitMs));
      continue;
    }
    // інші помилки (404 моделі тощо) — повторювати немає сенсу
    return { ok: false, status: r.status, text: errText };
  }
  return { ok: false, status: last?.status || 429, text: last?.text || "rate limited after retries" };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const key = (process.env.GEMINI_KEY || "").trim();

  // ── ДІАГНОСТИКА: https://ТВІЙ-ДОМЕН/api/image?ping=1 ──
  if (req.method === "GET" && req.query && req.query.ping) {
    const out = await callGeminiImage(key, "a red apple on a white table");
    if (!out.ok) return res.status(200).json({ ok: false, model: MODEL, status: out.status, gemini: (out.text || "").slice(0, 900) });
    const parts = out.data?.candidates?.[0]?.content?.parts || [];
    const img = parts.find((p) => p.inlineData);
    return res.status(200).json({ ok: true, model: MODEL, gotImage: !!img, imageBytes: img ? (img.inlineData.data || "").length : 0 });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    if (!key) return res.status(500).json({ error: "GEMINI_KEY is missing" });

    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const { prompt } = body || {};
    if (!prompt) return res.status(400).json({ error: "no prompt" });

    const out = await callGeminiImage(key, prompt + SUFFIX);
    if (!out.ok) {
      console.error("Gemini image error:", out.status, out.text);
      // 429 віддаємо як 429, щоб фронтенд міг зрозуміти, що це саме ліміт
      const status = out.status === 429 ? 429 : 500;
      return res.status(status).json({ error: (safeMsg(out.text)) || "gemini error" });
    }

    const parts = out.data?.candidates?.[0]?.content?.parts || [];
    const img = parts.find((p) => p.inlineData);
    if (!img) return res.status(502).json({ error: "no image returned" });

    const mime = img.inlineData.mimeType || "image/png";
    res.status(200).json({ image: `data:${mime};base64,${img.inlineData.data}` });
  } catch (e) {
    console.error("Handler crash:", e);
    res.status(500).json({ error: String(e?.message || e) });
  }
}

function safeMsg(text) {
  try { return JSON.parse(text)?.error?.message; } catch { return null; }
}
