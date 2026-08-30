// Quill — LLM helper.
// Uses Google Gemini API with multiple model fallbacks.

const GEMINI_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Models to try in order — first that works wins
const MODELS = [
  { name: "gemini-2.0-flash", thinking: false },
  { name: "gemini-1.5-flash", thinking: false },
  { name: "gemini-pro", thinking: false },
  { name: "gemini-3.6-flash", thinking: true },
];

export async function callLLM(
  messages: ChatMessage[],
  maxTokens = 2000,
  temperature = 0.7
): Promise<string> {
  if (!GEMINI_KEY) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  const systemMsg = messages.find(m => m.role === "system")?.content ?? "";
  const contents = messages
    .filter(m => m.role !== "system")
    .map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  let lastError = "";
  for (const model of MODELS) {
    try {
      const body: any = {
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: model.thinking ? maxTokens + 3000 : maxTokens,
        },
      };
      if (model.thinking) {
        body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
      }
      if (systemMsg) {
        body.systemInstruction = { parts: [{ text: systemMsg }] };
      }

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model.name}:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        lastError = `Gemini ${model.name} ${res.status}: ${text.slice(0, 150)}`;
        console.error(`[quill] ${lastError}`);
        if (res.status === 404) continue; // Model not found, try next
        if (res.status === 429) continue; // Quota exceeded, try next
        throw new Error(lastError); // Other error, stop
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (!text) {
        const reason = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? "unknown";
        lastError = `Gemini ${model.name} empty. Reason: ${reason}`;
        continue;
      }
      return text;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.error(`[quill] ${model.name} error:`, lastError.slice(0, 100));
      continue;
    }
  }

  throw new Error(`All Gemini models failed. Last: ${lastError}`);
}
