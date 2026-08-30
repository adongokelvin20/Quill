// Quill — Direct Z.ai API client.
// Bypasses the z-ai-web-dev-sdk entirely and calls the API directly.
// Credentials are hardcoded as fallbacks (same as .z-ai-config file).
// On Vercel, set ZAI_TOKEN, ZAI_CHAT_ID, ZAI_USER_ID env vars to override.

const ZAI_BASE_URL = "https://internal-api.z.ai/v1";
const ZAI_TOKEN = process.env.ZAI_TOKEN ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNmQ0ZTM4MTgtMGUwMy00Y2M5LThmNWMtNzY3ZWRjNDRmMWMwIiwiY2hhdF9pZCI6ImNoYXQtM2IxZDliMmYtNjJlZS00NzgzLTkxM2UtMTQxYzkyMTgwYjg0IiwicGxhdGZvcm0iOiJ6YWkifQ.7Rz6iB2sdxskhOVYnLiah48Ij8jin_0GFLYloKbbCOE";
const ZAI_CHAT_ID = process.env.ZAI_CHAT_ID ?? "chat-3b1d9b2f-62ee-4783-913e-141c92180b84";
const ZAI_USER_ID = process.env.ZAI_USER_ID ?? "6d4e3818-0e03-4cc9-8f5c-767edc44f1c0";

function getHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Authorization": "Bearer Z.ai",
    "X-Z-AI-From": "Z",
    "X-Chat-Id": ZAI_CHAT_ID,
    "X-User-Id": ZAI_USER_ID,
    "X-Token": ZAI_TOKEN,
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

export async function createChatCompletion(req: ChatCompletionRequest): Promise<string> {
  const res = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      messages: req.messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.max_tokens ?? 2000,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Z.ai API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// Web search — returns search results
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function webSearch(query: string, count = 4): Promise<SearchResult[]> {
  try {
    const res = await fetch(`${ZAI_BASE_URL}/web_search`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ query, count }),
    });

    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? []).slice(0, count);
  } catch {
    return [];
  }
}

// Web reader — fetch and extract content from a URL
export async function webReader(url: string): Promise<string> {
  try {
    const res = await fetch(`${ZAI_BASE_URL}/web_reader`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ url }),
    });

    if (!res.ok) return "";
    const data = await res.json();
    return (data.markdown ?? data.text ?? "").slice(0, 50000);
  } catch {
    return "";
  }
}
