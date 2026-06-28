import {
  BookOpen,
  Bot,
  FileText,
  MessageCircle,
  Newspaper,
  Sparkles,
  type LucideIcon
} from "lucide-react";
import type {
  WebReaderCustomCategory,
  WebReaderCustomCategoryPurpose,
  WebReaderCustomSource
} from "../shared/types";
import { WEB_READER_DEFAULT_URL } from "./webReaderAddress";
export const webReaderCardColorKeys = [
  "red",
  "orange",
  "blue",
  "purple",
  "green",
  "pink",
  "cyan",
  "yellow",
  "lime",
  "slate"
] as const;

export const WEB_READER_MIN_WEBVIEW_MOUNT_HEIGHT = 320;
export const WEB_READER_SESSION_STORAGE_KEY = "lem:webReaderSession:v1";

export type WebReaderHubSource = {
  id?: string;
  label: string;
  url: string;
  description: string;
  languageCode?: string;
  categoryId?: string;
  isCustom?: boolean;
};

export type WebReaderHubPurpose = WebReaderCustomCategoryPurpose;

export type WebReaderHubCategory = {
  id: string;
  label: string;
  icon: LucideIcon;
  purpose?: WebReaderHubPurpose;
  isCustom?: boolean;
  sources: WebReaderHubSource[];
};

export type WebReaderHubIntent = {
  label: string;
  description: string;
  url: string;
  icon: LucideIcon;
};

export type WebReaderHubModel = {
  categories: WebReaderHubCategory[];
  intents: WebReaderHubIntent[];
  featured: WebReaderHubSource[];
  otherLanguageSources: WebReaderHubSource[];
};

export type WebReaderSessionState = {
  readerUrl: string;
  addressValue: string;
  isHubVisible: boolean;
  pageTitle: string;
};

export function getWebReaderHubPurposeLabel(purpose?: WebReaderHubPurpose) {
  if (!purpose) {
    return "분류 없음";
  }
  return purpose === "output-life" ? "아웃풋-라이프" : "인풋-리딩";
}

export function readWebReaderSession(): WebReaderSessionState {
  const fallback: WebReaderSessionState = {
    readerUrl: WEB_READER_DEFAULT_URL,
    addressValue: "",
    isHubVisible: true,
    pageTitle: "웹 리더"
  };
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const saved = window.localStorage.getItem(WEB_READER_SESSION_STORAGE_KEY);
    if (!saved) {
      return fallback;
    }
    const parsed = JSON.parse(saved) as Partial<WebReaderSessionState>;
    const readerUrl =
      typeof parsed.readerUrl === "string" && parsed.readerUrl.trim()
        ? parsed.readerUrl
        : fallback.readerUrl;
    const isHubVisible =
      typeof parsed.isHubVisible === "boolean" ? parsed.isHubVisible : fallback.isHubVisible;
    return {
      readerUrl,
      addressValue:
        typeof parsed.addressValue === "string" && parsed.addressValue.trim()
          ? parsed.addressValue
          : isHubVisible
            ? ""
            : readerUrl,
      isHubVisible,
      pageTitle:
        typeof parsed.pageTitle === "string" && parsed.pageTitle.trim()
          ? parsed.pageTitle
          : fallback.pageTitle
    };
  } catch {
    return fallback;
  }
}

export function writeWebReaderSession(session: WebReaderSessionState) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(WEB_READER_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Session restore is a convenience feature; ignore storage failures.
  }
}

export const webReaderHubCategories: WebReaderHubCategory[] = [
  {
    id: "community",
    label: "커뮤니티",
    icon: MessageCircle,
    purpose: "input-reading",
    sources: [
      {
        label: "Reddit",
        url: "https://www.reddit.com/",
        description: "댓글과 짧은 토론에서 자연스러운 표현을 수집"
      },
      {
        label: "X",
        url: "https://x.com/",
        description: "짧은 문장, 밈, 실시간 반응 읽기"
      },
      {
        label: "Discord",
        url: "https://discord.com/channels/@me",
        description: "실제 대화체와 캐주얼한 영어 입력"
      },
      {
        label: "Hacker News",
        url: "https://news.ycombinator.com/",
        description: "짧은 기술 토론과 의견문"
      },
      {
        label: "Quora",
        url: "https://www.quora.com/",
        description: "질문 답변형 문장과 설명문"
      }
    ]
  },
  {
    id: "ai",
    label: "AI 대화",
    icon: Bot,
    purpose: "output-life",
    sources: [
      {
        label: "ChatGPT",
        url: "https://chatgpt.com/",
        description: "문장 해설, 첨삭, 대화 연습"
      },
      {
        label: "Gemini",
        url: "https://gemini.google.com/",
        description: "검색형 설명과 비교 질문"
      },
      {
        label: "Claude",
        url: "https://claude.ai/",
        description: "긴 글 요약과 표현 설명"
      }
    ]
  },
  {
    id: "news",
    label: "뉴스",
    icon: Newspaper,
    purpose: "input-reading",
    sources: [
      {
        label: "BBC",
        url: "https://www.bbc.com/news",
        description: "표준 뉴스 문체 읽기"
      },
      {
        label: "NPR",
        url: "https://www.npr.org/",
        description: "오디오 기사와 뉴스 문장"
      },
      {
        label: "VOA Learning English",
        url: "https://learningenglish.voanews.com/",
        description: "학습자용 뉴스와 쉬운 문장"
      }
    ]
  },
  {
    id: "knowledge",
    label: "지식",
    icon: BookOpen,
    purpose: "input-reading",
    sources: [
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/English_language",
        description: "백과체 설명문과 긴 문단"
      },
      {
        label: "Britannica",
        url: "https://www.britannica.com/",
        description: "정돈된 설명문과 개념 읽기"
      },
      {
        label: "YouTube",
        url: "https://www.youtube.com/",
        description: "영상 설명란, 댓글, 자막 기반 읽기"
      }
    ]
  },
  {
    id: "longform",
    label: "긴 글",
    icon: FileText,
    purpose: "input-reading",
    sources: [
      {
        label: "Medium",
        url: "https://medium.com/",
        description: "에세이와 블로그 문체"
      },
      {
        label: "Substack",
        url: "https://substack.com/",
        description: "뉴스레터와 긴 의견문"
      },
      {
        label: "Aeon",
        url: "https://aeon.co/",
        description: "깊이 있는 에세이 읽기"
      }
    ]
  },
  {
    id: "books",
    label: "원서",
    icon: BookOpen,
    purpose: "input-reading",
    sources: [
      {
        label: "Project Gutenberg",
        url: "https://www.gutenberg.org/",
        description: "무료 고전 원문"
      },
      {
        label: "Standard Ebooks",
        url: "https://standardebooks.org/",
        description: "정리된 공개 원서"
      }
    ]
  }
];

export const webReaderHubIntents: WebReaderHubIntent[] = [
  {
    label: "짧은 문장 줍기",
    description: "커뮤니티 반응글에서 표현을 빠르게 수집",
    url: "https://www.reddit.com/",
    icon: MessageCircle
  },
  {
    label: "긴 글 읽기",
    description: "에세이와 설명문을 차분히 읽기",
    url: "https://medium.com/",
    icon: FileText
  },
  {
    label: "대화체 익히기",
    description: "실제 대화와 댓글체 감각 익히기",
    url: "https://discord.com/channels/@me",
    icon: MessageCircle
  },
  {
    label: "뉴스 읽기",
    description: "학습자용 뉴스로 오늘 읽기 시작",
    url: "https://learningenglish.voanews.com/",
    icon: Newspaper
  },
  {
    label: "AI로 해설받기",
    description: "선택 문장을 설명하고 예문으로 확장",
    url: "https://chatgpt.com/",
    icon: Sparkles
  }
];

export const webReaderHubFeatured: WebReaderHubSource[] = [
  {
    label: "VOA Learning English",
    url: "https://learningenglish.voanews.com/",
    description: "쉬운 뉴스로 워밍업"
  },
  {
    label: "Wikipedia",
    url: WEB_READER_DEFAULT_URL,
    description: "긴 설명문에서 문장 수집"
  },
  {
    label: "ChatGPT",
    url: "https://chatgpt.com/",
    description: "문장 해설과 첨삭"
  }
];

const commonLifeDialogueSources: WebReaderHubSource[] = [
  {
    label: "ChatGPT",
    url: "https://chatgpt.com/",
    description: "내 표현, 첨삭, 답변 문맥을 라이프 카드 재료로 수집"
  },
  {
    label: "Gemini",
    url: "https://gemini.google.com/",
    description: "질문과 답변 흐름을 언어와 무관하게 라이프 마이닝으로 수집"
  },
  {
    label: "Claude",
    url: "https://claude.ai/",
    description: "긴 대화, 요약, 표현 설명을 문맥 포함으로 확인"
  }
];

const commonLifeDialogueCategory: WebReaderHubCategory = {
  id: "life-dialogue",
  label: "AI 대화",
  icon: Bot,
  purpose: "output-life",
  sources: commonLifeDialogueSources
};

const commonLifeMiningIntent: WebReaderHubIntent = {
  label: "내 표현 수집",
  description: "AI 대화에서 내가 쓴 문장과 답변 문맥을 남기기",
  url: "https://chatgpt.com/",
  icon: Bot
};

const DEFAULT_CUSTOM_CATEGORY_ID = "custom";

export const webReaderCollectionHubCategories: WebReaderHubCategory[] = [
  {
    id: "life-dialogue",
    label: "AI 대화",
    icon: Bot,
    purpose: "output-life",
    sources: [
      ...commonLifeDialogueSources,
      {
        label: "Discord",
        url: "https://discord.com/channels/@me",
        description: "실제 채팅 표현과 내 메시지를 라이프 마이닝으로 수집"
      }
    ]
  },
  {
    id: "community-expression",
    label: "커뮤니티 표현",
    icon: MessageCircle,
    purpose: "input-reading",
    sources: [
      {
        label: "Reddit",
        url: "https://www.reddit.com/",
        description: "댓글, 밈, 생활 표현을 문장카드로 줍기"
      },
      {
        label: "X",
        url: "https://x.com/",
        description: "짧은 반응, 관용구, 실시간 말투 읽기"
      },
      {
        label: "Hacker News",
        url: "https://news.ycombinator.com/",
        description: "기술 토론 댓글에서 의견 표현 수집"
      }
    ]
  },
  {
    id: "knowledge-reading",
    label: "지식/설명 읽기",
    icon: BookOpen,
    purpose: "input-reading",
    sources: [
      {
        label: "Wikipedia",
        url: WEB_READER_DEFAULT_URL,
        description: "개념 설명문과 긴 문단을 독해 카드로 만들기"
      },
      {
        label: "Britannica",
        url: "https://www.britannica.com/",
        description: "정돈된 설명문과 학술적인 정의 읽기"
      },
      {
        label: "MDN Web Docs",
        url: "https://developer.mozilla.org/en-US/",
        description: "기술 설명문과 예제 문맥 읽기"
      }
    ]
  },
  {
    id: "news-current",
    label: "뉴스/시사",
    icon: Newspaper,
    purpose: "input-reading",
    sources: [
      {
        label: "VOA Learning English",
        url: "https://learningenglish.voanews.com/",
        description: "쉬운 뉴스 문장으로 부담 적게 시작"
      },
      {
        label: "BBC",
        url: "https://www.bbc.com/news",
        description: "표준 뉴스 문체와 시사 어휘 읽기"
      },
      {
        label: "NPR",
        url: "https://www.npr.org/",
        description: "기사와 오디오 기반 문장 재료 찾기"
      },
      {
        label: "Reuters",
        url: "https://www.reuters.com/",
        description: "간결한 국제 뉴스 문장 읽기"
      }
    ]
  },
  {
    id: "work-context",
    label: "전문/작업 문맥",
    icon: FileText,
    purpose: "input-reading",
    sources: [
      {
        label: "GitHub",
        url: "https://github.com/",
        description: "이슈, PR, README에서 작업 영어 수집"
      },
      {
        label: "Stack Overflow",
        url: "https://stackoverflow.com/",
        description: "문제 설명과 답변 패턴을 기술 영어 카드로 만들기"
      },
      {
        label: "MDN Web Docs",
        url: "https://developer.mozilla.org/en-US/",
        description: "공식 문서 문체와 정확한 용어 읽기"
      }
    ]
  }
];

export const webReaderCollectionHubIntents: WebReaderHubIntent[] = [
  commonLifeMiningIntent,
  {
    label: "댓글 표현 줍기",
    description: "Reddit에서 자연스러운 짧은 표현 찾기",
    url: "https://www.reddit.com/",
    icon: MessageCircle
  },
  {
    label: "설명문 읽기",
    description: "Wikipedia로 개념 설명 문단 읽기",
    url: WEB_READER_DEFAULT_URL,
    icon: BookOpen
  },
  {
    label: "뉴스 문장 읽기",
    description: "VOA로 쉬운 시사 문장부터 시작",
    url: "https://learningenglish.voanews.com/",
    icon: Newspaper
  },
  {
    label: "작업 영어 수집",
    description: "GitHub/문서에서 실제 작업 문맥 읽기",
    url: "https://github.com/",
    icon: FileText
  }
];

const japaneseWebReaderHubCategories: WebReaderHubCategory[] = [
  {
    id: "community-expression",
    label: "커뮤니티 표현",
    icon: MessageCircle,
    purpose: "input-reading",
    sources: [
      {
        label: "note",
        url: "https://note.com/",
        description: "일본어 에세이, 후기, 생활 표현 읽기",
        languageCode: "ja"
      },
      {
        label: "はてなブックマーク",
        url: "https://b.hatena.ne.jp/",
        description: "일본어 댓글과 짧은 반응 읽기",
        languageCode: "ja"
      },
      {
        label: "Yahoo!知恵袋",
        url: "https://chiebukuro.yahoo.co.jp/",
        description: "질문 답변 문체와 생활 일본어 수집",
        languageCode: "ja"
      }
    ]
  },
  {
    id: "news-current",
    label: "뉴스/시사",
    icon: Newspaper,
    purpose: "input-reading",
    sources: [
      {
        label: "NHK NEWS WEB EASY",
        url: "https://www3.nhk.or.jp/news/easy/",
        description: "쉬운 일본어 뉴스로 워밍업",
        languageCode: "ja"
      },
      {
        label: "NHKニュース",
        url: "https://www3.nhk.or.jp/news/",
        description: "표준 일본어 뉴스 문장 읽기",
        languageCode: "ja"
      },
      {
        label: "Yahoo!ニュース",
        url: "https://news.yahoo.co.jp/",
        description: "일본어 시사 기사와 댓글 흐름 읽기",
        languageCode: "ja"
      }
    ]
  },
  {
    id: "knowledge-reading",
    label: "지식/설명 읽기",
    icon: BookOpen,
    purpose: "input-reading",
    sources: [
      {
        label: "日本語版Wikipedia",
        url: "https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E",
        description: "개념 설명문과 긴 문단 읽기",
        languageCode: "ja"
      },
      {
        label: "青空文庫",
        url: "https://www.aozora.gr.jp/",
        description: "공개 일본어 문학 원문 읽기",
        languageCode: "ja"
      }
    ]
  },
  commonLifeDialogueCategory
];

const japaneseWebReaderHubIntents: WebReaderHubIntent[] = [
  commonLifeMiningIntent,
  {
    label: "쉬운 뉴스 읽기",
    description: "NHK EASY로 오늘 일본어 뉴스 시작",
    url: "https://www3.nhk.or.jp/news/easy/",
    icon: Newspaper
  },
  {
    label: "생활 표현 줍기",
    description: "note에서 자연스러운 후기와 에세이 읽기",
    url: "https://note.com/",
    icon: MessageCircle
  },
  {
    label: "원문 읽기",
    description: "青空文庫에서 짧은 공개 문학 읽기",
    url: "https://www.aozora.gr.jp/",
    icon: BookOpen
  }
];

const koreanWebReaderHubCategories: WebReaderHubCategory[] = [
  {
    id: "community-expression",
    label: "커뮤니티 표현",
    icon: MessageCircle,
    purpose: "input-reading",
    sources: [
      {
        label: "네이버 블로그",
        url: "https://section.blog.naver.com/",
        description: "후기, 일상글, 자연스러운 한국어 표현 읽기",
        languageCode: "ko"
      },
      {
        label: "브런치스토리",
        url: "https://brunch.co.kr/",
        description: "에세이와 설명문 문체 읽기",
        languageCode: "ko"
      }
    ]
  },
  {
    id: "news-current",
    label: "뉴스/시사",
    icon: Newspaper,
    purpose: "input-reading",
    sources: [
      {
        label: "네이버 뉴스",
        url: "https://news.naver.com/",
        description: "한국어 뉴스 문장과 시사 어휘 읽기",
        languageCode: "ko"
      },
      {
        label: "다음 뉴스",
        url: "https://news.daum.net/",
        description: "한국어 기사와 댓글 흐름 읽기",
        languageCode: "ko"
      }
    ]
  },
  {
    id: "knowledge-reading",
    label: "지식/설명 읽기",
    icon: BookOpen,
    purpose: "input-reading",
    sources: [
      {
        label: "한국어 위키백과",
        url: "https://ko.wikipedia.org/wiki/%ED%95%9C%EA%B5%AD%EC%96%B4",
        description: "한국어 개념 설명문 읽기",
        languageCode: "ko"
      },
      {
        label: "YouTube",
        url: "https://www.youtube.com/",
        description: "한국어 영상 설명란, 댓글, 자막 기반 읽기",
        languageCode: "ko"
      }
    ]
  },
  commonLifeDialogueCategory
];

const koreanWebReaderHubIntents: WebReaderHubIntent[] = [
  commonLifeMiningIntent,
  {
    label: "뉴스 문장 읽기",
    description: "네이버 뉴스에서 한국어 기사 읽기",
    url: "https://news.naver.com/",
    icon: Newspaper
  },
  {
    label: "에세이 읽기",
    description: "브런치에서 긴 글 문체 읽기",
    url: "https://brunch.co.kr/",
    icon: FileText
  },
  {
    label: "영상 문맥 보기",
    description: "YouTube 설명란과 댓글에서 문장 수집",
    url: "https://www.youtube.com/",
    icon: MessageCircle
  }
];

export function getWebReaderHubModel(
  targetLanguageCode: string,
  customSources: WebReaderCustomSource[] = [],
  customCategories: WebReaderCustomCategory[] = []
): WebReaderHubModel {
  const languageCode = targetLanguageCode.trim().toLowerCase().split("-")[0];
  const base: WebReaderHubModel =
    languageCode === "ja"
        ? {
            categories: japaneseWebReaderHubCategories,
            intents: japaneseWebReaderHubIntents,
            featured: japaneseWebReaderHubCategories.flatMap((category) => category.sources).slice(0, 3),
            otherLanguageSources: []
          }
        : languageCode === "ko"
          ? {
              categories: koreanWebReaderHubCategories,
              intents: koreanWebReaderHubIntents,
              featured: koreanWebReaderHubCategories.flatMap((category) => category.sources).slice(0, 3),
              otherLanguageSources: []
            }
          : {
              categories: webReaderCollectionHubCategories,
              intents: webReaderCollectionHubIntents,
              featured: webReaderHubFeatured,
              otherLanguageSources: []
            };
  const matchingCustomSources = customSources
    .filter((source) => source.languageCode.trim().toLowerCase().split("-")[0] === languageCode)
    .map<WebReaderHubSource>((source) => ({
      id: source.id,
      label: source.label,
      url: source.url,
      description: source.description || "사용자 추가 사이트",
      languageCode: source.languageCode,
      categoryId: source.categoryId,
      isCustom: true
    }));
  const matchingCustomSourceRecords = customSources.filter(
    (source) => source.languageCode.trim().toLowerCase().split("-")[0] === languageCode
  );
  const matchingCustomCategories = customCategories.filter(
    (category) => category.languageCode.trim().toLowerCase().split("-")[0] === languageCode
  );
  const otherLanguageSources = customSources
    .filter((source) => source.languageCode.trim().toLowerCase().split("-")[0] !== languageCode)
    .map<WebReaderHubSource>((source) => ({
      label: source.label,
      url: source.url,
      description: source.description || "다른 언어 사용자 추가 사이트",
      languageCode: source.languageCode
    }));

  if (matchingCustomSources.length === 0 && matchingCustomCategories.length === 0) {
    return {
      ...base,
      otherLanguageSources
    };
  }

  const baseCategoryIds = new Set(base.categories.map((category) => category.id));
  const customCategoryIds = new Set(
    matchingCustomCategories.map((category) => category.id.trim()).filter(Boolean)
  );
  const customSourcesByCategory = new Map<string, WebReaderHubSource[]>();
  const defaultCustomSources: WebReaderHubSource[] = [];

  matchingCustomSourceRecords.forEach((record, index) => {
    const source = matchingCustomSources[index];
    const categoryId = record.categoryId?.trim() || DEFAULT_CUSTOM_CATEGORY_ID;
    if (baseCategoryIds.has(categoryId) || customCategoryIds.has(categoryId)) {
      customSourcesByCategory.set(categoryId, [
        ...(customSourcesByCategory.get(categoryId) ?? []),
        source
      ]);
      return;
    }
    defaultCustomSources.push(source);
  });

  const customHubCategories: WebReaderHubCategory[] = matchingCustomCategories.map((category) => ({
    id: category.id,
    label: category.label,
    icon: Sparkles,
    purpose: category.purpose,
    isCustom: true,
    sources: customSourcesByCategory.get(category.id) ?? []
  }));

  const defaultCustomHubCategory: WebReaderHubCategory[] =
    defaultCustomSources.length > 0
      ? [
          {
            id: DEFAULT_CUSTOM_CATEGORY_ID,
            label: "내 사이트",
            icon: Sparkles,
            isCustom: true,
            sources: defaultCustomSources
          }
        ]
      : [];

  const baseCategoriesWithCustomSources = base.categories.map((category) => {
    const sources = customSourcesByCategory.get(category.id);
    return sources?.length
      ? {
          ...category,
          sources: [...sources, ...category.sources]
        }
      : category;
  });

  return {
    categories: [...customHubCategories, ...defaultCustomHubCategory, ...baseCategoriesWithCustomSources],
    intents: base.intents,
    featured: [...matchingCustomSources.slice(0, 2), ...base.featured].slice(0, 4),
    otherLanguageSources
  };
}

const webReaderSourceStyleByLabel: Record<
  string,
  { initials: string; accent: string; tag: string }
> = {
  Reddit: { initials: "R", accent: "#ff4500", tag: "커뮤니티" },
  X: { initials: "X", accent: "#111827", tag: "짧은 글" },
  Discord: { initials: "D", accent: "#5865f2", tag: "대화체" },
  "Hacker News": { initials: "HN", accent: "#ff6600", tag: "토론" },
  Quora: { initials: "Q", accent: "#b92b27", tag: "Q&A" },
  ChatGPT: { initials: "G", accent: "#10a37f", tag: "AI" },
  Gemini: { initials: "Ge", accent: "#4f46e5", tag: "AI" },
  Claude: { initials: "C", accent: "#d97706", tag: "AI" },
  BBC: { initials: "B", accent: "#0f172a", tag: "뉴스" },
  NPR: { initials: "N", accent: "#d62027", tag: "뉴스" },
  "VOA Learning English": { initials: "VOA", accent: "#1d4ed8", tag: "학습뉴스" },
  Wikipedia: { initials: "W", accent: "#475569", tag: "지식" },
  Britannica: { initials: "Br", accent: "#0f766e", tag: "백과" },
  YouTube: { initials: "YT", accent: "#ff0033", tag: "영상" },
  Medium: { initials: "M", accent: "#111827", tag: "에세이" },
  Substack: { initials: "S", accent: "#ff6719", tag: "뉴스레터" },
  Aeon: { initials: "A", accent: "#7c3aed", tag: "롱폼" },
  "Project Gutenberg": { initials: "PG", accent: "#795548", tag: "원서" },
  "Standard Ebooks": { initials: "SE", accent: "#2563eb", tag: "원서" }
};

const webReaderCollectionSourceStyleByLabel: Record<
  string,
  { initials: string; accent: string; tag: string }
> = {
  ...webReaderSourceStyleByLabel,
  Reuters: { initials: "Re", accent: "#f59e0b", tag: "뉴스" },
  "NHK NEWS WEB EASY": { initials: "NHK", accent: "#16a34a", tag: "쉬운뉴스" },
  "NHKニュース": { initials: "NHK", accent: "#dc2626", tag: "뉴스" },
  "Yahoo!ニュース": { initials: "Y!", accent: "#ef4444", tag: "뉴스" },
  note: { initials: "no", accent: "#10b981", tag: "에세이" },
  "はてなブックマーク": { initials: "B!", accent: "#2563eb", tag: "댓글" },
  "Yahoo!知恵袋": { initials: "知", accent: "#f59e0b", tag: "Q&A" },
  "日本語版Wikipedia": { initials: "W", accent: "#475569", tag: "지식" },
  "青空文庫": { initials: "青", accent: "#0891b2", tag: "문학" },
  "네이버 뉴스": { initials: "N", accent: "#16a34a", tag: "뉴스" },
  "다음 뉴스": { initials: "D", accent: "#2563eb", tag: "뉴스" },
  "네이버 블로그": { initials: "NB", accent: "#22c55e", tag: "블로그" },
  브런치스토리: { initials: "Br", accent: "#111827", tag: "에세이" },
  "한국어 위키백과": { initials: "W", accent: "#475569", tag: "지식" },
  "MDN Web Docs": { initials: "MDN", accent: "#2563eb", tag: "문서" },
  GitHub: { initials: "GH", accent: "#111827", tag: "작업" },
  "Stack Overflow": { initials: "SO", accent: "#f97316", tag: "Q&A" }
};

export function getWebReaderSourceStyle(source: WebReaderHubSource) {
  return (
    webReaderCollectionSourceStyleByLabel[source.label] ?? {
      initials: source.label.slice(0, 2).toUpperCase(),
      accent: "#1769e0",
      tag: "웹"
    }
  );
}

