// api/text.js — Vercel serverless function (Node), без зовнішніх пакетів
const MODEL = "gemini-2.5-flash";
const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const key = (process.env.GEMINI_KEY || "").trim();

  // ── ДІАГНОСТИКА 1: чи бачить функція ключ ──
  // Відкрий:  https://ТВІЙ-ДОМЕН/api/text?debug=1
  if (req.method === "GET" && req.query && req.query.debug) {
    return res.status(200).json({
      hasGeminiKey: !!key,
      geminiKeyLength: key.length,
      geminiKeyStartsWith: key.slice(0, 4),
      hasStudioSecret: !!process.env.STUDIO_SECRET,
      nodeVersion: process.version,
    });
  }

  // ── ДІАГНОСТИКА 2: реальний тестовий виклик до Gemini ──
  // Відкрий:  https://ТВІЙ-ДОМЕН/api/text?ping=1
  // Покаже точну відповідь Google (статус + текст помилки або відповідь).
  if (req.method === "GET" && req.query && req.query.ping) {
    try {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Say hi in one word" }] }] }),
      });
      const raw = await r.text();
      return res.status(200).json({ httpStatus: r.status, ok: r.ok, gemini: raw.slice(0, 900) });
    } catch (e) {
      return res.status(200).json({ fetchThrew: String(e && e.message || e) });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

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

    // Ключ передаємо через ЗАГОЛОВОК (надійніше для нових AQ. ключів)
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    const data = await r.json();
    if (!r.ok) {
      console.error("Gemini error:", JSON.stringify(data));
      return res.status(500).json({ error: data?.error?.message || "gemini error" });
    }

    const text =
      (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    res.status(200).json({ text });
  } catch (e) {
    console.error("Handler crash:", e);
    res.status(500).json({ error: String(e?.message || e) });
  }
}
