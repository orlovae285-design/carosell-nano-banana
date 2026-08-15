// api/text.js — Vercel serverless function (Node), без зовнішніх пакетів
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── ДІАГНОСТИКА ──
  // Відкрий у браузері:  https://ТВІЙ-ДОМЕН/api/text?debug=1
  // Покаже, чи бачить функція ключ (значення ключа НЕ розкривається).
  if (req.method === "GET") {
    const k = process.env.GEMINI_KEY || "";
    return res.status(200).json({
      hasGeminiKey: !!process.env.GEMINI_KEY,       // true = ключ видно функції
      geminiKeyLength: k.length,                    // нормальний ключ ~39 символів
      geminiKeyStartsWith: k.slice(0, 4),           // має бути "AIza"
      hasTrailingSpaceOrNewline: k !== k.trim(),    // true = зайвий пробіл/перенос → погано
      hasStudioSecret: !!process.env.STUDIO_SECRET,
      nodeVersion: process.version,
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    if (!process.env.GEMINI_KEY) {
      return res.status(500).json({ error: "GEMINI_KEY is missing in Environment Variables" });
    }
    if (!process.env.STUDIO_SECRET) {
      return res.status(500).json({ error: "STUDIO_SECRET is missing in Environment Variables" });
    }

    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const { prompt, secret } = body || {};

    if (!secret || secret !== process.env.STUDIO_SECRET) {
      return res.status(401).json({ error: "unauthorized" });
    }
    if (!prompt) return res.status(400).json({ error: "no prompt" });

    const key = process.env.GEMINI_KEY.trim();
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
      encodeURIComponent(key);

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
