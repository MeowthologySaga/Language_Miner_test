import { MockProvider } from "./mockProvider";
import { OllamaProvider } from "./ollamaProvider";
import { GeminiProvider } from "./geminiProvider";
import type { LLMProvider } from "./types";
import type { AppSettings } from "../../shared/types";

export function createProvider(settings: AppSettings): LLMProvider {
  if (settings.providerName === "gemini") {
    return new GeminiProvider({
      apiKey: settings.geminiApiKey,
      model: settings.geminiModel,
      plan: settings.geminiPlan
    });
  }

  if (settings.providerName === "ollama") {
    return new OllamaProvider({
      baseUrl: settings.ollamaBaseUrl,
      model: settings.ollamaModel
    });
  }

  return new MockProvider();
}
