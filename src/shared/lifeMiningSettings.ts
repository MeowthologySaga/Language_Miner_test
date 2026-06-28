import type {
  LifeMiningCapturePreset,
  LifeMiningCaptureSettings,
  LifeMiningCaptureScope,
  LifeMiningCaptureTarget,
  LifeMiningContextMode,
  LifeMiningLongMessageMode
} from "./types";

const presetIds = new Set<LifeMiningCapturePreset>(["light", "balanced", "deep", "custom"]);
const targetIds = new Set<LifeMiningCaptureTarget>(["own", "own_with_reply", "all"]);
const scopeIds = new Set<LifeMiningCaptureScope>([
  "new_only",
  "visible",
  "recent",
  "manual_all"
]);
const contextModeIds = new Set<LifeMiningContextMode>([
  "none",
  "previous_1",
  "previous_2",
  "previous_and_next",
  "recent"
]);
const longMessageModeIds = new Set<LifeMiningLongMessageMode>([
  "truncate",
  "summarize",
  "skip"
]);

export const defaultLifeMiningCaptureSettings: LifeMiningCaptureSettings = {
  preset: "balanced",
  target: "own_with_reply",
  scope: "new_only",
  contextMode: "previous_and_next",
  contextBeforeCount: 6,
  contextAfterCount: 2,
  maxMessageChars: 1500,
  longMessageMode: "truncate",
  filterLowSignalTargets: true,
  dedupeEnabled: true
};

export const lifeMiningPresetSettings: Record<
  Exclude<LifeMiningCapturePreset, "custom">,
  LifeMiningCaptureSettings
> = {
  light: {
    preset: "light",
    target: "own",
    scope: "new_only",
    contextMode: "previous_1",
    contextBeforeCount: 2,
    contextAfterCount: 0,
    maxMessageChars: 900,
    longMessageMode: "truncate",
    filterLowSignalTargets: true,
    dedupeEnabled: true
  },
  balanced: defaultLifeMiningCaptureSettings,
  deep: {
    preset: "deep",
    target: "own_with_reply",
    scope: "new_only",
    contextMode: "recent",
    contextBeforeCount: 10,
    contextAfterCount: 4,
    maxMessageChars: 2200,
    longMessageMode: "truncate",
    filterLowSignalTargets: true,
    dedupeEnabled: true
  }
};

export function resolveLifeMiningPresetSettings(
  preset: LifeMiningCapturePreset
): LifeMiningCaptureSettings {
  if (preset === "custom") {
    return { ...defaultLifeMiningCaptureSettings, preset: "custom" };
  }
  return { ...lifeMiningPresetSettings[preset] };
}

export function normalizeLifeMiningCaptureSettings(
  input?: Partial<LifeMiningCaptureSettings> | null
): LifeMiningCaptureSettings {
  const preset = presetIds.has(input?.preset as LifeMiningCapturePreset)
    ? (input?.preset as LifeMiningCapturePreset)
    : defaultLifeMiningCaptureSettings.preset;
  const base = preset === "custom" ? defaultLifeMiningCaptureSettings : resolveLifeMiningPresetSettings(preset);
  const maxMessageChars = Number(input?.maxMessageChars);
  const contextBeforeCount = Number(input?.contextBeforeCount);
  const contextAfterCount = Number(input?.contextAfterCount);

  return {
    ...base,
    preset,
    target: targetIds.has(input?.target as LifeMiningCaptureTarget)
      ? (input?.target as LifeMiningCaptureTarget)
      : base.target,
    scope: scopeIds.has(input?.scope as LifeMiningCaptureScope)
      ? (input?.scope as LifeMiningCaptureScope)
      : base.scope,
    contextMode: contextModeIds.has(input?.contextMode as LifeMiningContextMode)
      ? (input?.contextMode as LifeMiningContextMode)
      : base.contextMode,
    contextBeforeCount: Number.isFinite(contextBeforeCount)
      ? Math.min(20, Math.max(0, Math.round(contextBeforeCount)))
      : base.contextBeforeCount,
    contextAfterCount: Number.isFinite(contextAfterCount)
      ? Math.min(10, Math.max(0, Math.round(contextAfterCount)))
      : base.contextAfterCount,
    maxMessageChars: Number.isFinite(maxMessageChars)
      ? Math.min(6000, Math.max(300, Math.round(maxMessageChars)))
      : base.maxMessageChars,
    longMessageMode: longMessageModeIds.has(input?.longMessageMode as LifeMiningLongMessageMode)
      ? (input?.longMessageMode as LifeMiningLongMessageMode)
      : base.longMessageMode,
    filterLowSignalTargets: input?.filterLowSignalTargets !== false,
    dedupeEnabled: input?.dedupeEnabled !== false
  };
}
