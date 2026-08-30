// Quill — LLM helper.
// Uses Google Gemini API (publicly accessible).

const GEMINI_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Try these models in order — first one that works wins
const MODELS = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-001", "gemini-flash-latest", "gemini-pro"];

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
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };
  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg }] };
  }

  let lastError = "";
  for (const model of MODELS) {
    try {
      const res = await fetch(
        `${GEMINI_BASE}/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        lastError = `Gemini ${model} ${res.status}: ${text.slice(0, 200)}`;
        console.error(`[quill] ${lastError}`);
        // If 404, try next model. If 400/401/403, key is bad — stop.
        if (res.status === 404) continue;
        throw new Error(lastError);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (!text) {
        const reason = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? "unknown";
        throw new Error(`Gemini returned empty. Reason: ${reason}`);
      }
      return text;
    } catch (e) {
      if (e instanceof Error && e.message.includes("404")) continue;
      lastError = e instanceof Error ? e.message : String(e);
      console.error(`[quill] ${model} error:`, lastError);
      // For non-404 errors, try next model
      continue;
    }
  }

  throw new Error(`All Gemini models failed. Last error: ${lastError}`);
}
