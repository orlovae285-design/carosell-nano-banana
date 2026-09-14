// api/text.js — Vercel serverless function (Node), без зовнішніх пакетів
// Текст каруселі через Gemini. САМ ПЕРЕБИРАЄ кілька моделей: якщо якась
// повертає 404 (model not found) — пробує наступну. Тож поломки через
// зникнення моделі більше не буде. + автоповтор при 429/503/500.

// Перелік моделей за пріоритетом (перша робоча буде використана).
// Якщо колись усі перестануть працювати — просто додай нову назву на початок.
const MODELS = [
  "gemini-2.5-flash",
  "gemini-3.5-flash",
  "gemini-3.7-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-3.6-flash",
];

const BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const MAX_RETRIES = 3;
const MAX_OUTPUT_TOKENS = 16384;

async function callOnce(model, key, prompt) {
  return fetch(BASE + model + ":generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingLevel: "low" },
      },
    }),
  });
}

async function callGeminiText(key, prompt) {
  let last = null;
  for (const model of MODELS) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let r;
      try {
        r = await callOnce(model, key, prompt);
      } catch (e) {
        last = { status: 0, text: String(e && e.message || e), model };
        break; // мережева помилка — до наступної моделі
      }
      if (r.ok) return { ok: true, data: await r.json(), model };

      const errText = await r.text();
      last = { status: r.status, text: errText, model };

      // 404 = цієї моделі немає → пробуємо наступну модель
      if (r.status === 404 || r.status === 400) break;

      // 429/503/500 = зайнято → зачекати й повторити ту саму модель
      if (r.status === 429 || r.status === 503 || r.status === 500) {
        const waitMs = Math.round(600 * Math.pow(2, attempt) + Math.random() * 900);
        await new Promise((res) => setTimeout(res, waitMs));
        continue;
      }
      // інша помилка (401 тощо) — далі перебирати сенсу немає
      return { ok: false, status: r.status, text: errText, model };
    }
  }
  return { ok: false, status: last?.status || 404, text: last?.text || "no working model found", model: last?.model };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const key = (process.env.GEMINI_KEY || "").trim();

  try {
    if (!key) return res.status(500).json({ error: "GEMINI_KEY is missing" });
    if (!process.env.STUDIO_SECRET) return res.status(500).json({ error: "STUDIO_SECRET is missing" });

    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const { prompt, secret } = body || {};

    if (!secret || secret !== process.env.STUDIO_SECRET) {
      return res.status(401).json({ error: "unauthorized" });
    }
    if (!prompt) return res.status(400).json({ error: "no prompt" });

    const out = await callGeminiText(key, prompt);
    if (!out.ok) {
      console.error("Gemini error:", out.status, out.model, out.text);
      const status = out.status === 429 ? 429 : 500;
      return res.status(status).json({ error: (safeMsg(out.text) || "gemini error") + " (models tried: " + MODELS.join(", ") + ")" });
    }

    const text =
      (out.data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    res.status(200).json({ text, model: out.model });
  } catch (e) {
    console.error("Handler crash:", e);
    res.status(500).json({ error: String(e?.message || e) });
  }
}

function safeMsg(text) {
  try { return JSON.parse(text)?.error?.message; } catch { return null; }
}
