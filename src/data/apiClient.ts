import type { LocalEnglishMinerApi } from "./api";
import { createMemoryApi } from "./memoryApi";

let fallbackApi: LocalEnglishMinerApi | null = null;

export function getApiClient(): LocalEnglishMinerApi {
  if (window.localEnglishMiner) {
    return window.localEnglishMiner;
  }

  fallbackApi ??= createMemoryApi();
  return fallbackApi;
}
