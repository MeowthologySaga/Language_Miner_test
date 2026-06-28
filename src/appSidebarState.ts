export type NavSectionId = "input" | "output" | "review" | "playZone" | "manage";

export type NavSectionExpandedState = Record<NavSectionId, boolean>;

export const defaultNavSectionExpandedState: NavSectionExpandedState = {
  input: false,
  output: false,
  review: false,
  playZone: false,
  manage: false
};

const SIDEBAR_COLLAPSED_KEY = "lem:sidebarCollapsed";
const SIDEBAR_NAV_SECTIONS_KEY = "lem:sidebarNavSections:v3";

export function readSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(isCollapsed: boolean) {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, isCollapsed ? "1" : "0");
  } catch {
    // Ignore storage failures; the in-memory UI state is still updated.
  }
}

export function readNavSectionExpandedState(): NavSectionExpandedState {
  try {
    const raw = localStorage.getItem(SIDEBAR_NAV_SECTIONS_KEY);
    if (!raw) {
      return defaultNavSectionExpandedState;
    }
    const parsed = JSON.parse(raw) as Partial<Record<NavSectionId, unknown>>;
    return {
      input:
        typeof parsed.input === "boolean"
          ? parsed.input
          : defaultNavSectionExpandedState.input,
      output:
        typeof parsed.output === "boolean"
          ? parsed.output
          : defaultNavSectionExpandedState.output,
      review:
        typeof parsed.review === "boolean"
          ? parsed.review
          : defaultNavSectionExpandedState.review,
      playZone:
        typeof parsed.playZone === "boolean"
          ? parsed.playZone
          : defaultNavSectionExpandedState.playZone,
      manage:
        typeof parsed.manage === "boolean"
          ? parsed.manage
          : defaultNavSectionExpandedState.manage
    };
  } catch {
    return defaultNavSectionExpandedState;
  }
}

export function writeNavSectionExpandedState(state: NavSectionExpandedState) {
  try {
    localStorage.setItem(SIDEBAR_NAV_SECTIONS_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures; the in-memory UI state is still updated.
  }
}
