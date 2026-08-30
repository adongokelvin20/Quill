// Quill — LLM helper.
// Uses Google Gemini API (publicly accessible).

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
  if (!GEMINI_KEY) {
    throw new Error("GEMINI_API_KEY is not set. Go to Vercel Settings → Environment Variables and add it.");
  }

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
    generationConfig: { temperature, maxOutputTokens: maxTokens },
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
    throw new Error(`Gemini API ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) {
    // Check if content was blocked
    const blockReason = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? "unknown";
    throw new Error(`Gemini returned empty response. Reason: ${blockReason}. Full: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return text;
}
