// Quill — LLM helper.
// Uses Google Gemini API (publicly accessible) for production.
// Falls back to Z.ai SDK for local development.

const GEMINI_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function callLLM(
  messages: ChatMessage[],
  maxTokens = 2000,
  temperature = 0.7
): Promise<string> {
  // Try Gemini first (if API key is set)
  if (GEMINI_KEY) {
    try {
      return await callGemini(messages, maxTokens, temperature);
    } catch (e) {
      console.error("[quill] Gemini error, trying Z.ai:", e instanceof Error ? e.message : String(e));
    }
  }

  // Fallback: Z.ai SDK (works locally, not on Vercel)
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const res = await zai.chat.completions.create({
      messages,
      temperature,
      max_tokens: maxTokens,
    });
    return res.choices?.[0]?.message?.content ?? "";
  } catch (e) {
    console.error("[quill] Z.ai error:", e instanceof Error ? e.message : String(e));
    throw new Error("No LLM API available. Set GEMINI_API_KEY env var.");
  }
}

async function callGemini(
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number
): Promise<string> {
  // Convert to Gemini format
  const systemMsg = messages.find(m => m.role === "system")?.content ?? "";
  const contents = messages
    .filter(m => m.role !== "system")
    .map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const body: any = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };
  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg }] };
  }

  const res = await fetch(
    `${GEMINI_URL}/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error("Gemini returned empty response");
  return text;
}
