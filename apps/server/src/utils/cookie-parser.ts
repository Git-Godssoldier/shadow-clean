import { ApiKeys } from "@repo/types";

export function parseApiKeysFromCookies(cookieHeader?: string): ApiKeys {
  if (!cookieHeader) {
    return {
      openai: undefined,
      anthropic: undefined,
      openrouter: undefined,
      // groq: undefined,
      // ollama: undefined,
    };
  }

  const cookies = cookieHeader
    .split(";")
    .reduce((acc: Record<string, string>, cookie) => {
      const trimmedCookie = cookie.trim();
      const firstEqualsIndex = trimmedCookie.indexOf("=");
      if (firstEqualsIndex === -1) return acc;

      const key = trimmedCookie.substring(0, firstEqualsIndex);
      const value = trimmedCookie.substring(firstEqualsIndex + 1);

      if (key && value) {
        // Only decode if the value contains % (URL-encoded)
        acc[key] = value.includes("%") ? decodeURIComponent(value) : value;
      }
      return acc;
    }, {});

  return {
    openai: cookies["openai-key"] || undefined,
    anthropic: cookies["anthropic-key"] || undefined,
    openrouter: cookies["openrouter-key"] || undefined,
    // groq: cookies["groq-key"] || undefined,
    // ollama: cookies["ollama-key"] || undefined,
  };
}
