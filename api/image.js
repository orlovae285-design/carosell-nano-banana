// api/image.js — Vercel serverless function (Node), БЕЗ зовнішніх пакетів
// Генерує картинку через Nano Banana (Gemini image). Ключ лежить у змінній оточення,
// у браузер НІКОЛИ не потрапляє.
const MODEL = "gemini-3.1-flash-image"; // Nano Banana 2. Для кращої якості: "gemini-3-pro-image-preview"
const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent";

const SUFFIX =
  ", vertical 4:5 format, premium cinematic, clean background with empty space for text, absolutely no text, no letters, no words, no watermark";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const key = (process.env.GEMINI_KEY || "").trim();

  // ── ДІАГНОСТИКА: реальний тестовий виклик генерації картинки ──
  // Відкрий у браузері:  https://ТВІЙ-ДОМЕН/api/image?ping=1
  if (req.method === "GET" && req.query && req.query.ping) {
    try {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ parts: [{ text: "a red apple on a white table" }] }] }),
      });
      if (!r.ok) {
        const errText = await r.text();
        return res.status(200).json({ httpStatus: r.status, ok: false, model: MODEL, gemini: errText.slice(0, 900) });
      }
      const data = await r.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const img = parts.find((p) => p.inlineData);
      return res.status(200).json({
        httpStatus: r.status,
        ok: true,
        model: MODEL,
        gotImage: !!img,
        imageBytes: img ? (img.inlineData.data || "").length : 0,
      });
    } catch (e) {
      return res.status(200).json({ fetchThrew: String(e && e.message || e), model: MODEL });
    }
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

    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt + SUFFIX }] }] }),
    });

    const data = await r.json();
    if (!r.ok) {
      console.error("Gemini image error:", JSON.stringify(data));
      return res.status(500).json({ error: data?.error?.message || "gemini error" });
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const img = parts.find((p) => p.inlineData);
    if (!img) return res.status(502).json({ error: "no image returned" });

    const mime = img.inlineData.mimeType || "image/png";
    res.status(200).json({ image: `data:${mime};base64,${img.inlineData.data}` });
  } catch (e) {
    console.error("Handler crash:", e);
    res.status(500).json({ error: String(e?.message || e) });
  }
}
