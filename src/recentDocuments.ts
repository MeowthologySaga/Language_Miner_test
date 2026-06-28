import { DEFAULT_PROFILE_ID } from "./shared/profiles";
import type { BilingualReaderArtifact, ProfileId, RecentDocumentRecord } from "./shared/types";

const LAST_READER_ARTIFACT_KEY = "lem:lastReaderArtifact";
const RECENT_DOCUMENTS_KEY = "lem:recentDocuments";

export function readReaderArtifact(profileId: ProfileId) {
  try {
    const saved =
      localStorage.getItem(getLastReaderArtifactKey(profileId)) ??
      (profileId === DEFAULT_PROFILE_ID ? localStorage.getItem(LAST_READER_ARTIFACT_KEY) : null);
    if (!saved) {
      return null;
    }
    const artifact = JSON.parse(saved) as BilingualReaderArtifact;
    return {
      ...artifact,
      profileId: artifact.profileId ?? profileId
    };
  } catch {
    return null;
  }
}

export function readRecentDocuments(profileId: ProfileId) {
  try {
    const saved =
      localStorage.getItem(getRecentDocumentsKey(profileId)) ??
      (profileId === DEFAULT_PROFILE_ID ? localStorage.getItem(RECENT_DOCUMENTS_KEY) : null);
    if (!saved) {
      return [];
    }

    return normalizeRecentDocuments(JSON.parse(saved), profileId);
  } catch {
    return [];
  }
}

export function normalizeRecentDocuments(
  value: unknown,
  profileId: ProfileId = DEFAULT_PROFILE_ID
): RecentDocumentRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const acceptedSources = new Set<RecentDocumentRecord["source"]>([
    "reader",
    "export",
    "manual",
    "debug"
  ]);
  const records: RecentDocumentRecord[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const candidate = item as Partial<RecentDocumentRecord>;
    if (
      !candidate.filePath ||
      typeof candidate.filePath !== "string" ||
      (candidate.fileType !== "pdf" && candidate.fileType !== "html")
    ) {
      continue;
    }

    const createdAt =
      typeof candidate.createdAt === "string" && candidate.createdAt
        ? candidate.createdAt
        : new Date().toISOString();
    records.push({
      id:
        typeof candidate.id === "string" && candidate.id
          ? candidate.id
          : `${candidate.fileType}-${candidate.filePath}`,
      profileId: candidate.profileId ?? profileId,
      title:
        typeof candidate.title === "string" && candidate.title
          ? candidate.title
          : basename(candidate.filePath),
      filePath: candidate.filePath,
      fileType: candidate.fileType,
      sourceLabel:
        typeof candidate.sourceLabel === "string" && candidate.sourceLabel
          ? candidate.sourceLabel
          : "English",
      translationLabel:
        typeof candidate.translationLabel === "string" && candidate.translationLabel
          ? candidate.translationLabel
          : "Korean",
      pageCount:
        typeof candidate.pageCount === "number" && Number.isFinite(candidate.pageCount)
          ? candidate.pageCount
          : 0,
      source: candidate.source && acceptedSources.has(candidate.source) ? candidate.source : "reader",
      lastOpenedAt:
        typeof candidate.lastOpenedAt === "string" && candidate.lastOpenedAt
          ? candidate.lastOpenedAt
          : createdAt,
      createdAt
    });
  }

  return records
    .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
    .filter((record, index, list) => {
      const firstIndex = list.findIndex(
        (candidate) =>
          pathsMatch(candidate.filePath, record.filePath) && candidate.fileType === record.fileType
      );
      return firstIndex === index;
    })
    .slice(0, 50);
}

export function recentDocumentFromArtifact(
  artifact: BilingualReaderArtifact,
  source: RecentDocumentRecord["source"],
  lastOpenedAt: string,
  profileId: ProfileId
): RecentDocumentRecord {
  return {
    id: artifact.id || `${artifact.fileType}-${artifact.filePath}`,
    profileId,
    title: artifact.title || basename(artifact.filePath),
    filePath: artifact.filePath,
    fileType: artifact.fileType,
    sourceLabel: artifact.sourceLabel || "English",
    translationLabel: artifact.translationLabel || "Korean",
    pageCount: artifact.pageCount || 0,
    source,
    lastOpenedAt,
    createdAt: artifact.createdAt || lastOpenedAt
  };
}

export function getRecentDocumentsKey(profileId: ProfileId) {
  return `${RECENT_DOCUMENTS_KEY}:${profileId || DEFAULT_PROFILE_ID}`;
}

export function getLastReaderArtifactKey(profileId: ProfileId) {
  return `${LAST_READER_ARTIFACT_KEY}:${profileId || DEFAULT_PROFILE_ID}`;
}

export function pathsMatch(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function basename(filePath: string) {
  const parts = filePath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? filePath;
}
