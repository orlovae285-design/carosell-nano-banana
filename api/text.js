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
        },
      }),
    });

    if (r.ok) return { ok: true, data: await r.json() };

    const errText = await r.text();
    last = { status: r.status, text: errText };

    // Якщо це помилка 429 (Too Many Requests) або серверні збої
    if (r.status === 429 || r.status === 503 || r.status === 500) {
      // Збільшуємо час очікування: експоненційний бекоф із рандомізацією (починаємо з ~2-3 секунд)
      const waitMs = Math.round(2000 * Math.pow(2, attempt) + Math.random() * 1000);
      console.warn(`Отримано статус ${r.status}. Повторна спроба #${attempt + 1} через ${waitMs}мс...`);
      await new Promise((res) => setTimeout(res, waitMs));
      continue;
    }
    return { ok: false, status: r.status, text: errText };
  }
  return { ok: false, status: last?.status || 429, text: last?.text || "rate limited after retries" };
}
