// api/text.js — Vercel serverless function (Node), без зовнішніх пакетів
// Текст каруселі через Gemini: автоповтор при 429 + низький рівень "мислення",
// щоб роздуми не з'їдали бюджет відповіді (інакше промпти картинок виходять порожні).
const MODEL = "gemini-3.7-flash"; // можна змінити на "gemini-3.6-flash"
const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent";

const MAX_RETRIES = 3;
const MAX_OUTPUT_TOKENS = 8192;

async function callGeminiText(key, prompt) {
  let last = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          thinkingConfig: { thinkingLevel: "low" }, // менше роздумів → більше місця під відповідь
        },
      }),
    });

    if (r.ok) return { ok: true, data: await r.json() };

    const errText = await r.text();
    last = { status: r.status, text: errText };

    if (r.status === 429 || r.status === 503 || r.status === 500) {
      const waitMs = Math.round(600 * Math.pow(2, attempt) + Math.random() * 900);
      await new Promise((res) => setTimeout(res, waitMs));
      continue;
    }
    return { ok: false, status: r.status, text: errText };
  }
  return { ok: false, status: last?.status || 429, text: last?.text || "rate limited after retries" };
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
      console.error("Gemini error:", out.status, out.text);
      const status = out.status === 429 ? 429 : 500;
      return res.status(status).json({ error: safeMsg(out.text) || "gemini error" });
    }

    const text =
      (out.data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    res.status(200).json({ text });
  } catch (e) {
    console.error("Handler crash:", e);
    res.status(500).json({ error: String(e?.message || e) });
  }
}

function safeMsg(text) {
  try { return JSON.parse(text)?.error?.message; } catch { return null; }
}
