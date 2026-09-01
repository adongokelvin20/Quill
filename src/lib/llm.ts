// Quill — LLM helper.
// Uses Google Gemini API (gemini-3.6-flash with thinking disabled).

const GEMINI_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function callLLM(
  messages: ChatMessage[],
  maxTokens = 2000,
  temperature = 0.7
): Promise<string> {
  if (!GEMINI_KEY) {
    throw new Error("GEMINI_API_KEY is not set. Go to Vercel Settings → Environment Variables and add it.");
  }

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
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg }] };
  }

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 429) {
      throw new Error("Gemini API quota exceeded. Free tier resets daily at midnight Pacific. Create a new key at https://aistudio.google.com/apikey");
    }
    throw new Error(`Gemini API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) {
    const reason = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? "unknown";
    throw new Error(`Gemini returned empty. Reason: ${reason}`);
  }
  return text;
}
