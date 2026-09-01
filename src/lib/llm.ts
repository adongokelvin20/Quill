// Quill — LLM helper.
// Uses z-ai-web-dev-sdk (works in sandbox environment).

import ZAI from "z-ai-web-dev-sdk";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

let zaiInstance: any = null;
async function getZai() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

export async function callLLM(
  messages: ChatMessage[],
  maxTokens = 2000,
  temperature = 0.7
): Promise<string> {
  try {
    const zai = await getZai();
    const res = await zai.chat.completions.create({
      messages,
      temperature,
      max_tokens: maxTokens,
    });
    const content = res.choices?.[0]?.message?.content ?? "";
    if (!content) throw new Error("Z.ai returned empty response");
    return content;
  } catch (e) {
    console.error("[quill] LLM error:", e instanceof Error ? e.message : String(e));
    throw e;
  }
}
