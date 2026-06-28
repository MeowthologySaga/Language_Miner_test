import {
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  Check,
  Clock3,
  CreditCard,
  Home,
  Languages,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  X
} from "lucide-react";
import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { CardGenerationUsageEstimate } from "../components/CardGenerationUsageEstimate";
import type { LocalEnglishMinerApi, WebReaderBrowserState } from "../data/api";
import type { LLMProvider } from "../services/llm/types";
import { createBrowserSentenceFallbackCardData } from "../shared/browserSentenceFallbackCard";
import { createStudyCardFromGenerated } from "../shared/cardFactory";
import { estimateCardGenerationUsage } from "../shared/cardGenerationUsage";
import {
  assessCardInputLanguage,
  formatLanguageCode,
  withInputLanguageMetadata,
  type InputLanguagePolicyAssessment
} from "../shared/inputLanguagePolicy";
import type {
  AppSettings,
  InputLanguageSourceKind,
  StudyCard,
  WebReaderLifeMiningState
} from "../shared/types";
import { extractSentenceContext } from "../utils/sentenceExtraction";
import { normalizeWebReaderAddress, WEB_READER_DEFAULT_URL } from "./webReaderAddress";
import {
  WEB_READER_MIN_WEBVIEW_MOUNT_HEIGHT,
  getWebReaderHubModel,
  getWebReaderHubPurposeLabel,
  getWebReaderSourceStyle,
  readWebReaderSession,
  webReaderCardColorKeys,
  writeWebReaderSession,
  type WebReaderHubSource,
  type WebReaderSessionState
} from "./webReaderHub";

type WebReaderPageProps = {
  api: LocalEnglishMinerApi;
  openUrlRequest?: {
    requestId: number;
    url: string;
    label?: string;
  } | null;
  provider: LLMProvider;
  settings: AppSettings;
  sidebarOverlayOpen?: boolean;
  onCardsChanged: () => Promise<void>;
  onLifeLogsChanged: () => Promise<void>;
  onSettingsChange?: (settings: AppSettings) => void;
  onSwitchToLanguageProfile?: (languageCode: string) => boolean;
};

type WebReaderSelection = {
  selectedText: string;
  sourceSentence?: string;
  fullText: string;
  selectionOffset?: number;
  title: string;
  url: string;
  rect: {
    left: number;
    top: number;
    right?: number;
    bottom?: number;
    width: number;
    height: number;
  };
};

type WebReaderPopoverPosition = {
  left: number;
  top: number;
};

type WebReaderPopoverActionPayload = WebReaderSelection & {
  selectedTerms?: string[];
  sourceSentence?: string;
};

type WebReaderPopoverAction = {
  id?: unknown;
  action?: unknown;
  mode?: unknown;
  payload?: WebReaderPopoverActionPayload;
};

type WebReaderLanguageMismatch = {
  card: StudyCard;
  assessment: InputLanguagePolicyAssessment;
  pageUrl: string;
  sourceSentence: string;
};

type WebReaderTranslatedPageState = {
  sourceUrl: string;
  targetLanguageCode: string;
  openedAt: string;
};

export function WebReaderPage({
  api,
  openUrlRequest,
  provider,
  settings,
  sidebarOverlayOpen = false,
  onCardsChanged,
  onLifeLogsChanged,
  onSettingsChange,
  onSwitchToLanguageProfile
}: WebReaderPageProps) {
  const supportsWebview = useMemo(() => Boolean(api.webReader), [api.webReader]);
  const webSurfaceRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const lastSelectionKeyRef = useRef("");
  const handledPopoverActionIdsRef = useRef(new Set<string>());
  const pendingPopoverCardRef = useRef<StudyCard | null>(null);
  const initialSessionRef = useRef<WebReaderSessionState | null>(null);
  if (!initialSessionRef.current) {
    initialSessionRef.current = readWebReaderSession();
  }
  const [readerUrl, setReaderUrl] = useState(initialSessionRef.current.readerUrl);
  const [addressValue, setAddressValue] = useState(initialSessionRef.current.addressValue);
  const [isHubVisible, setIsHubVisible] = useState(initialSessionRef.current.isHubVisible);
  const [activeHubCategoryId, setActiveHubCategoryId] = useState("community-expression");
  const [recentHubSources, setRecentHubSources] = useState<WebReaderHubSource[]>([]);
  const [customCategoryLabel, setCustomCategoryLabel] = useState("");
  const [customCategoryPurpose, setCustomCategoryPurpose] = useState<"" | "input-reading" | "output-life">("");
  const [customSourceCategoryId, setCustomSourceCategoryId] = useState("community-expression");
  const [customSourceLabel, setCustomSourceLabel] = useState("");
  const [customSourceUrl, setCustomSourceUrl] = useState("");
  const [isCustomLibraryManagerOpen, setIsCustomLibraryManagerOpen] = useState(false);
  const [isCustomLibraryEditing, setIsCustomLibraryEditing] = useState(false);
  const [pageTitle, setPageTitle] = useState(initialSessionRef.current.pageTitle);
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [statusMessage, setStatusMessage] = useState("읽을 웹페이지를 열고 문장을 드래그하세요.");
  const [lifeMiningState, setLifeMiningState] = useState<WebReaderLifeMiningState>({
    enabled: false,
    mode: "off",
    message: "웹 리더 홈"
  });
  const [selection, setSelection] = useState<WebReaderSelection | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<WebReaderPopoverPosition | null>(null);
  const [translationText, setTranslationText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [isTranslatingPage, setIsTranslatingPage] = useState(false);
  const [isSavingCandidate, setIsSavingCandidate] = useState(false);
  const [isSavingCard, setIsSavingCard] = useState(false);
  const [languageMismatch, setLanguageMismatch] = useState<WebReaderLanguageMismatch | null>(null);
  const [translatedPageState, setTranslatedPageState] =
    useState<WebReaderTranslatedPageState | null>(null);

  const sourceLanguage = settings.learningProfile.targetLanguage;
  const outputLanguage = settings.learningProfile.nativeLanguage;
  const sourceLanguageCode = useMemo(
    () => sourceLanguage.code.trim().toLowerCase().split("-")[0] || sourceLanguage.code,
    [sourceLanguage.code]
  );
  const webReaderHubModel = useMemo(
    () =>
      getWebReaderHubModel(
        sourceLanguageCode,
        settings.webReaderCustomSources ?? [],
        settings.webReaderCustomCategories ?? []
      ),
    [settings.webReaderCustomCategories, settings.webReaderCustomSources, sourceLanguageCode]
  );
  const activeHubCategory =
    webReaderHubModel.categories.find((category) => category.id === activeHubCategoryId) ??
    webReaderHubModel.categories[0];
  const selectedCustomSourceCategory =
    webReaderHubModel.categories.find((category) => category.id === customSourceCategoryId) ??
    webReaderHubModel.categories[0];
  const profileCustomCategories = useMemo(
    () =>
      (settings.webReaderCustomCategories ?? []).filter(
        (category) =>
          category.languageCode.trim().toLowerCase().split("-")[0] === sourceLanguageCode
      ),
    [settings.webReaderCustomCategories, sourceLanguageCode]
  );
  const profileCustomSources = useMemo(
    () =>
      (settings.webReaderCustomSources ?? []).filter(
        (source) => source.languageCode.trim().toLowerCase().split("-")[0] === sourceLanguageCode
      ),
    [settings.webReaderCustomSources, sourceLanguageCode]
  );
  const selectionUsageEstimate = useMemo(() => {
    if (!selection?.selectedText) {
      return null;
    }
    const context = getSelectionContext(selection);
    return estimateCardGenerationUsage({
      selectedText: context.selectedText,
      sourceSentence: context.sourceSentence,
      beforeSentence: context.beforeSentence,
      afterSentence: context.afterSentence,
      readerTextContext:
        context.extractionConfidence === "fallback"
          ? context.sourceSentence
          : context.normalizedFullText,
      settings
    });
  }, [selection, settings]);
  const lifeMiningStatusText = useMemo(() => {
    if (isHubVisible) {
      return "라이프 마이닝 대기";
    }
    if (!lifeMiningState.enabled) {
      return lifeMiningState.message || "라이프 마이닝 OFF";
    }
    const modeLabel = lifeMiningState.mode === "auto" ? "자동+선택" : "선택";
    const siteLabel =
      lifeMiningState.siteKey && lifeMiningState.siteKey !== "genericWeb"
        ? lifeMiningState.siteKey
        : "일반 웹";
    return `라이프 마이닝 ON · ${siteLabel} · ${modeLabel}`;
  }, [isHubVisible, lifeMiningState]);
  const isTranslatedPageActive = useMemo(
    () => isTranslatedReaderUrl(readerUrl, translatedPageState, sourceLanguage.code),
    [readerUrl, sourceLanguage.code, translatedPageState]
  );
  const translatedReaderSourceUrl = useMemo(
    () => getTranslatedReaderSourceUrl(readerUrl, translatedPageState),
    [readerUrl, translatedPageState]
  );
  const canTranslateCurrentPage =
    !isHubVisible &&
    Boolean(api.webReader) &&
    !isTranslatingPage &&
    (isTranslatedPageActive ? Boolean(translatedReaderSourceUrl) : isHttpReaderUrl(readerUrl));

  const applyBrowserState = useCallback((state: WebReaderBrowserState | null | undefined) => {
    if (!state) {
      return;
    }
    setCanGoBack(state.canGoBack);
    setCanGoForward(state.canGoForward);
    setIsLoading(state.isLoading);
    if (state.url && state.url !== "about:blank") {
      setReaderUrl(state.url);
      setAddressValue(state.url);
    }
    if (state.title) {
      setPageTitle(state.title);
    }
  }, []);

  useEffect(() => {
    writeWebReaderSession({
      readerUrl,
      addressValue,
      isHubVisible,
      pageTitle
    });
  }, [addressValue, isHubVisible, pageTitle, readerUrl]);

  useEffect(() => {
    if (!webReaderHubModel.categories.some((category) => category.id === activeHubCategoryId)) {
      setActiveHubCategoryId(webReaderHubModel.categories[0]?.id ?? "community-expression");
    }
  }, [activeHubCategoryId, webReaderHubModel.categories]);

  useEffect(() => {
    if (!webReaderHubModel.categories.some((category) => category.id === customSourceCategoryId)) {
      setCustomSourceCategoryId(webReaderHubModel.categories[0]?.id ?? "community-expression");
    }
  }, [customSourceCategoryId, webReaderHubModel.categories]);

  const syncBrowserViewBounds = useCallback(() => {
    const browserView = api.webReader;
    const surface = webSurfaceRef.current;
    if (!browserView || !surface || isHubVisible) {
      return;
    }

    const rect = surface.getBoundingClientRect();
    const bounds = {
      x: Math.max(0, Math.round(rect.left)),
      y: Math.max(0, Math.round(rect.top)),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height))
    };
    if (bounds.width <= 1 || bounds.height < WEB_READER_MIN_WEBVIEW_MOUNT_HEIGHT) {
      return;
    }
    void browserView.attach({ url: readerUrl, bounds }).then(applyBrowserState).catch(() => {
      setStatusMessage("웹 리더 화면을 배치하지 못했습니다.");
    });
  }, [api.webReader, applyBrowserState, isHubVisible, readerUrl, sidebarOverlayOpen]);

  useEffect(() => {
    if (!isHubVisible || !api.webReader) {
      return;
    }
    void api.webReader.detach().catch(() => {
      // The BrowserView may already be detached while the hub is visible.
    });
  }, [api.webReader, isHubVisible]);

  useLayoutEffect(() => {
    if (!api.webReader) {
      return;
    }

    syncBrowserViewBounds();
    const surface = webSurfaceRef.current;
    if (!surface || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncBrowserViewBounds);
      return () => window.removeEventListener("resize", syncBrowserViewBounds);
    }

    const observer = new ResizeObserver(syncBrowserViewBounds);
    observer.observe(surface);
    window.addEventListener("resize", syncBrowserViewBounds);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncBrowserViewBounds);
    };
  }, [api.webReader, syncBrowserViewBounds]);

  useEffect(() => {
    if (!api.webReader || isHubVisible) {
      return;
    }
    const timer = window.setInterval(() => {
      void api.webReader?.getState().then(applyBrowserState).catch(() => {
        // BrowserView state polling is best effort while navigating.
      });
    }, 800);
    return () => window.clearInterval(timer);
  }, [api.webReader, applyBrowserState, isHubVisible]);

  useEffect(() => {
    if (!api.webReader?.getLifeMiningState || isHubVisible) {
      setLifeMiningState({
        enabled: false,
        mode: "off",
        message: isHubVisible ? "허브 대기 중" : "라이프 마이닝 상태를 확인할 수 없습니다."
      });
      return;
    }

    let disposed = false;
    const refreshLifeMiningState = () => {
      void api.webReader
        ?.getLifeMiningState()
        .then((state) => {
          if (!disposed) {
            setLifeMiningState(state);
          }
        })
        .catch(() => {
          if (!disposed) {
            setLifeMiningState({
              enabled: false,
              mode: "off",
              message: "라이프 마이닝 상태 확인 실패"
            });
          }
        });
    };

    refreshLifeMiningState();
    const timer = window.setInterval(refreshLifeMiningState, 2000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [api.webReader, isHubVisible]);

  useEffect(() => {
    const browserView = api.webReader;
    if (!browserView) {
      return;
    }
    return () => {
      void browserView.detach().catch(() => {
        // BrowserView may already be destroyed with the window.
      });
    };
  }, [api.webReader]);

  const updateSelectionFromWebview = useCallback(async (showEmptyMessage = false) => {
    if (api.webReader) {
      const stage = stageRef.current;
      const surface = webSurfaceRef.current;
      if (!stage || !surface) {
        return null;
      }

      try {
        const snapshot = (await api.webReader.getSelection()) as WebReaderSelection | null;
        if (!snapshot?.selectedText) {
          lastSelectionKeyRef.current = "";
          setSelection(null);
          setPopoverPosition(null);
          setTranslationText("");
          if (showEmptyMessage) {
            setStatusMessage("먼저 웹페이지에서 문장을 드래그해 선택하세요.");
          }
          return null;
        }

        const surfaceRect = surface.getBoundingClientRect();
        const stageRect = stage.getBoundingClientRect();
        const popoverWidth = 350;
        const left = clamp(
          surfaceRect.left - stageRect.left + snapshot.rect.left,
          12,
          Math.max(12, stageRect.width - popoverWidth - 12)
        );
        const top = clamp(
          surfaceRect.top - stageRect.top + snapshot.rect.top + snapshot.rect.height + 10,
          12,
          Math.max(12, stageRect.height - 190)
        );
        const selectionKey = [
          snapshot.url,
          snapshot.selectedText,
          "sourceSentence" in snapshot ? snapshot.sourceSentence : "",
          "selectionOffset" in snapshot ? snapshot.selectionOffset : ""
        ].join("|");
        if (selectionKey !== lastSelectionKeyRef.current) {
          lastSelectionKeyRef.current = selectionKey;
          setTranslationText("");
          void api.webReader.showSelectionPopover?.().catch(() => {
            // The in-page popover is a convenience layer; selection polling still drives card creation.
          });
        }
        setSelection(snapshot);
        setPopoverPosition({ left, top });
        return snapshot;
      } catch {
        if (showEmptyMessage) {
          setStatusMessage("웹페이지의 선택 문장을 읽어오지 못했습니다.");
        }
        return null;
      }
    }

    if (showEmptyMessage) {
      setStatusMessage("앱에서 웹 리더를 열었을 때만 선택 문장을 읽을 수 있습니다.");
    }
    return null;
/*

    try {
      const snapshot = await executeWebviewScript<WebReaderSelection | null>(
        webview,
        `(() => {
          const selection = window.getSelection();
          const selectedText = (selection && selection.toString() || "").replace(/\\s+/g, " ").trim();
          if (!selection || selection.rangeCount === 0 || !selectedText) {
            return null;
          }
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const preSelectionRange = document.createRange();
          if (document.body) {
            preSelectionRange.selectNodeContents(document.body);
            preSelectionRange.setEnd(range.startContainer, range.startOffset);
          }
          return {
            selectedText,
            fullText: (document.body && document.body.innerText || "").slice(0, 80000),
            selectionOffset: preSelectionRange.toString().length,
            title: document.title || "",
            url: location.href,
            rect: {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height
            }
          };
        })()`
      );

      if (!snapshot?.selectedText) {
        lastSelectionKeyRef.current = "";
        setSelection(null);
        setPopoverPosition(null);
        setTranslationText("");
        if (showEmptyMessage) {
          setStatusMessage("먼저 웹페이지에서 문장을 드래그해 선택하세요.");
        }
        return null;
      }

      const webviewRect = webview.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const popoverWidth = 350;
      const left = clamp(
        webviewRect.left - stageRect.left + snapshot.rect.left,
        12,
        Math.max(12, stageRect.width - popoverWidth - 12)
      );
      const top = clamp(
        webviewRect.top - stageRect.top + snapshot.rect.top + snapshot.rect.height + 10,
        12,
        Math.max(12, stageRect.height - 190)
      );
      const selectionKey = [
        snapshot.url,
        snapshot.selectedText,
        Math.round(snapshot.rect.left),
        Math.round(snapshot.rect.top)
      ].join("|");

      if (selectionKey !== lastSelectionKeyRef.current) {
        lastSelectionKeyRef.current = selectionKey;
        setTranslationText("");
      }
      setSelection(snapshot);
      setPopoverPosition({ left, top });
      return snapshot;
    } catch {
      if (showEmptyMessage) {
        setStatusMessage("이 페이지의 선택 문장을 읽어오지 못했습니다.");
      }
      return null;
    }
*/
  }, [api.webReader]);

  useEffect(() => {
    if (!supportsWebview || isHubVisible) {
      return;
    }
    const timer = window.setInterval(() => {
      void updateSelectionFromWebview(false);
    }, 650);
    return () => window.clearInterval(timer);
  }, [isHubVisible, supportsWebview, updateSelectionFromWebview]);

/*
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }

    const handleStart = () => {
      isWebviewDomReadyRef.current = false;
      setIsLoading(true);
      setStatusMessage("페이지를 불러오는 중입니다.");
    };
    const handleDomReady = () => {
      isWebviewDomReadyRef.current = true;
      queueWebviewSizeSync();
      refreshNavigationState();
    };
    const handleStop = () => {
      setIsLoading(false);
      queueWebviewSizeSync();
      refreshNavigationState();
      setStatusMessage("문장을 드래그하면 카드/후보/번역 도구가 떠요.");
    };
    const handleNavigate = (event: Event) => {
      const url = (event as WebviewNavigationEvent).url;
      if (url) {
        lastLoadedWebviewUrlRef.current = url;
        setReaderUrl(url);
        setAddressValue(url);
      }
      refreshNavigationState();
      setSelection(null);
      setPopoverPosition(null);
      setTranslationText("");
    };
    const handleTitle = (event: Event) => {
      const title = (event as WebviewNavigationEvent).title;
      if (title) {
        setPageTitle(title);
      }
    };
    const handleFail = (event: Event) => {
      const failure = event as WebviewNavigationEvent;
      if (failure.errorCode === -3) {
        return;
      }
      setIsLoading(false);
      setStatusMessage(failure.errorDescription || "페이지를 불러오지 못했습니다.");
    };

    webview.addEventListener("did-start-loading", handleStart);
    webview.addEventListener("dom-ready", handleDomReady);
    webview.addEventListener("did-stop-loading", handleStop);
    webview.addEventListener("did-navigate", handleNavigate);
    webview.addEventListener("did-navigate-in-page", handleNavigate);
    webview.addEventListener("page-title-updated", handleTitle);
    webview.addEventListener("did-fail-load", handleFail);
    return () => {
      webview.removeEventListener("did-start-loading", handleStart);
      webview.removeEventListener("dom-ready", handleDomReady);
      webview.removeEventListener("did-stop-loading", handleStop);
      webview.removeEventListener("did-navigate", handleNavigate);
      webview.removeEventListener("did-navigate-in-page", handleNavigate);
      webview.removeEventListener("page-title-updated", handleTitle);
      webview.removeEventListener("did-fail-load", handleFail);
    };
  }, [queueWebviewSizeSync, readerUrl, refreshNavigationState, webviewSize.height, webviewSize.width]);

  useEffect(() => {
    if (
      !supportsWebview ||
      webviewSize.width <= 1 ||
      webviewSize.height < WEB_READER_MIN_WEBVIEW_MOUNT_HEIGHT
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      const webview = webviewRef.current;
      if (!webview || lastLoadedWebviewUrlRef.current === readerUrl) {
        return;
      }
      syncWebviewSize();
      lastLoadedWebviewUrlRef.current = readerUrl;
      try {
        if (typeof webview.loadURL === "function") {
          webview.loadURL(readerUrl);
        } else {
          webview.setAttribute("src", readerUrl);
        }
      } catch {
        webview.setAttribute("src", readerUrl);
      }
    }, 50);

    return () => window.clearTimeout(timer);
  }, [readerUrl, supportsWebview, syncWebviewSize, webviewSize.height, webviewSize.width]);
*/

  function rememberHubSource(source: WebReaderHubSource) {
    setRecentHubSources((previous) => [
      source,
      ...previous.filter((item) => item.url !== source.url)
    ].slice(0, 4));
  }

  function getActiveCardSourceKind(): InputLanguageSourceKind {
    return isTranslatedPageActive ? "translated_page" : "original";
  }

  function prepareCardForLanguagePolicy(card: StudyCard, override = false) {
    const assessment = assessCardInputLanguage({
      card,
      settings,
      override,
      sourceKind: override ? "manual_override" : getActiveCardSourceKind()
    });
    return {
      assessment,
      card: withInputLanguageMetadata(card, assessment)
    };
  }

  function openWebReaderUrl(value: string, source?: WebReaderHubSource) {
    const nextUrl = normalizeWebReaderAddress(value);
    setReaderUrl(nextUrl);
    setAddressValue(nextUrl);
    setIsHubVisible(false);
    setSelection(null);
    setPopoverPosition(null);
    setTranslationText("");
    setLanguageMismatch(null);
    setTranslatedPageState(null);
    setStatusMessage("문장을 드래그하면 카드/후보/번역 도구가 떠요.");
    if (source) {
      rememberHubSource({ ...source, url: nextUrl });
      setPageTitle(source.label);
    }
    if (api.webReader && !isHubVisible) {
      void api.webReader.loadUrl(nextUrl).then(applyBrowserState).catch(() => {
        setStatusMessage("웹페이지를 열지 못했습니다.");
      });
    }
  }

  async function translateCurrentPage(statusMessage?: string) {
    if (isTranslatedPageActive && translatedReaderSourceUrl) {
      await api.webReader?.restorePageTranslations?.();
      setTranslatedPageState(null);
      setStatusMessage("원문 페이지로 돌아왔습니다.");
      return;
    }
    if (!api.webReader?.getPageTextSegments || !api.webReader.applyPageTranslations) {
      setStatusMessage("현재 웹 리더에서는 페이지 번역을 사용할 수 없습니다.");
      return;
    }
    if (!isHttpReaderUrl(readerUrl)) {
      setStatusMessage("현재 페이지는 내장 페이지 번역을 사용할 수 없습니다.");
      return;
    }
    setIsTranslatingPage(true);
    setStatusMessage("현재 페이지에서 번역할 문단을 찾는 중입니다.");
    try {
      const pageText = await api.webReader.getPageTextSegments();
      if (!pageText?.segments.length) {
        setStatusMessage("번역할 만한 본문 문단을 찾지 못했습니다.");
        return;
      }
      const translatedSegments = [];
      for (let index = 0; index < pageText.segments.length; index += 1) {
        const segment = pageText.segments[index];
        setStatusMessage(`페이지 문단 번역 중 ${index + 1}/${pageText.segments.length}`);
        const result = await api.translations.translate({
          text: segment.text,
          profileId: settings.profileId,
          providerName: settings.translationProviderName,
          sourceLang: "auto",
          targetLang: sourceLanguage.code,
          sourceLanguage: {
            code: "auto",
            nameKo: "자동 감지",
            nameEn: "Auto-detected"
          },
          outputLanguage: sourceLanguage,
          googleApiKey: settings.googleTranslateApiKey,
          geminiApiKey: settings.geminiApiKey,
          geminiModel: settings.geminiModel,
          geminiPlan: settings.geminiPlan,
          ollamaBaseUrl: settings.ollamaBaseUrl,
          ollamaModel: settings.ollamaModel,
          model: getTranslationModel(settings),
          promptVersion: "web-reader-page-inline-v1",
          contextHash: pageText.url
        });
        translatedSegments.push({
          ...segment,
          translatedText: result.translatedText
        });
      }
      const applied = await api.webReader.applyPageTranslations({
        targetLanguageCode: sourceLanguage.code,
        segments: translatedSegments
      });
      if (!applied) {
        setStatusMessage("번역 결과를 페이지에 적용하지 못했습니다.");
        return;
      }
      setTranslatedPageState({
        sourceUrl: pageText.url || readerUrl,
        targetLanguageCode: sourceLanguage.code,
        openedAt: new Date().toISOString()
      });
      setStatusMessage(
        statusMessage ??
          "페이지 문단을 앱 내부 번역으로 바꿨습니다. 번역된 문장을 선택해 카드로 만들 수 있습니다."
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "페이지 번역에 실패했습니다.");
    } finally {
      setIsTranslatingPage(false);
    }
  }

  useEffect(() => {
    if (!openUrlRequest?.url) {
      return;
    }
    openWebReaderUrl(openUrlRequest.url, {
      label: openUrlRequest.label ?? "YouTube",
      url: openUrlRequest.url,
      description: "듣기 루프에서 직접 영상 고르기",
      languageCode: sourceLanguage.code
    });
  }, [openUrlRequest?.requestId]);

  function toggleCustomLibraryEditing() {
    setIsCustomLibraryEditing((value) => !value);
    setIsCustomLibraryManagerOpen(false);
  }

  function toggleCustomLibraryManager() {
    setIsCustomLibraryManagerOpen((value) => !value);
    if (!isCustomLibraryManagerOpen) {
      setIsCustomLibraryEditing(false);
    }
  }

  function closeCustomLibraryManager() {
    setIsCustomLibraryManagerOpen(false);
  }

  function addCustomCategory(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const label = customCategoryLabel.trim();
    if (!label || !onSettingsChange) {
      return;
    }

    const existingCategory = (settings.webReaderCustomCategories ?? []).find(
      (category) =>
        category.languageCode.trim().toLowerCase().split("-")[0] === sourceLanguageCode &&
        category.label.trim().toLowerCase() === label.toLowerCase()
    );
    if (existingCategory) {
      setCustomSourceCategoryId(existingCategory.id);
      setActiveHubCategoryId(existingCategory.id);
      setCustomCategoryLabel("");
      setCustomCategoryPurpose("");
      setStatusMessage("이미 있는 커스텀 카테고리를 선택했습니다.");
      return;
    }

    const now = new Date().toISOString();
    const categoryId = `custom-category:${sourceLanguageCode}:${Date.now()}`;
    const purpose = customCategoryPurpose || undefined;
    onSettingsChange({
      ...settings,
      webReaderCustomCategories: [
        {
          id: categoryId,
          label,
          languageCode: sourceLanguageCode,
          purpose,
          createdAt: now,
          updatedAt: now
        },
        ...(settings.webReaderCustomCategories ?? [])
      ]
    });
    setCustomCategoryLabel("");
    setCustomCategoryPurpose("");
    setCustomSourceCategoryId(categoryId);
    setActiveHubCategoryId(categoryId);
    setStatusMessage("커스텀 카테고리를 추가했습니다.");
  }

  function deleteCustomCategory(categoryId: string) {
    if (!onSettingsChange) {
      return;
    }
    const category = (settings.webReaderCustomCategories ?? []).find(
      (item) =>
        item.id === categoryId &&
        item.languageCode.trim().toLowerCase().split("-")[0] === sourceLanguageCode
    );
    if (!category) {
      return;
    }

    const sourcesInCategory = (settings.webReaderCustomSources ?? []).filter(
      (source) =>
        source.categoryId === categoryId &&
        source.languageCode.trim().toLowerCase().split("-")[0] === sourceLanguageCode
    );
    const shouldDelete =
      sourcesInCategory.length === 0 ||
      window.confirm(
        `"${category.label}" 폴더와 안의 사이트 ${sourcesInCategory.length}개를 삭제할까요?`
      );
    if (!shouldDelete) {
      return;
    }

    onSettingsChange({
      ...settings,
      webReaderCustomCategories: (settings.webReaderCustomCategories ?? []).filter(
        (item) => item.id !== categoryId
      ),
      webReaderCustomSources: (settings.webReaderCustomSources ?? []).filter(
        (source) => source.categoryId !== categoryId
      )
    });
    if (activeHubCategoryId === categoryId) {
      setActiveHubCategoryId("community-expression");
    }
    if (customSourceCategoryId === categoryId) {
      setCustomSourceCategoryId("community-expression");
    }
    setIsCustomLibraryManagerOpen(false);
    setRecentHubSources((previous) =>
      previous.filter((source) => !sourcesInCategory.some((item) => item.url === source.url))
    );
    setStatusMessage("커스텀 카테고리를 삭제했습니다.");
  }

  function deleteCustomSource(sourceId: string) {
    if (!onSettingsChange) {
      return;
    }
    const source = (settings.webReaderCustomSources ?? []).find(
      (item) =>
        item.id === sourceId &&
        item.languageCode.trim().toLowerCase().split("-")[0] === sourceLanguageCode
    );
    if (!source) {
      return;
    }

    if (!window.confirm(`"${source.label}" 사이트를 삭제할까요?`)) {
      return;
    }

    onSettingsChange({
      ...settings,
      webReaderCustomSources: (settings.webReaderCustomSources ?? []).filter(
        (item) => item.id !== sourceId
      )
    });
    setRecentHubSources((previous) => previous.filter((item) => item.url !== source.url));
    setStatusMessage("커스텀 사이트를 삭제했습니다.");
  }

  function addCustomSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = customSourceLabel.trim();
    const rawUrl = customSourceUrl.trim();
    if (!label || !rawUrl || !onSettingsChange) {
      return;
    }

    const now = new Date().toISOString();
    const url = normalizeWebReaderAddress(rawUrl);
    const categoryId = selectedCustomSourceCategory?.id ?? "community-expression";
    const categoryLabel = selectedCustomSourceCategory?.label ?? "커스텀";
    onSettingsChange({
      ...settings,
      webReaderCustomSources: [
        {
          id: `custom:${sourceLanguageCode}:${Date.now()}`,
          label,
          url,
          languageCode: sourceLanguageCode,
          categoryId,
          description: `${sourceLanguage.nameKo} · ${categoryLabel}`,
          createdAt: now,
          updatedAt: now
        },
        ...(settings.webReaderCustomSources ?? []).filter((source) => source.url !== url)
      ]
    });
    setCustomSourceLabel("");
    setCustomSourceUrl("");
    setActiveHubCategoryId(categoryId);
    setIsCustomLibraryManagerOpen(false);
    setStatusMessage("커스텀 사이트를 추가했습니다.");
  }

  function submitAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    openWebReaderUrl(addressValue);
  }

  async function getCurrentSelection() {
    return selection ?? (supportsWebview ? await updateSelectionFromWebview(true) : null);
  }

  async function generateCardFromSelection(
    currentSelection: WebReaderSelection,
    selectedTerms?: string[]
  ) {
    const context = getSelectionContext(currentSelection);
    const selectedText = selectedTerms?.length ? selectedTerms.join(", ") : context.selectedText;
    try {
      const generated = await provider.generateReadingCard({
        selectedText,
        sourceSentence:
          "sourceSentence" in currentSelection && typeof currentSelection.sourceSentence === "string"
            ? currentSelection.sourceSentence
            : context.sourceSentence,
        beforeSentence: context.beforeSentence,
        afterSentence: context.afterSentence,
        readerTextContext:
          context.extractionConfidence === "fallback"
            ? context.sourceSentence
            : context.normalizedFullText,
        learningProfile: settings.learningProfile,
        learnerLevel: "intermediate"
      });
      return createStudyCardFromGenerated({
        ...generated,
        profileId: settings.profileId
      });
    } catch (error) {
      if (settings.providerName !== "mock") {
        throw error;
      }
      const fallbackCardData = createBrowserSentenceFallbackCardData({
        selectedText,
        sourceSentence:
          "sourceSentence" in currentSelection && typeof currentSelection.sourceSentence === "string"
            ? currentSelection.sourceSentence
            : context.sourceSentence,
        translatedSentence: translationText || undefined,
        colorKeys: [...webReaderCardColorKeys],
        targetLanguageCode: settings.learningProfile.targetLanguage.code
      });
      return createStudyCardFromGenerated({
        ...fallbackCardData,
        profileId: settings.profileId
      });
    }
  }

  async function saveCard(card: StudyCard, options: { override?: boolean } = {}) {
    const prepared = prepareCardForLanguagePolicy(card, options.override === true);
    if (prepared.assessment.shouldBlock && !options.override) {
      setLanguageMismatch({
        card,
        assessment: prepared.assessment,
        pageUrl: readerUrl,
        sourceSentence: card.sourceSentence || card.frontText
      });
      setStatusMessage(prepared.assessment.message);
      throw new Error(prepared.assessment.message);
    }

    await api.cards.save(prepared.card, settings.profileId);
    await onCardsChanged();
    setLanguageMismatch(null);
    await dismissSelectionPopoverAfterSave();
  }

  function openTranslatedPageForMismatch() {
    if (!languageMismatch) {
      return;
    }
    void translateCurrentPage("페이지 문단을 학습어로 번역했습니다. 번역된 문장을 선택해 카드를 만드세요.");
  }

  function switchProfileForMismatch() {
    if (!languageMismatch) {
      return;
    }
    const detectedLanguageCode = languageMismatch.assessment.detectedLanguageCode;
    const switched =
      detectedLanguageCode !== "unknown" &&
      onSwitchToLanguageProfile?.(detectedLanguageCode) === true;
    setStatusMessage(
      switched
        ? `${formatLanguageCode(detectedLanguageCode)} 프로필로 전환했습니다. 다시 저장하면 해당 프로필에 저장됩니다.`
        : `${formatLanguageCode(detectedLanguageCode)} 프로필을 찾지 못했습니다. 프로필을 직접 만든 뒤 다시 저장하세요.`
    );
    if (switched) {
      setLanguageMismatch(null);
    }
  }

  async function saveMismatchOverride() {
    if (!languageMismatch || isSavingCard) {
      return;
    }
    setIsSavingCard(true);
    try {
      await saveCard(languageMismatch.card, { override: true });
      setStatusMessage("언어 불일치를 확인하고 현재 프로필에 저장했습니다.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "카드를 저장하지 못했습니다.");
    } finally {
      setIsSavingCard(false);
    }
  }

  async function dismissSelectionPopoverAfterSave() {
    setSelection(null);
    setPopoverPosition(null);
    setTranslationText("");
    await api.webReader?.hidePopover?.().catch(() => {
      // The fallback React popover is already cleared above.
    });
  }

  async function handleBrowserPopoverCreate(action: WebReaderPopoverAction) {
    const payload = action.payload;
    if (!payload?.selectedText) {
      return;
    }
    const currentSelection = normalizePopoverSelection(payload);
    const selectedTerms = normalizeSelectedTerms(payload.selectedTerms, currentSelection.selectedText);
    setSelection(currentSelection);
    setTranslationText("");
    setIsSavingCard(true);
    setStatusMessage("문장카드를 만드는 중입니다.");
    await api.webReader?.showPopoverStatus?.({ state: "working", message: "카드 생성 중..." });

    try {
      const card = await generateCardFromSelection(currentSelection, selectedTerms);
      if (settings.browserSelectionCardMode === "autoSave") {
        await saveCard(card);
        pendingPopoverCardRef.current = null;
        setStatusMessage("문장카드를 저장했습니다.");
        return;
      }

      pendingPopoverCardRef.current = card;
      await api.webReader?.showPopoverResult?.(card);
      setStatusMessage("문장카드 미리보기를 확인한 뒤 저장하세요.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "카드 생성에 실패했습니다.";
      await api.webReader?.showPopoverStatus?.({ state: "error", message });
      setStatusMessage(message);
    } finally {
      setIsSavingCard(false);
    }
  }

  async function handleBrowserPopoverSavePreview() {
    const card = pendingPopoverCardRef.current;
    if (!card) {
      await api.webReader?.showPopoverStatus?.({
        state: "error",
        message: "저장할 카드 미리보기가 없습니다."
      });
      return;
    }
    setIsSavingCard(true);
    try {
      await saveCard(card);
      pendingPopoverCardRef.current = null;
      setStatusMessage("문장카드를 저장했습니다.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "카드 저장에 실패했습니다.";
      await api.webReader?.showPopoverStatus?.({ state: "error", message });
      setStatusMessage(message);
    } finally {
      setIsSavingCard(false);
    }
  }

  useEffect(() => {
    if (!api.webReader?.consumePopoverAction) {
      return;
    }

    let disposed = false;
    const timer = window.setInterval(() => {
      void (async () => {
        const action = (await api.webReader?.consumePopoverAction?.()) as WebReaderPopoverAction | null;
        if (disposed || !action?.action) {
          return;
        }
        const actionId = typeof action.id === "string" ? action.id : JSON.stringify(action);
        if (handledPopoverActionIdsRef.current.has(actionId)) {
          return;
        }
        handledPopoverActionIdsRef.current.add(actionId);
        if (action.action === "create-card") {
          await handleBrowserPopoverCreate(action);
        } else if (action.action === "save-preview") {
          await handleBrowserPopoverSavePreview();
        }
      })().catch((error) => {
        setStatusMessage(error instanceof Error ? error.message : "웹 리더 팝오버 작업에 실패했습니다.");
      });
    }, 300);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [api.webReader, provider, settings, translationText]);

  async function translateSelection() {
    const currentSelection = await getCurrentSelection();
    if (!currentSelection) {
      return;
    }
    const context = getSelectionContext(currentSelection);
    setIsTranslating(true);
    setStatusMessage("선택 문장을 번역하는 중입니다.");
    try {
      const result = await api.translations.translate({
        text: context.sourceSentence,
        profileId: settings.profileId,
        providerName: settings.translationProviderName,
        sourceLang: sourceLanguage.code,
        targetLang: outputLanguage.code,
        sourceLanguage,
        outputLanguage,
        googleApiKey: settings.googleTranslateApiKey,
        geminiApiKey: settings.geminiApiKey,
        geminiModel: settings.geminiModel,
        geminiPlan: settings.geminiPlan,
        ollamaBaseUrl: settings.ollamaBaseUrl,
        ollamaModel: settings.ollamaModel,
        model: getTranslationModel(settings),
        promptVersion: "web-reader-selection-v1",
        contextHash: currentSelection.url
      });
      setTranslationText(result.translatedText);
      setStatusMessage("번역을 표시했습니다.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "번역에 실패했습니다.");
    } finally {
      setIsTranslating(false);
    }
  }

  async function saveCandidate() {
    const currentSelection = await getCurrentSelection();
    if (!currentSelection) {
      return;
    }
    const context = getSelectionContext(currentSelection);
    setIsSavingCandidate(true);
    try {
      await api.lifeLogs.save({
        text: context.sourceSentence,
        beforeContext: context.beforeSentence,
        afterContext: context.afterSentence,
        appName: "웹 리더",
        sourceType: "browser_extension",
        metadata: {
          url: currentSelection.url,
          title: currentSelection.title || pageTitle,
          trigger: "web_reader",
          capturedAt: new Date().toISOString(),
          selectedText: currentSelection.selectedText,
          extractionConfidence: context.extractionConfidence
        }
      });
      await onLifeLogsChanged();
      setStatusMessage("라이프 마이닝 후보로 저장했습니다.");
    } finally {
      setIsSavingCandidate(false);
    }
  }

  async function saveReadingCard() {
    const currentSelection = await getCurrentSelection();
    if (!currentSelection) {
      return;
    }
    const context = getSelectionContext(currentSelection);
    setIsSavingCard(true);
    try {
      const cardData = createBrowserSentenceFallbackCardData({
        selectedText: currentSelection.selectedText,
        sourceSentence: context.sourceSentence,
        translatedSentence: translationText || undefined,
        colorKeys: [...webReaderCardColorKeys],
        targetLanguageCode: settings.learningProfile.targetLanguage.code
      });
      const card = createStudyCardFromGenerated({
        ...cardData,
        profileId: settings.profileId
      });
      await saveCard(card);
      setStatusMessage("문장카드를 저장했습니다. 카드 화면에서 확인할 수 있습니다.");
    } finally {
      setIsSavingCard(false);
    }
  }

  async function saveGeneratedReadingCard() {
    const currentSelection = await getCurrentSelection();
    if (!currentSelection) {
      return;
    }

    const context = getSelectionContext(currentSelection);
    setIsSavingCard(true);
    setStatusMessage("문장카드를 만드는 중입니다.");
    try {
      let card: ReturnType<typeof createStudyCardFromGenerated>;
      try {
        const generated = await provider.generateReadingCard({
          selectedText: context.selectedText,
          sourceSentence: context.sourceSentence,
          beforeSentence: context.beforeSentence,
          afterSentence: context.afterSentence,
          readerTextContext:
            context.extractionConfidence === "fallback"
              ? context.sourceSentence
              : context.normalizedFullText,
          learningProfile: settings.learningProfile,
          learnerLevel: "intermediate"
        });
        card = createStudyCardFromGenerated({
          ...generated,
          profileId: settings.profileId
        });
      } catch (error) {
        if (settings.providerName !== "mock") {
          throw error;
        }
        const fallbackCardData = createBrowserSentenceFallbackCardData({
          selectedText: currentSelection.selectedText,
          sourceSentence: context.sourceSentence,
          translatedSentence: translationText || undefined,
          colorKeys: [...webReaderCardColorKeys],
          targetLanguageCode: settings.learningProfile.targetLanguage.code
        });
        card = createStudyCardFromGenerated({
          ...fallbackCardData,
          profileId: settings.profileId
        });
      }

      await saveCard(card);
      setStatusMessage("문장카드를 저장했습니다. 카드 화면에서 확인할 수 있습니다.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "문장카드를 저장하지 못했습니다.");
    } finally {
      setIsSavingCard(false);
    }
  }

  function goHome() {
    setIsHubVisible(true);
    setAddressValue("");
    setPageTitle("웹 리더 홈");
    setSelection(null);
    setPopoverPosition(null);
    setTranslationText("");
    setStatusMessage("추천 시작점에서 읽을 웹페이지를 고르세요.");
  }

  function goBack() {
    if (api.webReader) {
      void api.webReader.goBack().then(applyBrowserState);
      return;
    }
  }

  function goForward() {
    if (api.webReader) {
      void api.webReader.goForward().then(applyBrowserState);
      return;
    }
  }

  function reloadPage() {
    if (api.webReader) {
      void api.webReader.reload().then(applyBrowserState);
      return;
    }
  }

  return (
    <div className={sidebarOverlayOpen ? "web-reader-page sidebar-overlay-open" : "web-reader-page"}>
      <form className="web-reader-command-rail" onSubmit={submitAddress}>
        <div className="web-reader-nav-cluster">
          <button
            aria-label="뒤로"
            className="icon-button"
            disabled={!canGoBack}
            type="button"
            onClick={goBack}
          >
            <ArrowLeft size={17} />
          </button>
          <button
            aria-label="앞으로"
            className="icon-button"
            disabled={!canGoForward}
            type="button"
            onClick={goForward}
          >
            <ArrowRight size={17} />
          </button>
          <button
            aria-label="새로고침"
            className="icon-button"
            disabled={isHubVisible}
            type="button"
            onClick={reloadPage}
          >
            <RefreshCcw className={isLoading ? "spin" : ""} size={16} />
          </button>
          <button aria-label="기본 페이지" className="icon-button" type="button" onClick={goHome}>
            <Home size={16} />
          </button>
        </div>

        <label className="web-reader-address">
          <Search size={16} />
          <input
            aria-label="웹 주소 또는 검색어"
            data-qa="web-reader-address"
            value={addressValue}
            onChange={(event) => setAddressValue(event.target.value)}
            placeholder="URL 또는 검색어 입력"
          />
        </label>

        <div className="web-reader-action-cluster">
          <button
            className="button secondary small"
            type="button"
            disabled={!canTranslateCurrentPage}
            onClick={() => void translateCurrentPage()}
          >
            {isTranslatingPage ? <Loader2 className="spin" size={15} /> : <Languages size={15} />}
            {isTranslatingPage ? "번역 중" : isTranslatedPageActive ? "원문" : "페이지 번역"}
          </button>
          <button
            className="button secondary small"
            type="button"
            disabled={isTranslating}
            onClick={() => void translateSelection()}
          >
            {isTranslating ? <Loader2 className="spin" size={15} /> : <Languages size={15} />}
            선택 번역
          </button>
          <button
            className="button secondary small"
            type="button"
            disabled={isSavingCandidate}
            onClick={() => void saveCandidate()}
          >
            {isSavingCandidate ? <Loader2 className="spin" size={15} /> : <BookmarkPlus size={15} />}
            후보
          </button>
          <button
            className="button primary small"
            data-qa="web-reader-create-card"
            type="button"
            disabled={isSavingCard}
            onClick={() => void saveGeneratedReadingCard()}
          >
            {isSavingCard ? <Loader2 className="spin" size={15} /> : <CreditCard size={15} />}
            {isSavingCard ? "생성 중" : "문장카드"}
          </button>
        </div>
      </form>

      <div className="web-reader-stage" ref={stageRef}>
        {isHubVisible ? (
          <div className="web-reader-hub" data-qa="web-reader-hub">
            <section className="web-reader-hub-hero">
              <div className="web-reader-hub-heading">
                <span>웹 리더 홈</span>
                <h2>오늘 읽을 {sourceLanguage.nameKo} 입력 소스를 고르세요</h2>
                <p>목적별 시작점에서 바로 열거나, 검색해서 웹을 돌아다니며 문장을 수집할 수 있습니다.</p>
              </div>
              <form className="web-reader-hub-search" onSubmit={submitAddress}>
                <Search size={18} />
                <input
                  aria-label="웹사이트나 학습 목적 검색"
                  data-qa="web-reader-hub-search"
                  placeholder="웹사이트나 학습 목적 검색"
                  value={addressValue}
                  onChange={(event) => setAddressValue(event.target.value)}
                />
                <button className="button primary small" type="submit">
                  열기
                </button>
              </form>
            </section>

            <section className="web-reader-hub-section">
              <div className="web-reader-hub-section-head">
                <span>목적별 시작</span>
                <small>지금 하고 싶은 읽기 방식으로 바로 이동</small>
              </div>
              <div className="web-reader-intent-grid">
                {webReaderHubModel.intents.map((intent) => {
                  const IntentIcon = intent.icon;
                  return (
                    <button
                      className="web-reader-intent-card"
                      key={intent.label}
                      type="button"
                      onClick={() =>
                        openWebReaderUrl(intent.url, {
                          label: intent.label,
                          url: intent.url,
                          description: intent.description
                        })
                      }
                    >
                      <IntentIcon size={18} />
                      <strong>{intent.label}</strong>
                      <span>{intent.description}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="web-reader-hub-grid">
              <div className="web-reader-hub-panel category">
                <div className="web-reader-hub-section-head">
                  <span>카테고리 런처</span>
                  <small>인풋-리딩과 아웃풋-라이프를 구분해서 시작</small>
                </div>
                <div className="web-reader-category-layout">
                  <div className="web-reader-category-rail" role="tablist" aria-label="웹 소스 범주">
                    {webReaderHubModel.categories.map((category) => {
                      const CategoryIcon = category.icon;
                      const isActive = category.id === activeHubCategory.id;
                      const canDeleteCategory = isCustomLibraryEditing && category.isCustom;
                      return (
                        <div
                          className={
                            canDeleteCategory
                              ? "web-reader-category-rail-row editable"
                              : "web-reader-category-rail-row"
                          }
                          key={category.id}
                        >
                          <button
                            aria-selected={isActive}
                            className={isActive ? "active" : ""}
                            role="tab"
                            type="button"
                            onClick={() => setActiveHubCategoryId(category.id)}
                          >
                            <CategoryIcon size={16} />
                            <span className="web-reader-category-main">
                              {category.purpose ? (
                                <span
                                  className={`web-reader-category-purpose ${category.purpose}`}
                                >
                                  {getWebReaderHubPurposeLabel(category.purpose)}
                                </span>
                              ) : null}
                              <span>{category.label}</span>
                            </span>
                          </button>
                          {canDeleteCategory ? (
                            <button
                              aria-label={`${category.label} 커스텀 폴더 삭제`}
                              className="web-reader-category-delete"
                              type="button"
                              onClick={() => deleteCustomCategory(category.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                    <div className="web-reader-category-rail-actions">
                      <button
                        className={isCustomLibraryManagerOpen ? "active" : ""}
                        disabled={!onSettingsChange}
                        type="button"
                        onClick={toggleCustomLibraryManager}
                      >
                        <Plus size={16} />
                        <span>추가</span>
                      </button>
                      <button
                        className={isCustomLibraryEditing ? "active" : ""}
                        disabled={
                          !onSettingsChange ||
                          profileCustomCategories.length + profileCustomSources.length === 0
                        }
                        type="button"
                        onClick={toggleCustomLibraryEditing}
                      >
                        {isCustomLibraryEditing ? <Check size={16} /> : <Pencil size={16} />}
                        <span>{isCustomLibraryEditing ? "완료" : "편집"}</span>
                      </button>
                    </div>
                  </div>
                  <div className="web-reader-source-list">
                    {activeHubCategory.sources.length > 0 ? (
                      activeHubCategory.sources.map((source) => {
                        const sourceStyle = getWebReaderSourceStyle(source);
                        const canDeleteSource =
                          isCustomLibraryEditing && source.isCustom && Boolean(source.id);
                        const sourceCardContent = (
                          <>
                            <span className="web-reader-source-topline">
                              <span className="web-reader-source-badge">{sourceStyle.initials}</span>
                              <span className="web-reader-source-tag">{sourceStyle.tag}</span>
                            </span>
                            <strong>{source.label}</strong>
                            <span>{source.description}</span>
                          </>
                        );
                        if (canDeleteSource) {
                          return (
                            <div
                              className="web-reader-source-card web-reader-source-card-editable"
                              key={source.url}
                              style={{ "--source-accent": sourceStyle.accent } as CSSProperties}
                            >
                              <button
                                className="web-reader-source-card-body"
                                type="button"
                                onClick={() => openWebReaderUrl(source.url, source)}
                              >
                                {sourceCardContent}
                              </button>
                              <button
                                className="web-reader-source-delete"
                                type="button"
                                onClick={() => source.id && deleteCustomSource(source.id)}
                              >
                                <Trash2 size={13} />
                                삭제
                              </button>
                            </div>
                          );
                        }
                        return (
                          <button
                            className="web-reader-source-card"
                            data-qa={
                              source.url === WEB_READER_DEFAULT_URL
                                ? "web-reader-open-default"
                                : undefined
                            }
                            key={source.url}
                            style={{ "--source-accent": sourceStyle.accent } as CSSProperties}
                            type="button"
                            onClick={() => openWebReaderUrl(source.url, source)}
                          >
                            {sourceCardContent}
                          </button>
                        );
                      })
                    ) : (
                      <div className="web-reader-source-empty">
                        이 카테고리에 아직 사이트가 없습니다.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <aside className="web-reader-hub-panel side">
                <div className="web-reader-hub-section-head">
                  <span>추천 시작점</span>
                  <small>첫 화면에서 바로 열기 좋은 곳</small>
                </div>
                <div className="web-reader-feature-list">
                  {webReaderHubModel.featured.map((source) => {
                    const sourceStyle = getWebReaderSourceStyle(source);
                    return (
                      <button
                        className="web-reader-feature-card"
                        data-qa={source.url === WEB_READER_DEFAULT_URL ? "web-reader-open-default" : undefined}
                        key={source.url}
                        style={{ "--source-accent": sourceStyle.accent } as CSSProperties}
                        type="button"
                        onClick={() => openWebReaderUrl(source.url, source)}
                      >
                        <span className="web-reader-source-badge">{sourceStyle.initials}</span>
                        <span>
                          <strong>{source.label}</strong>
                          <small>{source.description}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="web-reader-hub-section-head compact">
                  <span>최근 방문</span>
                  <small>이번 세션</small>
                </div>
                <div className="web-reader-recent-list">
                  {(recentHubSources.length ? recentHubSources : webReaderHubModel.featured.slice(0, 2)).map(
                    (source) => {
                      const sourceStyle = getWebReaderSourceStyle(source);
                      return (
                        <button
                          className="web-reader-recent-card"
                          key={`recent-${source.url}`}
                          style={{ "--source-accent": sourceStyle.accent } as CSSProperties}
                          type="button"
                          onClick={() => openWebReaderUrl(source.url, source)}
                        >
                          <Clock3 size={14} />
                          <span>{source.label}</span>
                        </button>
                      );
                    }
                  )}
                </div>

                {webReaderHubModel.otherLanguageSources.length > 0 ? (
                  <details className="web-reader-other-language-sources">
                    <summary>다른 언어 소스 {webReaderHubModel.otherLanguageSources.length}개</summary>
                    <div className="web-reader-other-language-list">
                      {webReaderHubModel.otherLanguageSources.map((source) => {
                        const sourceStyle = getWebReaderSourceStyle(source);
                        return (
                          <button
                            className="web-reader-recent-card"
                            key={`other-${source.url}`}
                            style={{ "--source-accent": sourceStyle.accent } as CSSProperties}
                            type="button"
                            onClick={() => openWebReaderUrl(source.url, source)}
                          >
                            <span className="web-reader-source-badge">{sourceStyle.initials}</span>
                            <span>
                              {source.label}
                              <small>{formatLanguageCode(source.languageCode || "unknown")}</small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </details>
                ) : null}
              </aside>
            </section>
          </div>
        ) : (
          <>
            <div className="web-reader-title-strip">
              <span>{pageTitle || "웹 리더"}</span>
              <small>{readerUrl}</small>
            </div>
            <div className="web-reader-web-surface" ref={webSurfaceRef}>
              {supportsWebview ? (
                <div
                  className="web-reader-webview web-reader-browser-view-slot"
                  data-qa="web-reader-browser-view-slot"
                />
              ) : (
                <iframe
                  className="web-reader-webview"
                  data-qa="web-reader-iframe"
                  referrerPolicy="no-referrer"
                  src={readerUrl}
                  title="웹 리더 미리보기"
                />
              )}
            </div>
          </>
        )}

        <div className="web-reader-status-bar">
          <span>{statusMessage}</span>
          <span className={lifeMiningState.enabled ? "web-reader-life-chip on" : "web-reader-life-chip"}>
            {lifeMiningStatusText}
          </span>
          {!supportsWebview && !isHubVisible ? (
            <small>로컬 웹 미리보기에서는 일부 사이트가 iframe을 차단할 수 있습니다.</small>
          ) : null}
        </div>

        {isCustomLibraryManagerOpen ? (
          <div
            aria-labelledby="web-reader-custom-manager-title"
            aria-modal="true"
            className="web-reader-custom-modal"
            role="dialog"
          >
            <button
              aria-label="커스텀 추가 닫기"
              className="web-reader-custom-modal-backdrop"
              type="button"
              onClick={closeCustomLibraryManager}
            />
            <div className="web-reader-custom-manager">
              <div className="web-reader-custom-manager-head">
                <div>
                  <span>커스텀 추가</span>
                  <h3 id="web-reader-custom-manager-title">폴더와 사이트 추가</h3>
                  <small>{sourceLanguage.nameKo} 프로필에 저장됩니다.</small>
                </div>
                <button
                  aria-label="커스텀 추가 닫기"
                  className="icon-button"
                  type="button"
                  onClick={closeCustomLibraryManager}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="web-reader-custom-manager-body">
                <form className="web-reader-custom-form" onSubmit={addCustomCategory}>
                  <div className="web-reader-custom-form-title">
                    <strong>커스텀 폴더</strong>
                    <small>분류를 고르지 않으면 일반 폴더로 만듭니다.</small>
                  </div>
                  <select
                    aria-label="커스텀 카테고리 분류"
                    value={customCategoryPurpose}
                    onChange={(event) =>
                      setCustomCategoryPurpose(
                        event.target.value as "" | "input-reading" | "output-life"
                      )
                    }
                  >
                    <option value="">분류 없음</option>
                    <option value="input-reading">인풋-리딩</option>
                    <option value="output-life">아웃풋-라이프</option>
                  </select>
                  <input
                    aria-label="커스텀 카테고리 이름"
                    placeholder="새 폴더 이름"
                    value={customCategoryLabel}
                    onChange={(event) => setCustomCategoryLabel(event.target.value)}
                  />
                  <div className="web-reader-custom-form-actions">
                    <button
                      className="button secondary small"
                      disabled={!onSettingsChange || !customCategoryLabel.trim()}
                      type="submit"
                    >
                      폴더 추가
                    </button>
                  </div>
                </form>

                <form className="web-reader-custom-form" onSubmit={addCustomSource}>
                  <div className="web-reader-custom-form-title">
                    <strong>커스텀 사이트</strong>
                    <small>선택한 폴더에 사이트를 저장합니다.</small>
                  </div>
                  <select
                    aria-label="커스텀 사이트 카테고리"
                    value={selectedCustomSourceCategory?.id ?? customSourceCategoryId}
                    onChange={(event) => setCustomSourceCategoryId(event.target.value)}
                  >
                    {webReaderHubModel.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.purpose
                          ? `${getWebReaderHubPurposeLabel(category.purpose)} · ${category.label}`
                          : category.label}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="커스텀 사이트 이름"
                    placeholder="사이트 이름"
                    value={customSourceLabel}
                    onChange={(event) => setCustomSourceLabel(event.target.value)}
                  />
                  <input
                    aria-label="커스텀 사이트 주소"
                    placeholder="https://example.com"
                    value={customSourceUrl}
                    onChange={(event) => setCustomSourceUrl(event.target.value)}
                  />
                  <div className="web-reader-custom-form-actions">
                    <button
                      className="button secondary small"
                      disabled={
                        !onSettingsChange || !customSourceLabel.trim() || !customSourceUrl.trim()
                      }
                      type="submit"
                    >
                      사이트 추가
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        ) : null}

        {languageMismatch ? (
          <div className="web-reader-language-mismatch" role="alert">
            <div>
              <strong>{languageMismatch.assessment.message}</strong>
              <span>
                현재 프로필: {formatLanguageCode(languageMismatch.assessment.expectedLanguageCode)} ·
                감지: {formatLanguageCode(languageMismatch.assessment.detectedLanguageCode)}
              </span>
            </div>
            <div className="web-reader-language-mismatch-actions">
              <button className="button secondary small" type="button" onClick={openTranslatedPageForMismatch}>
                번역 페이지 열기
              </button>
              <button className="button secondary small" type="button" onClick={switchProfileForMismatch}>
                감지 언어 프로필
              </button>
              <button
                className="button primary small"
                disabled={isSavingCard}
                type="button"
                onClick={() => void saveMismatchOverride()}
              >
                그래도 저장
              </button>
            </div>
          </div>
        ) : null}

        {!isHubVisible && !supportsWebview && popoverPosition && selection ? (
          <div
            className="web-reader-selection-popover"
            style={{
              left: popoverPosition.left,
              top: popoverPosition.top
            }}
          >
            <button
              aria-label="선택 도구 닫기"
              className="icon-button web-reader-popover-close"
              type="button"
              onClick={() => {
                setSelection(null);
                setPopoverPosition(null);
                setTranslationText("");
              }}
            >
              <X size={14} />
            </button>
            <small>선택 문장</small>
            <p>{selection.selectedText}</p>
            {translationText ? <div className="web-reader-translation">{translationText}</div> : null}
            <CardGenerationUsageEstimate
              align="start"
              estimate={selectionUsageEstimate}
              variant="badge"
            />
            <div className="web-reader-popover-actions">
              <button
                className="button primary small"
                data-qa="web-reader-popover-create-card"
                type="button"
                disabled={isSavingCard}
                onClick={() => void saveGeneratedReadingCard()}
              >
                <CreditCard size={14} />
                {isSavingCard ? "생성 중" : "문장카드"}
              </button>
              <button
                className="button secondary small"
                type="button"
                disabled={isSavingCandidate}
                onClick={() => void saveCandidate()}
              >
                <BookmarkPlus size={14} />
                후보
              </button>
              <button
                className="button secondary small"
                type="button"
                disabled={isTranslating}
                onClick={() => void translateSelection()}
              >
                <Languages size={14} />
                번역
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function getSelectionContext(selection: WebReaderSelection) {
  if (selection.sourceSentence?.trim()) {
    return extractSentenceContext({
      fullText: selection.sourceSentence,
      selectedText: selection.selectedText
    });
  }
  return extractSentenceContext({
    fullText: selection.fullText || selection.selectedText,
    selectedText: selection.selectedText,
    selectionOffset: selection.selectionOffset
  });
}

function normalizePopoverSelection(payload: WebReaderPopoverActionPayload): WebReaderSelection {
  return {
    selectedText: String(payload.selectedText || "").trim(),
    fullText: String(payload.fullText || payload.sourceSentence || payload.selectedText || ""),
    selectionOffset:
      typeof payload.selectionOffset === "number" && Number.isFinite(payload.selectionOffset)
        ? payload.selectionOffset
        : undefined,
    title: String(payload.title || ""),
    url: String(payload.url || ""),
    rect: {
      left: normalizeFiniteNumber(payload.rect?.left),
      top: normalizeFiniteNumber(payload.rect?.top),
      right: normalizeFiniteNumber(payload.rect?.right),
      bottom: normalizeFiniteNumber(payload.rect?.bottom),
      width: normalizeFiniteNumber(payload.rect?.width),
      height: normalizeFiniteNumber(payload.rect?.height)
    },
    ...(payload.sourceSentence ? { sourceSentence: payload.sourceSentence } : {})
  } as WebReaderSelection;
}

function normalizeSelectedTerms(terms: string[] | undefined, fallback: string) {
  const normalized = (Array.isArray(terms) ? terms : [fallback])
    .map((term) => String(term || "").trim())
    .filter(Boolean);
  return normalized.length ? Array.from(new Set(normalized)) : [fallback];
}

function normalizeFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isHttpReaderUrl(value: string) {
  const normalized = normalizeWebReaderAddress(value);
  return normalized.startsWith("http://") || normalized.startsWith("https://");
}

function getTranslatedReaderSourceUrl(
  value: string,
  state: WebReaderTranslatedPageState | null
) {
  if (state?.sourceUrl) {
    return state.sourceUrl;
  }
  return isHttpReaderUrl(value) ? normalizeWebReaderAddress(value) : null;
}

function isTranslatedReaderUrl(
  value: string,
  state: WebReaderTranslatedPageState | null,
  targetLanguageCode: string
) {
  const normalizedCurrentUrl = normalizeWebReaderAddress(value);
  const normalizedSourceUrl = state?.sourceUrl ? normalizeWebReaderAddress(state.sourceUrl) : "";
  return (
    state?.targetLanguageCode.trim().toLowerCase().split("-")[0] ===
      targetLanguageCode.trim().toLowerCase().split("-")[0] &&
    Boolean(normalizedSourceUrl) &&
    normalizedCurrentUrl === normalizedSourceUrl
  );
}

function getTranslationModel(settings: AppSettings) {
  if (settings.translationProviderName === "gemini") {
    return settings.geminiModel;
  }
  if (settings.translationProviderName === "localMt") {
    return settings.localMtModel;
  }
  if (settings.translationProviderName === "local") {
    return settings.ollamaModel;
  }
  return undefined;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

