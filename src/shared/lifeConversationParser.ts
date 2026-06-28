export type ConversationSpeakerMarker = {
  speaker: string;
  markerStart: number;
  contentStart: number;
};

const DEFAULT_KNOWN_INLINE_SPEAKERS = [
  "Me",
  "나",
  "내 말",
  "내가",
  "You",
  "User",
  "사용자",
  "Learner",
  "ChatGPT",
  "GPT",
  "Claude",
  "Assistant"
];

export function findConversationSpeakerMarkers(text: string): ConversationSpeakerMarker[] {
  const markers: ConversationSpeakerMarker[] = [];
  const lineStartPattern = /^([^:\n]{1,40}):\s*/gm;
  const knownInlinePattern = buildKnownInlineSpeakerPattern(DEFAULT_KNOWN_INLINE_SPEAKERS);
  let match: RegExpExecArray | null;

  while ((match = lineStartPattern.exec(text)) !== null) {
    const speaker = normalizeConversationSpeaker(match[1]);
    if (!isLikelyLineStartSpeaker(speaker)) {
      continue;
    }
    markers.push({
      speaker,
      markerStart: match.index,
      contentStart: match.index + match[0].length
    });
  }

  markers.push(...findRepeatedInlineSpeakerMarkers(text, markers));

  while ((match = knownInlinePattern.exec(text)) !== null) {
    markers.push({
      speaker: normalizeConversationSpeaker(match[2]),
      markerStart: match.index + match[1].length,
      contentStart: match.index + match[0].length
    });
  }

  markers.push(...findInferredLinePrefixMarkers(text, markers));

  return dedupeConversationSpeakerMarkers(markers);
}

function findRepeatedInlineSpeakerMarkers(
  text: string,
  knownMarkers: ConversationSpeakerMarker[]
) {
  const knownSpeakerNames = Array.from(
    new Set(knownMarkers.map((marker) => marker.speaker.trim()).filter(Boolean))
  );
  return [
    ...knownSpeakerNames.flatMap((speaker) => findExactInlineSpeakerMarkers(text, speaker)),
    ...findLooseRepeatedInlineSpeakerMarkers(text, knownSpeakerNames)
  ];
}

function findExactInlineSpeakerMarkers(text: string, speaker: string) {
  const pattern = new RegExp(`(^|\\s)(${escapeRegExp(speaker)}):\\s*`, "g");
  const markers: ConversationSpeakerMarker[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    markers.push({
      speaker: normalizeConversationSpeaker(match[2]),
      markerStart: match.index + match[1].length,
      contentStart: match.index + match[0].length
    });
  }

  return markers;
}

function findLooseRepeatedInlineSpeakerMarkers(text: string, knownSpeakerNames: string[]) {
  const inlinePattern = /(^|\s)([^\s:\n]{1,40}):\s*/g;
  const candidates: ConversationSpeakerMarker[] = [];
  const speakerCounts = new Map<string, number>();
  const knownSpeakers = new Set(knownSpeakerNames.map((speaker) => speaker.toLowerCase()));
  let match: RegExpExecArray | null;

  while ((match = inlinePattern.exec(text)) !== null) {
    const speaker = normalizeConversationSpeaker(match[2]);
    const markerStart = match.index + match[1].length;
    if (!isLikelyInlineSpeaker(speaker)) {
      continue;
    }
    const speakerKey = speaker.toLowerCase();
    speakerCounts.set(speakerKey, (speakerCounts.get(speakerKey) ?? 0) + 1);
    candidates.push({
      speaker,
      markerStart,
      contentStart: match.index + match[0].length
    });
  }

  return candidates.filter((candidate) => {
    const speakerKey = candidate.speaker.toLowerCase();
    if (knownSpeakers.has(speakerKey)) {
      return true;
    }

    return (
      isInlineSpeakerBoundary(text, candidate.markerStart) ||
      ((speakerCounts.get(speakerKey) ?? 0) >= 2 &&
        candidates.some((other) => isInlineSpeakerBoundary(text, other.markerStart)))
    );
  });
}

function findInferredLinePrefixMarkers(
  text: string,
  markers: ConversationSpeakerMarker[]
): ConversationSpeakerMarker[] {
  const inferred: ConversationSpeakerMarker[] = [];

  for (const marker of markers) {
    const lineStart = text.lastIndexOf("\n", Math.max(0, marker.markerStart - 1)) + 1;
    if (lineStart >= marker.markerStart) {
      continue;
    }
    if (markers.some((candidate) => candidate.markerStart === lineStart)) {
      continue;
    }

    const prefixText = text.slice(lineStart, marker.markerStart).trim();
    if (!isLikelyUnlabeledMessagePrefix(prefixText)) {
      continue;
    }

    inferred.push({
      speaker: marker.speaker,
      markerStart: lineStart,
      contentStart: lineStart
    });
  }

  return inferred;
}

function isLikelyUnlabeledMessagePrefix(value: string) {
  return Boolean(value && value.length <= 160 && !value.includes(":"));
}

function buildKnownInlineSpeakerPattern(speakers: string[]) {
  return new RegExp(`(^|\\s)(${speakers.map(escapeRegExp).join("|")}):\\s*`, "gi");
}

function normalizeConversationSpeaker(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isLikelyConversationSpeaker(value: string) {
  if (!value || value.length > 40) {
    return false;
  }
  if (!isSpeakerLikeLabel(value)) {
    return false;
  }
  if (/[.!?。！？]/.test(value)) {
    return false;
  }
  if (/^(?:https?|ftp)$/i.test(value)) {
    return false;
  }
  return !/^\d+$/.test(value);
}

function isLikelyLineStartSpeaker(value: string) {
  return isLikelyConversationSpeaker(value) && !isCommonNonSpeakerLabel(value);
}

function isLikelyInlineSpeaker(value: string) {
  return isLikelyConversationSpeaker(value) && !isCommonNonSpeakerLabel(value);
}

function isSpeakerLikeLabel(value: string) {
  const normalized = value.trim();
  if (/["'`{}[\]<>]/.test(normalized)) {
    return false;
  }
  if (/^[#*+-]/.test(normalized)) {
    return false;
  }
  return /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(normalized);
}

function isCommonNonSpeakerLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (/(?:^|\s)예를\s+들(?:어|면)$/.test(normalized)) {
    return true;
  }
  return /^(?:json|html|css|javascript|typescript|host_permissions|permissions|예|예시|예를 들어|들어|참고|주의|요약|결론|장점|단점)$/.test(
    normalized
  );
}

function isInlineSpeakerBoundary(text: string, markerStart: number) {
  const before = text.slice(0, markerStart).trimEnd();
  if (!before) {
    return true;
  }
  return /[.!?。！？]$/.test(before);
}

function dedupeConversationSpeakerMarkers(markers: ConversationSpeakerMarker[]) {
  const seen = new Set<number>();
  return markers
    .sort((left, right) => left.markerStart - right.markerStart)
    .filter((marker) => {
      if (seen.has(marker.markerStart)) {
        return false;
      }
      seen.add(marker.markerStart);
      return true;
    });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
