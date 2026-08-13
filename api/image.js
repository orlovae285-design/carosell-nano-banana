// api/image.js — Vercel serverless function (Node)
// Дзвонить у Nano Banana (Gemini image) з твоїм ключем, який лежить у змінній оточення.
// Ключ НІКОЛИ не потрапляє у браузер — тільки на сервері.

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });

// Моделі Nano Banana:
const MODELS = {
  lite: "gemini-3.1-flash-lite-image",   // Nano Banana 2 Lite (найдешевша, ~€0.02)
  nb2: "gemini-3.1-flash-image-preview", // Nano Banana 2
  pro: "gemini-3-pro-image-preview",     // Nano Banana Pro (найкраща якість)
};

export default async function handler(req, res) {
  // CORS: дозволяємо студії з іншого домену звертатися сюди
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    // Захист: приймаємо запит лише якщо прийшло правильне секретне слово.
    const { prompt, secret, model } = req.body || {};
    if (!secret || secret !== process.env.STUDIO_SECRET) {
      return res.status(401).json({ error: "unauthorized" });
    }
    if (!prompt) return res.status(400).json({ error: "no prompt" });

    const chosen = MODELS[model] || MODELS.lite;

    const result = await ai.models.generateContent({
      model: chosen,
      contents:
        prompt +
        ", vertical 4:5 format, premium cinematic, clean background with empty space for text, absolutely no text, no letters, no words, no watermark",
    });

    const parts = result?.candidates?.[0]?.content?.parts || [];
    const img = parts.find((p) => p.inlineData);
    if (!img) return res.status(502).json({ error: "no image returned" });

    res.status(200).json({ image: `data:image/png;base64,${img.inlineData.data}` });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
