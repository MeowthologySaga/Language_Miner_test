import { DEFAULT_PROFILE_ID } from "./profiles";
import type { LifeLog, LifeLogMetadata, ProfileId } from "./types";

export function getLifeLogProcessedProfileIds(
  logOrMetadata: LifeLog | LifeLogMetadata | undefined | null
): ProfileId[] {
  const metadata = getLifeLogMetadata(logOrMetadata);
  return normalizeProcessedProfileIds(metadata?.processedProfileIds);
}

export function isLifeLogProcessedForProfile(
  log: LifeLog,
  profileId: ProfileId | undefined
): boolean {
  const normalizedProfileId = normalizeLifeLogProfileId(profileId);
  const processedProfileIds = getLifeLogProcessedProfileIds(log);
  if (processedProfileIds.includes(normalizedProfileId)) {
    return true;
  }

  return (
    normalizedProfileId === DEFAULT_PROFILE_ID &&
    processedProfileIds.length === 0 &&
    log.processed &&
    !Array.isArray(log.metadata?.processedProfileIds)
  );
}

export function markLifeLogMetadataProcessedForProfile(
  metadata: LifeLogMetadata | undefined,
  profileId: ProfileId | undefined
): LifeLogMetadata {
  const normalizedProfileId = normalizeLifeLogProfileId(profileId);
  const processedProfileIds = getLifeLogProcessedProfileIds(metadata);
  if (!processedProfileIds.includes(normalizedProfileId)) {
    processedProfileIds.push(normalizedProfileId);
  }

  return {
    ...(metadata ?? {}),
    processedProfileIds
  };
}

export function normalizeProcessedProfileIds(value: unknown): ProfileId[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const ids = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
  return Array.from(new Set(ids));
}

function normalizeLifeLogProfileId(profileId: ProfileId | undefined): ProfileId {
  return profileId?.trim() || DEFAULT_PROFILE_ID;
}

function getLifeLogMetadata(
  logOrMetadata: LifeLog | LifeLogMetadata | undefined | null
): LifeLogMetadata | undefined {
  if (!logOrMetadata) {
    return undefined;
  }

  const maybeLog = logOrMetadata as Partial<LifeLog>;
  if (typeof maybeLog.text === "string" && typeof maybeLog.sourceType === "string") {
    return maybeLog.metadata;
  }

  return logOrMetadata as LifeLogMetadata;
}
