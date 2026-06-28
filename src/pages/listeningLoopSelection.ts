type ListeningLoopStorage = Pick<Storage, "getItem" | "setItem">;

export function getSelectedListeningHighlightText(
  container: HTMLElement | null,
  sourceText: string
) {
  const selection = typeof window === "undefined" ? null : window.getSelection();
  if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return "";
  }
  if (!isNodeInside(container, selection.anchorNode) || !isNodeInside(container, selection.focusNode)) {
    return "";
  }

  const selectedText = normalizeSelectedText(selection.toString());
  if (!selectedText || !/[A-Za-z0-9]/.test(selectedText)) {
    return "";
  }

  return findSelectedSourceText(sourceText, selectedText);
}

export function findSelectedSourceText(sourceText: string, selectedText: string) {
  const exactMatch = new RegExp(escapeRegExp(selectedText), "i").exec(sourceText);
  if (exactMatch?.[0]) {
    return exactMatch[0];
  }

  const flexiblePattern = selectedText.split(/\s+/).map(escapeRegExp).join("\\s+");
  const flexibleMatch = new RegExp(flexiblePattern, "i").exec(sourceText);
  return flexibleMatch?.[0] ?? selectedText;
}

function isNodeInside(container: HTMLElement, node: Node | null) {
  return Boolean(node && (node === container || container.contains(node)));
}

export function normalizeSelectedText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeHighlightLookupKey(value: string) {
  return normalizeSelectedText(value).toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function readStoredBoolean(
  key: string,
  fallback: boolean,
  storage = getListeningLoopStorage()
) {
  try {
    const value = storage?.getItem(key);
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredBoolean(
  key: string,
  value: boolean,
  storage = getListeningLoopStorage()
) {
  try {
    storage?.setItem(key, String(value));
  } catch {
    // localStorage can be unavailable in restricted web previews.
  }
}

export function readStoredString(key: string, storage = getListeningLoopStorage()) {
  try {
    return storage?.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function writeStoredString(
  key: string,
  value: string,
  storage = getListeningLoopStorage()
) {
  try {
    storage?.setItem(key, value);
  } catch {
    // localStorage can be unavailable in restricted web previews.
  }
}

export function isEditableShortcutTarget(target: EventTarget | null) {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}

function getListeningLoopStorage(): ListeningLoopStorage | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
}
