// api/text.js — Vercel serverless function (Node), без зовнішніх пакетів
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { prompt, secret } = req.body || {};
    if (!secret || secret !== process.env.STUDIO_SECRET) {
      return res.status(401).json({ error: "unauthorized" });
    }
    if (!prompt) return res.status(400).json({ error: "no prompt" });

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
      process.env.GEMINI_KEY;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(500).json({ error: data?.error?.message || "gemini error" });
    }

    const text =
      (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");

    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
