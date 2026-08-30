// Quill — LLM helper.
// Primary: Google Gemini API
// Fallback: Pollinations text API (free, no key needed)

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
  // Try Gemini first
  if (GEMINI_KEY) {
    try {
      return await callGemini(messages, maxTokens, temperature);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.error("[quill] Gemini error:", err.slice(0, 100));
      // If it's a 429 (quota) or 404 (model), fall through to Pollinations
      if (!err.includes("429") && !err.includes("404")) {
        throw e; // Re-throw other errors
      }
    }
  }

  // Fallback: Pollinations text API (free, no key, publicly accessible)
  return await callPollinations(messages, maxTokens, temperature);
}

async function callGemini(
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number
): Promise<string> {
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
      maxOutputTokens: maxTokens + 2000,
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
    throw new Error(`Gemini API ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) {
    const reason = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? "unknown";
    throw new Error(`Gemini empty. Reason: ${reason}`);
  }
  return text;
}

async function callPollinations(
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number
): Promise<string> {
  const res = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai",
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pollinations API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Pollinations returned empty response");
  return text;
}
