// src/groq.ts
export async function pedirExcusaAGroq(
  apiKey: string,
  model: string,
  prompt: { system: string; user: string }
): Promise<Response> {
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: 1,
      max_tokens: 1200,
      // gpt-oss es un modelo de razonamiento: sin esto quema el budget pensando
      reasoning_effort: "low",
      stream: true,
    }),
  });
}
