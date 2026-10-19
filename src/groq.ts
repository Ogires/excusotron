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
      max_tokens: 200,
      stream: true,
    }),
  });
}
