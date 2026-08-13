// api/text.js — Vercel serverless function (Node)
// Генерує текст каруселі через Gemini (той самий ключ, що й для картинок).

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });

const MODEL = "gemini-3.6-flash"; // актуальна текстова модель Gemini

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { prompt, secret, search } = req.body || {};
    if (!secret || secret !== process.env.STUDIO_SECRET) {
      return res.status(401).json({ error: "unauthorized" });
    }
    if (!prompt) return res.status(400).json({ error: "no prompt" });

    const config = search ? { tools: [{ googleSearch: {} }] } : {};
    const result = await ai.models.generateContent({ model: MODEL, contents: prompt, config });

    const text =
      result.text ||
      (result?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");

    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
