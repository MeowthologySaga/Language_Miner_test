import {
  FlaskConical,
  FolderOpen,
  Monitor,
  MousePointer2,
  SlidersHorizontal,
  Sparkles,
  type LucideIcon
} from "lucide-react";
import type {
  AppSettings,
  LifeMiningCapturePreset,
  LifeMiningCaptureSettings,
  TtsProviderName
} from "../shared/types";
export type SettingsTabId = "basic" | "ai" | "capture" | "sync" | "display" | "labs";

export type SettingsMode = "basic" | "advanced";

export type SettingsPanelId =
  | "profile"
  | "cardEngine"
  | "apiUsage"
  | "tts"
  | "capture"
  | "sync"
  | "background"
  | "labs"
  | "developer"
  | "privacy"
  | "export";

export const settingsTabOptions: Array<{
  id: SettingsTabId;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: "basic", label: "기본", description: "자주 쓰는 설정", icon: SlidersHorizontal },
  { id: "ai", label: "AI/API", description: "모델과 비용", icon: Sparkles },
  { id: "capture", label: "캡처", description: "웹/문장 수집", icon: MousePointer2 },
  { id: "sync", label: "동기화", description: "카드 파일 백업", icon: FolderOpen },
  { id: "display", label: "화면", description: "네비와 실행", icon: Monitor },
  { id: "labs", label: "실험실", description: "고급/개발자", icon: FlaskConical }
];

export const settingsPanelSearchText: Record<SettingsPanelId, string> = {
  profile: "프로필 언어 계정 학습 영어 한국어",
  cardEngine: "카드 생성 모델 provider ollama gemini mock",
  apiUsage: "api 사용량 번역 gemini google 비용 토큰 한도",
  tts: "tts 음성 듣기 오디오",
  capture: "캡처 단축키 웹 라이프 마이닝 문장카드 팝오버",
  sync: "동기화 백업 폴더 시작 종료 카드",
  background: "백그라운드 트레이 자동 실행 windows 시작 듣기 루프 미리 준비",
  labs: "실험실 화면 네비 숨김 용어집",
  developer: "개발자 디버그 pdf",
  privacy: "개인정보 로컬 sqlite 브라우저 수집",
  export: "내보내기 anki csv json 백업"
};

export const ollamaModelPresets = [
  {
    label: "16GB 기본",
    value: "gemma4:12b",
    description: "현재 PDF 번역/카드 JSON 기본 추천"
  },
  {
    label: "Gemma 4 Abliterated",
    value: "huihui_ai/gemma-4-abliterated:12b",
    description: "성인 농담/비속어 대사 번역 대안"
  },
  {
    label: "Qwen 3 14B",
    value: "qwen3:14b",
    description: "다국어 번역 대안"
  },
  {
    label: "Qwen 3 Abliterated",
    value: "huihui_ai/qwen3-abliterated:14b",
    description: "검열 완화 Qwen 14B 대안"
  },
  {
    label: "Qwen 2.5 14B",
    value: "qwen2.5:14b",
    description: "이전 안정 기본값"
  },
  {
    label: "Gemma 3 12B",
    value: "gemma3:12b",
    description: "이전 Gemma 12B"
  },
  {
    label: "빠른 균형",
    value: "qwen3:8b",
    description: "속도와 품질 절충"
  }
];

export const geminiModelPresets = [
  {
    label: "Flash-Lite",
    value: "gemini-2.5-flash-lite",
    description: "반복 PDF 번역 테스트용 가장 빠른 옵션"
  },
  {
    label: "Flash",
    value: "gemini-2.5-flash",
    description: "품질과 속도의 균형"
  },
  {
    label: "Pro",
    value: "gemini-2.5-pro",
    description: "품질 우선. 느리고 수요 폭주에 걸릴 가능성이 높음"
  }
];

export const ttsProviderPresets: Array<{
  label: string;
  value: TtsProviderName;
  description: string;
}> = [
  {
    label: "Windows 내장",
    value: "system",
    description: "가볍고 빠른 기본 로컬 TTS"
  },
  {
    label: "브라우저",
    value: "browser",
    description: "웹 테스트용 즉시 대체 재생"
  },
  {
    label: "Piper",
    value: "piper",
    description: "경량 AI 음성 모델용 자리. 모델 번들은 다음 단계"
  }
];

export const ttsModelPresets = [
  {
    label: "가벼운 기본",
    value: "windows-system-default",
    description: "Windows 설치 음성 중 기본값 사용"
  },
  {
    label: "Piper EN 소형",
    value: "piper-en_US-lessac-low",
    description: "추후 번들할 경량 영어 음성 모델 후보"
  },
  {
    label: "Piper EN 중간",
    value: "piper-en_US-lessac-medium",
    description: "품질 우선 경량 모델 후보"
  }
];

export const browserCaptureSiteOptions: Array<{
  key: keyof AppSettings["browserCaptureSiteSettings"];
  label: string;
  description: string;
}> = [
  {
    key: "discord",
    label: "Discord",
    description: "웹 Discord에서 내가 보낸 메시지와 선택 텍스트를 수집합니다."
  },
  {
    key: "chatgpt",
    label: "ChatGPT",
    description: "ChatGPT 웹 대화에서 내가 보낸 말과 선택 텍스트를 수집합니다."
  },
  {
    key: "claude",
    label: "Claude",
    description: "Claude 웹 대화에서 내가 보낸 말과 선택 텍스트를 수집합니다."
  },
  {
    key: "youtube",
    label: "YouTube",
    description: "시청 기록 추천, 이중자막, 선택 텍스트 카드를 사용합니다."
  },
  {
    key: "reddit",
    label: "Reddit",
    description: "Reddit에서 드래그한 문장 카드 팝오버를 사용합니다."
  },
  {
    key: "genericWeb",
    label: "그 외 웹",
    description: "위 사이트가 아닌 일반 웹페이지에서 드래그 카드 팝오버를 사용합니다."
  }
];

export const lifeMiningPresetOptions: Array<{
  value: Exclude<LifeMiningCapturePreset, "custom">;
  label: string;
  description: string;
}> = [
  {
    value: "balanced",
    label: "균형",
    description: "내 메시지 1개 + 앞 6개/뒤 2개 문맥. 기본 추천값입니다."
  },
  {
    value: "light",
    label: "가볍게",
    description: "내 메시지와 앞 2개 문맥만 저장해서 중복과 비용을 줄입니다."
  },
  {
    value: "deep",
    label: "깊게",
    description: "앞 10개/뒤 4개 버블을 붙여 긴 대화 흐름을 남깁니다."
  }
];

export const lifeMiningTargetOptions: Array<{
  value: LifeMiningCaptureSettings["target"];
  label: string;
  description: string;
}> = [
  {
    value: "own_with_reply",
    label: "내 말 + 답변 문맥",
    description: "학습 대상은 내 메시지, 답변은 문맥으로만 저장합니다."
  },
  {
    value: "own",
    label: "내 말만",
    description: "내가 쓴 문장만 저장합니다."
  },
  {
    value: "all",
    label: "전체",
    description: "자동 캡처가 마지막 메시지까지 대상으로 삼습니다."
  }
];

export const lifeMiningScopeOptions: Array<{
  value: LifeMiningCaptureSettings["scope"];
  label: string;
  description: string;
}> = [
  {
    value: "new_only",
    label: "새 메시지만",
    description: "방금 보낸 메시지를 찾지 못하면 저장하지 않습니다."
  },
  {
    value: "visible",
    label: "보이는 범위",
    description: "수동 캡처 때 화면에 보이는 최근 메시지를 후보로 씁니다."
  },
  {
    value: "recent",
    label: "최근 대화",
    description: "최근 대화 문맥을 조금 더 넓게 허용합니다."
  }
];

export const lifeMiningContextOptions: Array<{
  value: LifeMiningCaptureSettings["contextMode"];
  label: string;
}> = [
  { value: "none", label: "없음" },
  { value: "previous_1", label: "직전 1개" },
  { value: "previous_2", label: "직전 2개" },
  { value: "previous_and_next", label: "앞뒤 지정 수" },
  { value: "recent", label: "최근 넓게" }
];
type SettingsPanelVisibilityInput = {
  activeSettingsTab: SettingsTabId;
  normalizedSettingsSearch: string;
  panelId: SettingsPanelId;
  settingsMode: SettingsMode;
};

type SettingsPanelClassNameInput = SettingsPanelVisibilityInput & {
  extraClassName?: string;
};

const panelIdsByTab: Record<SettingsTabId, SettingsPanelId[]> = {
  basic: ["profile"],
  ai: ["cardEngine", "apiUsage", "tts"],
  capture: ["capture"],
  sync: ["sync", "export"],
  display: ["background", "labs"],
  labs: ["labs", "developer", "privacy", "export"]
};

const advancedBasicPanelIds: SettingsPanelId[] = [
  "profile",
  "cardEngine",
  "apiUsage",
  "capture",
  "sync",
  "background"
];

export function isSettingsPanelVisible({
  activeSettingsTab,
  normalizedSettingsSearch,
  panelId,
  settingsMode
}: SettingsPanelVisibilityInput) {
  if (normalizedSettingsSearch) {
    return settingsPanelSearchText[panelId].toLowerCase().includes(normalizedSettingsSearch);
  }

  if (activeSettingsTab === "basic" && settingsMode === "advanced") {
    return advancedBasicPanelIds.includes(panelId);
  }

  return panelIdsByTab[activeSettingsTab].includes(panelId);
}

export function getSettingsPanelClassName({
  activeSettingsTab,
  extraClassName = "",
  normalizedSettingsSearch,
  panelId,
  settingsMode
}: SettingsPanelClassNameInput) {
  return [
    "panel",
    "settings-panel",
    extraClassName,
    isSettingsPanelVisible({
      activeSettingsTab,
      normalizedSettingsSearch,
      panelId,
      settingsMode
    })
      ? ""
      : "settings-panel-hidden"
  ]
    .filter(Boolean)
    .join(" ");
}
