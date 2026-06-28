/// <reference types="vite/client" />

import type { LocalEnglishMinerApi } from "./data/api";

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_GEMINI_MODEL?: string;
  readonly VITE_LM_WEB_PROVIDER?: "mock" | "ollama" | "gemini";
  readonly VITE_LM_WEB_TRANSLATION_PROVIDER?: "local" | "localMt" | "google" | "gemini" | "browser";
}

declare global {
  interface Window {
    localEnglishMiner?: LocalEnglishMinerApi;
  }
}
