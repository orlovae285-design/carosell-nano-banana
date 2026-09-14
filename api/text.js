// api/text.js — Vercel serverless function (Node), без зовнішніх пакетів
// Текст каруселі через Gemini. Перебирає моделі: на 404 (немає моделі) або
// 429 (ліміт/квота цієї моделі) — переходить до наступної.
// gemini-2.5-flash перша: це стабільна модель зі стандартною квотою Tier 1.

const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  "gemini-flash-latest",
];

const BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
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
    for (let attempt = 0; attempt < 2; attempt++) {
      let r;
      try {
        r = await callOnce(model, key, prompt);
      } catch (e) {
        last = { status: 0, text: String(e && e.message || e), model };
        break;
      }
      if (r.ok) return { ok: true, data: await r.json(), model };

      const errText = await r.text();
      last = { status: r.status, text: errText, model };

      if (r.status === 503 || r.status === 500) {
        if (attempt === 0) { await new Promise((res) => setTimeout(res, 800 + Math.random() * 500)); continue; }
        break;
      }
      // 404/400/429 — ця модель зараз недоступна → одразу наступна модель
      break;
    }
  }
  return { ok: false, status: last?.status || 404, text: last?.text || "no working model", model: last?.model };
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
      const full = safeMsg(out.text) || "";
      if (out.status === 429) {
        return res.status(429).json({ error: "Ліміт/квота Gemini (429): " + full + " — зачекай 1-2 хв або перевір квоти в Google Cloud." });
      }
      return res.status(500).json({ error: (full || "gemini error") + " [спроби: " + MODELS.join(", ") + "]" });
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
