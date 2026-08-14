// api/image.js — Vercel serverless function (Node), без зовнішніх пакетів
const MODELS = {
  lite: "gemini-2.5-flash-lite-image",   // Nano Banana 2 Lite
  nb2: "gemini-2.5-flash-image-preview", // Nano Banana 2
  pro: "gemini-2,5-pro-image-preview",     // Nano Banana Pro
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { prompt, secret, model } = req.body || {};
    if (!secret || secret !== process.env.STUDIO_SECRET) {
      return res.status(401).json({ error: "unauthorized" });
    }
    if (!prompt) return res.status(400).json({ error: "no prompt" });

    const chosen = MODELS[model] || MODELS.lite;
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      chosen + ":generateContent?key=" + process.env.GEMINI_KEY;

    const full = prompt +
      ", vertical 4:5 format, premium cinematic, clean background with empty space for text, absolutely no text, no letters, no words, no watermark";

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: full }] }] }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(500).json({ error: data?.error?.message || "gemini error" });

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const img = parts.find((p) => p.inlineData || p.inline_data);
    const inline = img && (img.inlineData || img.inline_data);
    if (!inline) return res.status(502).json({ error: "no image returned" });

    res.status(200).json({ image: "data:image/png;base64," + inline.data });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
