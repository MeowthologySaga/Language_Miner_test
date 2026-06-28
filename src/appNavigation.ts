import {
  BookMarked,
  BookOpen,
  Bookmark,
  Bot,
  CreditCard,
  Files,
  Film,
  Gamepad2,
  Gem,
  Globe2,
  Headphones,
  History,
  Home,
  Inbox,
  Languages,
  Lightbulb,
  ListChecks,
  Pencil,
  RotateCcw,
  Send,
  Settings as SettingsIcon,
  SlidersHorizontal,
  type LucideIcon
} from "lucide-react";
import type { NavSectionId } from "./appSidebarState";

export type TabKey =
  | "pdfHub"
  | "pdfReader"
  | "webReader"
  | "documentLibrary"
  | "bookmarks"
  | "bookMaker"
  | "exportHistory"
  | "cards"
  | "playZone"
  | "listeningLoop"
  | "videoReader"
  | "writingPractice"
  | "characterChat"
  | "review"
  | "life"
  | "glossary"
  | "settings";

export type NavItem = {
  key: TabKey;
  label?: string;
  icon?: LucideIcon;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export type NavSection = {
  id: NavSectionId;
  title: string;
  icon: LucideIcon;
  directKey?: TabKey;
  items?: NavItem[];
  groups?: NavGroup[];
};

export const routeMeta: Record<
  TabKey,
  {
    label: string;
    icon: LucideIcon;
  }
> = {
  pdfHub: { label: "오늘", icon: Home },
  pdfReader: { label: "문서 리더기", icon: BookOpen },
  webReader: { label: "웹 리더", icon: Globe2 },
  documentLibrary: { label: "최근 문서", icon: Files },
  bookmarks: { label: "북마크", icon: Bookmark },
  bookMaker: { label: "이중언어 책 만들기", icon: Languages },
  exportHistory: { label: "내보내기 기록", icon: History },
  cards: { label: "카드", icon: CreditCard },
  playZone: { label: "플레이존", icon: Gamepad2 },
  listeningLoop: { label: "듣기 루프", icon: Headphones },
  videoReader: { label: "영상 리더", icon: Film },
  writingPractice: { label: "영작 훈련", icon: Pencil },
  characterChat: { label: "캐릭터챗", icon: Bot },
  review: { label: "복습", icon: RotateCcw },
  life: { label: "라이프 마이닝", icon: Lightbulb },
  glossary: { label: "용어집", icon: BookMarked },
  settings: { label: "설정", icon: SettingsIcon }
};

export const homeNavItem: NavItem = { key: "pdfHub", label: "오늘", icon: Home };

export const navSections: NavSection[] = [
  {
    id: "input",
    title: "인풋",
    icon: Inbox,
    groups: [
      {
        title: "리딩",
        items: [
          { key: "pdfReader" },
          { key: "webReader" },
          { key: "documentLibrary" },
          { key: "bookmarks" },
          { key: "bookMaker" },
          { key: "exportHistory" }
        ]
      },
      {
        title: "리스닝",
        items: [{ key: "listeningLoop" }, { key: "videoReader" }]
      }
    ]
  },
  {
    id: "output",
    title: "아웃풋",
    icon: Send,
    items: [{ key: "writingPractice" }, { key: "characterChat" }]
  },
  {
    id: "review",
    title: "복습",
    icon: ListChecks,
    directKey: "review"
  },
  {
    id: "playZone",
    title: "플레이존",
    icon: Gem,
    directKey: "playZone"
  },
  {
    id: "manage",
    title: "관리",
    icon: SlidersHorizontal,
    items: [
      { key: "cards" },
      { key: "glossary" },
      { key: "life" },
      { key: "settings" }
    ]
  }
];

export function navSectionHasTab(section: NavSection, tab: TabKey) {
  return Boolean(
    section.directKey === tab ||
      section.items?.some((item) => item.key === tab) ||
      section.groups?.some((group) => group.items.some((item) => item.key === tab))
  );
}

export function getNavSectionIdForTab(tab: TabKey): NavSectionId | null {
  const section = navSections.find((candidate) => navSectionHasTab(candidate, tab));
  return section?.id ?? null;
}
