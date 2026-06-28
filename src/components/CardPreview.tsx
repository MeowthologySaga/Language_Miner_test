import {
  BookOpenCheck,
  Languages,
  Link2,
  ListChecks,
  MessageSquareText,
  Mic2,
  Volume2
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { HighlightedText } from "./HighlightedText";
import { getCardDeckLabel, getCardDeckShortLabel } from "../shared/cardDeck";
import {
  getLifeExpressionPreview,
  parseLifeConversationMessages,
  shouldCollapseLifeMessage,
  type LifeConversationMessage
} from "../shared/lifeCardPreview";
import { createFallbackVocabularyItem } from "../shared/browserSentenceFallbackCard";
import { getNextReviewIntervalLabel, getReviewRatingLabel } from "../shared/srs";
import { LIFE_MINER_BRIDGE_BASE_URL } from "../shared/lifeLogCapture";
import type {
  AppSettings,
  ConfusingComparisonKind,
  HighlightMapping,
  ReviewRating,
  StudyCard,
  StudyCardListeningAnnotation
} from "../shared/types";
import { playCardTts } from "../utils/cardTts";

type CardPreviewProps = {
  card: StudyCard;
  settings?: AppSettings;
  defaultShowBack?: boolean;
  reviewActions?: boolean;
  onReview?: (rating: ReviewRating) => void;
  onStartWritingPractice?: (card: StudyCard, promptIndex?: number) => void;
};

type CardYouTubePlayer = {
  getCurrentTime(): number;
  getPlayerState(): number;
  playVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
};

type CardYouTubePlayerCommand =
  | {
      source: typeof CARD_YOUTUBE_HOST_SOURCE;
      type: "load";
      videoId: string;
      startSeconds: number;
      endSeconds?: number;
      loopEnabled: boolean;
    }
  | {
      source: typeof CARD_YOUTUBE_HOST_SOURCE;
      type: "seek";
      seconds: number;
      allowSeekAhead: boolean;
    }
  | {
      source: typeof CARD_YOUTUBE_HOST_SOURCE;
      type: "play" | "destroy";
    };

type CardYouTubePlayerMessage = {
  source?: string;
  type?: string;
  state?: number;
  currentTime?: number;
};

const YOUTUBE_PLAYER_STATE_ENDED = 0;
const YOUTUBE_PLAYER_STATE_PLAYING = 1;
const CARD_YOUTUBE_HOST_SOURCE = "lem-listening-youtube-host";
const CARD_YOUTUBE_PLAYER_SOURCE = "lem-listening-youtube-player";

export function CardPreview({
  card,
  settings,
  defaultShowBack = false,
  reviewActions = false,
  onReview,
  onStartWritingPractice
}: CardPreviewProps) {
  const [showBack, setShowBack] = useState(defaultShowBack);
  const [isPlayingTts, setIsPlayingTts] = useState(false);
  const [ttsStatus, setTtsStatus] = useState("");

  useEffect(() => {
    setShowBack(defaultShowBack);
  }, [card.id, defaultShowBack]);

  async function handlePlayTts() {
    if (isPlayingTts) {
      return;
    }
    setIsPlayingTts(true);
    setTtsStatus("");
    try {
      setTtsStatus(await playCardTts(card, settings));
    } catch (caught) {
      setTtsStatus(caught instanceof Error ? caught.message : "TTS를 재생할 수 없습니다.");
    } finally {
      setIsPlayingTts(false);
    }
  }

  const cardClassName = [
    "study-card",
    card.cardType === "life_expression" ? "life-expression-card" : "",
    card.cardType === "reading" && card.deckType === "input" ? "input-reading-card" : "",
    card.cardType === "reading" && card.deckType === "input-listening"
      ? "input-listening-card"
      : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={cardClassName}>
      {card.cardType === "life_expression" ? (
        <LifeExpressionFront card={card} />
      ) : card.deckType === "input-listening" ? (
        <InputListeningCardFront card={card} />
      ) : (
        <ReadingCardFront card={card} isPlayingTts={isPlayingTts} onPlayTts={handlePlayTts} />
      )}

      <div className="card-preview-actions">
        <button
          className="button secondary"
          type="button"
          onClick={() => setShowBack((value) => !value)}
        >
          <BookOpenCheck size={18} />
          {showBack ? "카드 접기" : "답 보기"}
        </button>
      </div>

      {showBack ? (
        <section className="card-face card-back">
          <div className="card-face-label">뒷면</div>
          {card.cardType === "life_expression" ? (
            <LifeExpressionBack
              card={card}
              isPlayingTts={isPlayingTts}
              onPlayTts={handlePlayTts}
              onStartWritingPractice={onStartWritingPractice}
            />
          ) : (
            <ReadingCardBack card={card} />
          )}
          {reviewActions ? <ReviewButtons card={card} onReview={onReview} /> : null}
        </section>
      ) : null}
      {ttsStatus ? <p className="tts-status compact">{ttsStatus}</p> : null}
    </article>
  );
}

function ReadingCardFront({
  card,
  isPlayingTts,
  onPlayTts
}: {
  card: StudyCard;
  isPlayingTts: boolean;
  onPlayTts: () => void;
}) {
  return (
    <section className="card-face card-front">
      <CardFaceHeader card={card} label="앞면" />
      <p className="front-sentence">
        <HighlightedText
          text={card.frontText || card.sourceSentence}
          mappings={card.highlightMappings}
          target="source"
        />
      </p>
      <button
        className="button ghost center-button"
        disabled={isPlayingTts}
        title="문장 TTS 듣기"
        type="button"
        onClick={onPlayTts}
      >
        <Volume2 size={18} />
        {isPlayingTts ? "재생 중..." : "문장 듣기"}
      </button>
    </section>
  );
}

function ReadingCardBack({ card }: { card: StudyCard }) {
  if (card.cardType === "reading" && card.deckType === "input-listening") {
    return <InputListeningCardBack card={card} />;
  }

  if (card.cardType === "reading" && card.deckType === "input") {
    return <InputReadingCardBack card={card} />;
  }

  return (
    <>
      <div className="card-section">
        <h3>
          <Languages size={18} />
          직역
        </h3>
        <p>
          <HighlightedText
            text={card.literalTranslationKo}
            mappings={card.highlightMappings}
            target="literal"
          />
        </p>
      </div>
      <div className="card-section">
        <h3>
          <MessageSquareText size={18} />
          자연스러운 뜻
        </h3>
        <p>
          <HighlightedText
            text={card.naturalTranslationKo}
            mappings={card.highlightMappings}
            target="natural"
          />
        </p>
      </div>
      <VocabularySections card={card} />
      {card.deckType !== "input" && card.structureNote ? (
        <LifeCardSection
          icon={<ListChecks size={18} />}
          title="문장 구조"
          text={card.structureNote}
        />
      ) : null}
      <ComparisonSections card={card} />
    </>
  );
}

function InputListeningCardFront({
  card
}: {
  card: StudyCard;
}) {
  const [playbackKey, setPlaybackKey] = useState(0);
  const [audioUnavailable, setAudioUnavailable] = useState(false);
  const [playbackWarning, setPlaybackWarning] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<CardYouTubePlayer | null>(null);
  const pendingAutoplayRef = useRef(false);
  const source = getInputListeningSource(card);
  const audioClip = card.listeningMedia?.audioClip;
  const frameImage = card.listeningMedia?.frameImage;
  const hasStoredAudioClip = Boolean(audioClip?.fileUrl && !audioUnavailable);
  const hasOriginalPlayback = hasStoredAudioClip || Boolean(source);

  useEffect(() => {
    setPlaybackKey(0);
    setAudioUnavailable(false);
    setPlaybackWarning("");
    pendingAutoplayRef.current = false;
  }, [audioClip?.fileUrl, card.id]);

  useEffect(() => {
    playerRef.current = null;
    if (!source || !iframeRef.current) {
      return;
    }

    let cancelled = false;
    let player: CardYouTubePlayer | null = null;

    player = createCardYouTubePlayerBridge(iframeRef.current, source, () => {
      if (cancelled || !player) {
        return;
      }
      playerRef.current = player;
      if (pendingAutoplayRef.current) {
        pendingAutoplayRef.current = false;
        player.seekTo(source.start, true);
        player.playVideo();
      }
    });
    playerRef.current = player;

    return () => {
      cancelled = true;
      if (playerRef.current === player) {
        playerRef.current = null;
      }
      try {
        player?.destroy();
      } catch {
        // The local player iframe may already be gone during React remounts.
      }
    };
  }, [card.id, playbackKey, source?.end, source?.start, source?.videoId]);

  function playOriginalSegment() {
    if (hasStoredAudioClip && audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => {
        setAudioUnavailable(true);
        setPlaybackWarning("저장된 원본 오디오를 재생할 수 없습니다.");
      });
      return;
    }

    if (!source) {
      setPlaybackWarning(
        "이 리스닝 카드에는 원본 오디오가 없습니다. 영상 리더에서 다시 저장하면 원본 구간이 붙습니다."
      );
      return;
    }

    pendingAutoplayRef.current = true;
    const player = playerRef.current;
    if (player) {
      try {
        player.seekTo(source.start, true);
        player.playVideo();
        pendingAutoplayRef.current = false;
        return;
      } catch {
        playerRef.current = null;
      }
    }
    setPlaybackKey((value) => value + 1);
  }

  return (
    <section className="card-face card-front input-listening-front">
      <CardFaceHeader card={card} label="앞면" />
      {hasStoredAudioClip && audioClip ? (
        <div className="input-listening-audio-card">
          {frameImage ? (
            <img
              alt="리스닝 카드 장면"
              className="input-listening-frame-image"
              src={frameImage.fileUrl}
            />
          ) : null}
          <div className="input-listening-audio-panel">
            <Volume2 size={24} />
            <div>
              <strong>원본 오디오</strong>
              <span>{formatListeningRange(audioClip.start, audioClip.end)}</span>
            </div>
          </div>
          <audio
            className="input-listening-audio-control"
            controls
            onError={() => setAudioUnavailable(true)}
            preload="metadata"
            ref={audioRef}
            src={audioClip.fileUrl}
          />
        </div>
      ) : source ? (
        <div className="input-listening-video-card">
          <iframe
            key={`${card.id}-${playbackKey}`}
            ref={iframeRef}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="input-listening-embed"
            src={buildInputListeningPlayerUrl(source)}
            title="원본 구간 재생"
          />
          <div className="input-listening-video-meta">
            <span>원본 구간</span>
            <strong>{formatListeningRange(source.start, source.end)}</strong>
          </div>
        </div>
      ) : (
        <div className="input-listening-audio-panel">
          <Volume2 size={24} />
          <div>
            <strong>원본 구간</strong>
            <span>저장된 원본 오디오 없음</span>
          </div>
        </div>
      )}
      {audioClip && audioUnavailable ? (
        <div className="input-listening-media-warning">
          저장된 원본 오디오 파일을 찾지 못했습니다.
        </div>
      ) : null}
      {!hasOriginalPlayback || playbackWarning ? (
        <div className="input-listening-media-warning">
          {playbackWarning ||
            "이 리스닝 카드에는 재생할 원본 오디오가 없습니다. TTS 대신 원본 구간을 저장하려면 영상 리더에서 다시 저장하세요."}
        </div>
      ) : null}
      <button
        className="button ghost center-button"
        disabled={!hasOriginalPlayback}
        title={hasOriginalPlayback ? "원본 구간 듣기" : "저장된 원본 오디오 없음"}
        type="button"
        onClick={playOriginalSegment}
      >
        <Volume2 size={18} />
        {hasOriginalPlayback ? "구간 다시 듣기" : "원본 오디오 없음"}
      </button>
    </section>
  );
}

function InputListeningCardBack({ card }: { card: StudyCard }) {
  const annotations = getInputListeningAnnotations(card);
  const meaningText = card.naturalTranslationKo || card.literalTranslationKo || "";
  const translationMappings = getInputListeningTranslationHighlightMappings(card, meaningText);

  return (
    <>
      <div className="card-section input-listening-source-section">
        <h3>
          <Mic2 size={18} />
          문장
        </h3>
        <p className="listening-prosody-line">
          <AnnotatedListeningText
            text={card.sourceSentence || card.frontText}
            mappings={card.highlightMappings}
            annotations={annotations}
          />
        </p>
      </div>
      <div className="card-section input-listening-meaning-section">
        <h3>
          <MessageSquareText size={18} />
          뜻
        </h3>
        <p>
          <HighlightedText
            text={meaningText}
            mappings={translationMappings}
            target="natural"
          />
        </p>
      </div>
      <ListeningSoundPointsSection annotations={annotations} />
      <VocabularySections card={card} />
      <ComparisonSections card={card} />
      {card.structureNote ? (
        <LifeCardSection icon={<ListChecks size={18} />} title="출처" text={card.structureNote} />
      ) : null}
      {annotations.length ? (
        <p className="listening-ai-note listening-ai-note-footer">
          AI로 만들어진 강세/억양 표시는 정확하지 않을 수 있습니다.
        </p>
      ) : null}
    </>
  );
}

type AnnotatedListeningTextMatch = {
  start: number;
  end: number;
  colorKey?: HighlightMapping["colorKey"];
  annotation?: StudyCardListeningAnnotation;
};

function AnnotatedListeningText({
  text = "",
  mappings,
  annotations
}: {
  text?: string;
  mappings: HighlightMapping[];
  annotations: StudyCardListeningAnnotation[];
}) {
  const matches = findAnnotatedListeningTextMatches(text, mappings, annotations);
  if (!matches.length) {
    return <span>{text}</span>;
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  matches.forEach((match, index) => {
    if (match.start > cursor) {
      parts.push(text.slice(cursor, match.start));
    }
    const value = text.slice(match.start, match.end);
    const markClass = match.annotation ? ` listening-mark-${match.annotation.mark}` : "";
    const title = match.annotation?.label || value;
    const className = [
      match.colorKey ? `highlight highlight-${match.colorKey}` : "",
      "listening-prosody-token",
      markClass.trim()
    ]
      .filter(Boolean)
      .join(" ");
    const content = match.colorKey ? (
      <mark className={className} key={`${match.start}-${match.end}-${index}`} title={title}>
        {value}
      </mark>
    ) : (
      <span className={className} key={`${match.start}-${match.end}-${index}`} title={title}>
        {value}
      </span>
    );
    parts.push(content);
    cursor = match.end;
  });

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return <span>{parts}</span>;
}

function ListeningSoundPointsSection({
  annotations
}: {
  annotations: StudyCardListeningAnnotation[];
}) {
  const points = annotations
    .map((annotation) => annotation.label?.trim())
    .filter((label): label is string => Boolean(label))
    .slice(0, 3);
  const legendItems = getListeningProsodyLegendItems(annotations);
  if (!points.length && !legendItems.length) {
    return null;
  }
  return (
    <div className="card-section input-listening-sound-points">
      <h3>
        <Mic2 size={18} />
        소리 포인트
      </h3>
      {legendItems.length ? (
        <div className="listening-prosody-legend" aria-label="강세와 억양 표시 설명">
          {legendItems.map((item) => (
            <span className="listening-prosody-legend-item" key={item.mark}>
              <strong>{item.symbol}</strong>
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
      {points.length ? (
        <ul>
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function getListeningProsodyLegendItems(annotations: StudyCardListeningAnnotation[]) {
  const usedMarks = new Set(annotations.map((annotation) => annotation.mark));
  return listeningProsodyLegendItems.filter((item) => usedMarks.has(item.mark));
}

const listeningProsodyLegendItems: Array<{
  mark: StudyCardListeningAnnotation["mark"];
  symbol: string;
  label: string;
}> = [
  { mark: "stress-dot", symbol: "•", label: "강세" },
  { mark: "strong-stress-dot", symbol: "••", label: "강한 강세" },
  { mark: "rising-curve", symbol: "↗", label: "상승 억양" },
  { mark: "falling-curve", symbol: "↘", label: "하강 억양" },
  { mark: "continuing-curve", symbol: "⌒", label: "이어지는 억양" },
  { mark: "linking-bridge", symbol: "⌒", label: "연결 발음" },
  { mark: "reduced", symbol: "·", label: "약하게 줄어드는 발음" }
];

function getInputListeningAnnotations(card: StudyCard): StudyCardListeningAnnotation[] {
  if (card.listeningAnnotations?.length) {
    return card.listeningAnnotations
      .filter((annotation) => annotation.anchorText.trim())
      .slice(0, 5);
  }
  return card.highlightMappings.slice(0, 5).map((mapping) => {
    const mark = inferDisplayListeningProsodyMark(mapping.sourceText);
    return {
      anchorText: mapping.sourceText,
      mark,
      label: getDisplayListeningProsodyLabel(mapping.sourceText, mark),
      confidence: 0.6
    };
  });
}

function getInputListeningTranslationHighlightMappings(
  card: StudyCard,
  meaningText: string
): HighlightMapping[] {
  return card.highlightMappings.map((mapping) => {
    const anchor =
      findMeaningHighlightAnchor(meaningText, mapping.naturalKo) ||
      findMeaningHighlightAnchor(meaningText, mapping.literalKo) ||
      findMeaningHighlightAnchorFromSource(meaningText, mapping.sourceText);
    return {
      ...mapping,
      literalKo: anchor || mapping.literalKo || mapping.naturalKo,
      naturalKo: anchor || mapping.naturalKo || mapping.literalKo
    };
  });
}

function findMeaningHighlightAnchor(meaningText: string, candidate?: string) {
  const normalized = candidate?.trim();
  if (!normalized) {
    return undefined;
  }
  if (meaningText.includes(normalized)) {
    return normalized;
  }
  for (const anchor of getKoreanHighlightAnchorCandidates(normalized)) {
    if (meaningText.includes(anchor)) {
      return anchor;
    }
  }
  return undefined;
}

function getKoreanHighlightAnchorCandidates(value: string) {
  const candidates: string[] = [];
  const tokens = value
    .replace(/[()[\]{}"'“”‘’.,!?;:·•]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const cleaned = token.replace(/[^\p{Script=Hangul}]/gu, "");
    if (cleaned.length < 2) {
      continue;
    }
    const stems = [
      cleaned.replace(/들$/u, ""),
      cleaned.replace(/(은|는|이|가|을|를|에|에서|으로|로|와|과|도|만|부터|까지|보다|처럼)$/u, ""),
      cleaned
        .replace(/들$/u, "")
        .replace(/(은|는|이|가|을|를|에|에서|으로|로|와|과|도|만|부터|까지|보다|처럼)$/u, "")
    ];
    stems
      .map((stem) => stem.trim())
      .filter((stem) => stem.length >= 2)
      .forEach((stem) => candidates.push(stem));
  }

  return Array.from(new Set(candidates)).sort((left, right) => right.length - left.length);
}

function findMeaningHighlightAnchorFromSource(meaningText: string, sourceText: string) {
  const normalized = normalizeListeningAnchor(sourceText);
  for (const candidate of getSourceMeaningAnchorCandidates(normalized)) {
    if (meaningText.includes(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function getSourceMeaningAnchorCandidates(sourceText: string) {
  const candidates: string[] = [];
  const add = (...values: string[]) => values.forEach((value) => candidates.push(value));

  if (/big|important|major|key/.test(sourceText) && /moments?/.test(sourceText)) {
    add("중요한 순간", "큰 순간");
  }
  if (/first/.test(sourceText) && /(things?|moments?|time)/.test(sourceText)) {
    add("처음의 순간", "처음");
  }
  if (/moments?/.test(sourceText)) {
    add("순간");
  }
  if (/\bsecond\b|\bminute\b/.test(sourceText)) {
    add("잠시", "잠깐", "시간");
  }
  if (/figure.*out|work.*out/.test(sourceText)) {
    add("파악", "알아내", "이해");
  }
  if (/head.*out|leave|go out/.test(sourceText)) {
    add("출발", "나가");
  }
  if (/packed|crowded/.test(sourceText)) {
    add("붐비", "꽉 찬");
  }
  if (/slipped?.*mind|forgot|forget/.test(sourceText)) {
    add("깜빡", "잊");
  }
  if (/walk.*through|explain|guide/.test(sourceText)) {
    add("설명", "안내");
  }
  if (/step.*by.*step/.test(sourceText)) {
    add("단계별", "차근차근");
  }
  if (/go.*over|received|landed/.test(sourceText)) {
    add("받아들여", "반응");
  }
  if (/date/.test(sourceText)) {
    add("데이트");
  }
  if (/thing/.test(sourceText)) {
    add("일", "것", "경험");
  }

  return Array.from(new Set(candidates)).sort((left, right) => right.length - left.length);
}

function findAnnotatedListeningTextMatches(
  text: string,
  mappings: HighlightMapping[],
  annotations: StudyCardListeningAnnotation[]
): AnnotatedListeningTextMatch[] {
  const annotationsByAnchor = new Map(
    annotations.map((annotation) => [
      normalizeListeningAnchor(annotation.anchorText),
      annotation
    ])
  );
  const matches: AnnotatedListeningTextMatch[] = [];
  for (const mapping of mappings) {
    const sourceText = mapping.sourceText.trim();
    if (!sourceText) {
      continue;
    }
    const annotation = annotationsByAnchor.get(normalizeListeningAnchor(sourceText));
    matches.push(
      ...findListeningAnchorRanges(text, sourceText).map((range) => ({
        ...range,
        colorKey: mapping.colorKey,
        annotation
      }))
    );
  }

  for (const annotation of annotations) {
    const alreadyCovered = matches.some(
      (match) => normalizeListeningAnchor(text.slice(match.start, match.end)) ===
        normalizeListeningAnchor(annotation.anchorText)
    );
    if (alreadyCovered) {
      continue;
    }
    matches.push(
      ...findListeningAnchorRanges(text, annotation.anchorText).map((range) => ({
        ...range,
        annotation
      }))
    );
  }

  return matches
    .sort((left, right) => left.start - right.start || right.end - right.start - (left.end - left.start))
    .reduce<AnnotatedListeningTextMatch[]>((accepted, match) => {
      const overlaps = accepted.some(
        (existing) => match.start < existing.end && match.end > existing.start
      );
      return overlaps ? accepted : [...accepted, match];
    }, []);
}

function findListeningAnchorRanges(text: string, anchorText: string) {
  const escaped = escapeRegExp(anchorText.trim());
  if (!escaped) {
    return [];
  }
  const regex = new RegExp(escaped, "gi");
  const ranges: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length
    });
    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }
  return ranges;
}

function inferDisplayListeningProsodyMark(
  sourceText: string
): StudyCardListeningAnnotation["mark"] {
  const normalized = normalizeListeningAnchor(sourceText);
  const words = normalized.split(/\s+/).filter(Boolean);
  if (/[’']/.test(sourceText) || words.length >= 2) {
    return "linking-bridge";
  }
  if (/^(a|an|the|to|for|of|and|or|in|on|at|is|are|was|were|be|been)$/.test(normalized)) {
    return "reduced";
  }
  if (normalized.length >= 7) {
    return "strong-stress-dot";
  }
  return "stress-dot";
}

function getDisplayListeningProsodyLabel(
  sourceText: string,
  mark: StudyCardListeningAnnotation["mark"]
) {
  if (mark === "linking-bridge") {
    return `${sourceText}: 붙어 들림`;
  }
  if (mark === "reduced") {
    return `${sourceText}: 약하게 지나감`;
  }
  if (mark === "strong-stress-dot") {
    return `${sourceText}: 강하게 들리는 핵심어`;
  }
  return `${sourceText}: 강세 후보`;
}

function normalizeListeningAnchor(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function InputReadingCardBack({ card }: { card: StudyCard }) {
  const translationMappings = getInputTranslationHighlightMappings(card);

  return (
    <>
      <div className="input-translation-grid">
        <section className="input-translation-card input-translation-literal">
          <h3>
            <Languages size={18} />
            직역
          </h3>
          <p>
            <HighlightedText
              text={card.literalTranslationKo}
              mappings={translationMappings}
              target="literal"
            />
          </p>
        </section>
        <section className="input-translation-card input-translation-natural">
          <h3>
            <MessageSquareText size={18} />
            자연스러운 뜻
          </h3>
          <p>
            <HighlightedText
              text={card.naturalTranslationKo}
              mappings={translationMappings}
              target="natural"
            />
          </p>
        </section>
      </div>
      <VocabularySections card={card} />
      <ComparisonSections card={card} />
      {card.structureNote ? (
        <LifeCardSection icon={<Link2 size={18} />} title="출처" text={card.structureNote} />
      ) : null}
    </>
  );
}

function LifeExpressionFront({ card }: { card: StudyCard }) {
  const preview = getLifeExpressionPreview(card);

  return (
    <section className="card-face card-front">
      <CardFaceHeader card={card} label="앞면" />
      <div className="life-conversation-preview">
        {preview.summary ? (
          <div className="life-context-summary">
            <span>맥락</span>
            <p>{preview.summary}</p>
          </div>
        ) : null}
        {preview.messages.length ? <LifeConversationThread messages={preview.messages} /> : null}
        <div className="life-target-reply">
          <span>영작할 말</span>
          <p>{preview.targetText}</p>
        </div>
      </div>
    </section>
  );
}

function LifeExpressionBack({
  card,
  isPlayingTts,
  onPlayTts,
  onStartWritingPractice
}: {
  card: StudyCard;
  isPlayingTts: boolean;
  onPlayTts: () => void;
  onStartWritingPractice?: (card: StudyCard, promptIndex?: number) => void;
}) {
  const englishConversation = stripSectionHeading(card.literalTranslationKo, "영어 대화");
  const variants = stripSectionHeading(card.naturalTranslationKo, "내 답변 변형");
  const englishMessages = parseLifeConversationMessages(englishConversation);

  return (
    <>
      <button
        className="button ghost center-button"
        disabled={isPlayingTts}
        title="영어 답변 TTS 듣기"
        type="button"
        onClick={onPlayTts}
      >
        <Volume2 size={18} />
        {isPlayingTts ? "재생 중..." : "영어 듣기"}
      </button>
      <LifeDialogueSection
        icon={<Languages size={18} />}
        title="영어 대화"
        messages={englishMessages}
        fallbackText={englishConversation}
      />
      <LifeCardSection
        icon={<MessageSquareText size={18} />}
        title="내 답변 변형"
        text={variants}
      />
      {card.structureNote ? (
        <LifeCardSection
          icon={<ListChecks size={18} />}
          title="학습 포인트"
          text={card.structureNote}
        />
      ) : null}
      <VocabularySections card={card} />
      <ComparisonSections card={card} />
      {card.pumpPrompts?.length ? (
        <PumpActions card={card} onStartWritingPractice={onStartWritingPractice} />
      ) : null}
    </>
  );
}

function LifeConversationThread({ messages }: { messages: LifeConversationMessage[] }) {
  const [expandedIndexes, setExpandedIndexes] = useState<Set<number>>(() => new Set());

  function toggleExpanded(index: number) {
    setExpandedIndexes((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  return (
    <div className="life-chat-thread">
      {messages.map((message, index) => {
        const isCollapsible = shouldCollapseLifeMessage(message);
        const isExpanded = expandedIndexes.has(index);
        const shouldClamp = isCollapsible && !isExpanded;
        return (
          <div
            className={`life-chat-row life-chat-row-${message.role}`}
            key={`${message.speaker}-${message.text.slice(0, 32)}-${index}`}
          >
            {message.role === "other" ? (
              <span className="life-chat-avatar" title={message.speaker}>
                {getSpeakerInitials(message.speaker)}
              </span>
            ) : null}
            <div className={`life-chat-bubble life-chat-bubble-${message.role}`}>
              <span className="life-chat-speaker">{message.speaker}</span>
              <p className={shouldClamp ? "life-chat-text is-clamped" : "life-chat-text"}>
                {message.text}
              </p>
              {isCollapsible ? (
                <button
                  className="life-chat-read-more"
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => toggleExpanded(index)}
                >
                  {isExpanded ? "접기" : "전체보기"}
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LifeDialogueSection({
  icon,
  title,
  messages,
  fallbackText
}: {
  icon: ReactNode;
  title: string;
  messages: LifeConversationMessage[];
  fallbackText?: string;
}) {
  if (!messages.length && !fallbackText?.trim()) {
    return null;
  }

  return (
    <div className="card-section life-card-section life-dialogue-section">
      <h3>
        {icon}
        {title}
      </h3>
      {messages.length ? (
        <LifeConversationThread messages={messages} />
      ) : (
        fallbackText?.split("\n").map((line, index) => (
          <p className={line.trim() ? undefined : "compact"} key={`${line}-${index}`}>
            {line}
          </p>
        ))
      )}
    </div>
  );
}

function getSpeakerInitials(value: string) {
  const normalized = normalizeSpeaker(value);
  if (!normalized) {
    return "?";
  }
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return normalized.slice(0, 2).toUpperCase();
}

function normalizeSpeaker(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function CardFaceHeader({ card, label }: { card: StudyCard; label: string }) {
  return (
    <div className="card-face-header">
      <div className="card-face-label">{label}</div>
      <span className={`deck-pill deck-${card.deckType}`} title={getCardDeckLabel(card)}>
        {getCardDeckShortLabel(card)}
      </span>
    </div>
  );
}

function LifeCardSection({
  icon,
  title,
  text
}: {
  icon: ReactNode;
  title: string;
  text?: string;
}) {
  if (!text?.trim()) {
    return null;
  }

  return (
    <div className="card-section life-card-section">
      <h3>
        {icon}
        {title}
      </h3>
      {text.split("\n").map((line, index) => (
        <p className={line.trim() ? undefined : "compact"} key={`${line}-${index}`}>
          {line}
        </p>
      ))}
    </div>
  );
}

function VocabularySections({ card }: { card: StudyCard }) {
  if (card.vocabularyItems.length === 0) {
    return null;
  }

  if (card.cardType === "reading" && card.deckType === "input") {
    return <InputVocabularySections card={card} />;
  }

  return (
    <>
      <div className="legend-row">
        {card.vocabularyItems.map((item) => (
          <span key={item.term} className={`legend-item legend-${item.colorKey}`}>
            <span aria-hidden="true" className="legend-swatch" />
            {item.term} = {item.basicMeaningKo}
          </span>
        ))}
      </div>
      <div className="vocab-grid">
        {card.vocabularyItems.map((item) => (
          <section className="vocab-item" key={item.term}>
            <h4 className={`vocab-title text-${item.colorKey}`}>{item.term}</h4>
            <p className="muted compact">
              {item.ipa ? `${item.ipa} · ` : ""}
              {item.partOfSpeech}
            </p>
            <p>{item.basicMeaningKo}</p>
            {item.meaningInContextKo ? (
              <p className="muted">{item.meaningInContextKo}</p>
            ) : null}
            {item.examples.length ? (
              <ul>
                {item.examples.map((example) => (
                  <li key={example}>{example}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </>
  );
}

function InputVocabularySections({ card }: { card: StudyCard }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const items = getInputDisplayVocabularyItems(card);
  const safeSelectedIndex = Math.min(selectedIndex, items.length - 1);
  const selectedItem = items[safeSelectedIndex] ?? items[0];

  if (items.length === 1) {
    return (
      <div className="input-vocab-section input-vocab-section-single">
        <VocabularyDetailCard item={items[0]} badge="표현 1개" />
      </div>
    );
  }

  if (items.length === 2) {
    return (
      <div className="input-vocab-section input-vocab-grid-two">
        {items.map((item) => (
          <VocabularyDetailCard item={item} key={item.term} />
        ))}
      </div>
    );
  }

  return (
    <div className="input-vocab-section input-vocab-master-detail">
      <div className="input-vocab-list" aria-label="표현 목록">
        {items.map((item, index) => (
          <button
            className={`input-vocab-list-item ${index === safeSelectedIndex ? "active" : ""}`}
            key={`${item.term}-${index}`}
            type="button"
            onClick={() => setSelectedIndex(index)}
          >
            <strong>{item.term}</strong>
            <span>{item.basicMeaningKo}</span>
          </button>
        ))}
      </div>
      <VocabularyDetailCard item={selectedItem} badge="선택 상세" />
    </div>
  );
}

function getInputTranslationHighlightMappings(card: StudyCard): HighlightMapping[] {
  const mappingsBySource = new Map<string, HighlightMapping>();

  for (const mapping of card.highlightMappings) {
    const key = normalizeHighlightSourceKey(mapping.sourceText);
    if (!key) {
      continue;
    }
    mappingsBySource.set(key, {
      ...mapping,
      sourceText: mapping.sourceText.trim()
    });
  }

  for (const item of getInputDisplayVocabularyItems(card)) {
    const key = normalizeHighlightSourceKey(item.term);
    if (!key) {
      continue;
    }
    const existing = mappingsBySource.get(key);
    const next: HighlightMapping = {
      sourceText: existing?.sourceText || item.term,
      literalKo: existing?.literalKo || item.basicMeaningKo || item.meaningInContextKo,
      naturalKo: existing?.naturalKo || item.meaningInContextKo || item.basicMeaningKo,
      colorKey: existing?.colorKey || item.colorKey
    };
    mappingsBySource.set(key, next);
  }

  return Array.from(mappingsBySource.values());
}

function getInputDisplayVocabularyItems(card: StudyCard) {
  return card.vocabularyItems.map((item) => completeInputVocabularyItem(item, card));
}

type InputListeningSource = {
  videoId: string;
  start: number;
  end?: number;
};

function getInputListeningSource(card: StudyCard): InputListeningSource | null {
  const targetMatch = /^listening:([^:]+):/.exec(card.targetText ?? "");
  const videoId = targetMatch?.[1];
  if (!videoId) {
    return null;
  }

  const range = parseListeningRange(card.structureNote ?? "");
  return {
    videoId,
    start: range?.start ?? 0,
    end: range?.end
  };
}

function parseListeningRange(value: string) {
  const match = /(\d+):(\d{2})\s*-\s*(\d+):(\d{2})/.exec(value);
  if (!match) {
    return null;
  }

  return {
    start: Number(match[1]) * 60 + Number(match[2]),
    end: Number(match[3]) * 60 + Number(match[4])
  };
}

function buildInputListeningPlayerUrl(source: InputListeningSource) {
  const url = new URL("/listening-youtube-player", LIFE_MINER_BRIDGE_BASE_URL);
  url.searchParams.set("videoId", source.videoId);
  url.searchParams.set("start", String(Math.max(0, Math.floor(source.start))));
  if (typeof source.end === "number" && source.end > source.start) {
    url.searchParams.set("end", String(Math.max(0, Math.ceil(source.end))));
    url.searchParams.set("loop", "1");
  } else {
    url.searchParams.set("loop", "0");
  }
  url.searchParams.set("controls", "1");
  return url.toString();
}

function createCardYouTubePlayerBridge(
  frame: HTMLIFrameElement,
  source: InputListeningSource,
  onReady: () => void
): CardYouTubePlayer {
  let isReady = false;
  let destroyed = false;
  let currentTime = source.start;
  let playerState = 0;
  const playerOrigin = new URL(LIFE_MINER_BRIDGE_BASE_URL).origin;
  const pendingCommands: CardYouTubePlayerCommand[] = [];

  function postCommand(command: CardYouTubePlayerCommand) {
    if (destroyed) {
      return;
    }
    if (!isReady || !frame.contentWindow) {
      pendingCommands.push(command);
      return;
    }
    frame.contentWindow.postMessage(command, playerOrigin);
  }

  function flushPendingCommands() {
    const commands = pendingCommands.splice(0);
    for (const command of commands) {
      frame.contentWindow?.postMessage(command, playerOrigin);
    }
  }

  function handleMessage(event: MessageEvent<CardYouTubePlayerMessage>) {
    if (event.origin !== playerOrigin || event.data?.source !== CARD_YOUTUBE_PLAYER_SOURCE) {
      return;
    }
    if (destroyed) {
      return;
    }

    if (event.data.type === "ready") {
      isReady = true;
      onReady();
      flushPendingCommands();
      return;
    }

    if (event.data.type === "time" && typeof event.data.currentTime === "number") {
      currentTime = event.data.currentTime;
      return;
    }

    if (event.data.type === "state" && typeof event.data.state === "number") {
      playerState = event.data.state;
    }
  }

  window.addEventListener("message", handleMessage);
  frame.src = buildInputListeningPlayerUrl(source);

  return {
    getCurrentTime() {
      return currentTime;
    },
    getPlayerState() {
      return playerState;
    },
    playVideo() {
      postCommand({ source: CARD_YOUTUBE_HOST_SOURCE, type: "play" });
    },
    seekTo(seconds, allowSeekAhead) {
      currentTime = seconds;
      postCommand({
        source: CARD_YOUTUBE_HOST_SOURCE,
        type: "seek",
        seconds,
        allowSeekAhead
      });
    },
    destroy() {
      destroyed = true;
      window.removeEventListener("message", handleMessage);
      try {
        frame.contentWindow?.postMessage(
          { source: CARD_YOUTUBE_HOST_SOURCE, type: "destroy" },
          playerOrigin
        );
      } catch {
        // The iframe may already be gone during Electron shutdown.
      }
      frame.removeAttribute("src");
    }
  };
}

function formatListeningRange(start: number, end?: number) {
  if (typeof end === "number" && end > start) {
    return `${formatListeningTime(start)} - ${formatListeningTime(end)}`;
  }
  return `${formatListeningTime(start)}부터`;
}

function formatListeningTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function normalizeHighlightSourceKey(value: string) {
  return value.trim().toLowerCase();
}

function VocabularyDetailCard({ item, badge }: { item: StudyCard["vocabularyItems"][number]; badge?: string }) {
  return (
    <section className={`input-vocab-detail-card border-${item.colorKey}`}>
      <div className="input-vocab-detail-header">
        <div>
          <h4 className={`input-vocab-term text-${item.colorKey}`}>{item.term}</h4>
          {item.ipa || item.partOfSpeech ? (
            <p className="muted compact">
              {item.ipa ? `${item.ipa} · ` : ""}
              {item.partOfSpeech}
            </p>
          ) : null}
        </div>
        {badge ? <span className="input-vocab-badge">{badge}</span> : null}
      </div>

      <div className="input-vocab-meaning-grid">
        <div className="input-vocab-meaning-card">
          <span>기본 뜻</span>
          <p>{item.basicMeaningKo}</p>
        </div>
        {item.meaningInContextKo ? (
          <div className="input-vocab-meaning-card">
            <span>문맥 뜻</span>
            <p>{item.meaningInContextKo}</p>
          </div>
        ) : null}
      </div>

      {item.etymologyKo ? (
        <VocabularyDetailSubsection title="어원 / 구조">
          <p>{item.etymologyKo}</p>
        </VocabularyDetailSubsection>
      ) : null}

      {item.usagePatterns?.length ? (
        <VocabularyDetailSubsection title="표현 패턴 / Collocation">
          <div className="input-vocab-patterns">
            {item.usagePatterns.map((pattern) => (
              <code key={pattern}>{pattern}</code>
            ))}
          </div>
        </VocabularyDetailSubsection>
      ) : null}

      {item.examples.length ? (
        <VocabularyDetailSubsection title="예문">
          <ul>
            {item.examples.map((example) => (
              <li key={example}>{example}</li>
            ))}
          </ul>
        </VocabularyDetailSubsection>
      ) : null}
    </section>
  );
}

function VocabularyDetailSubsection({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="input-vocab-subsection">
      <h5>{title}</h5>
      {children}
    </div>
  );
}

function completeInputVocabularyItem(
  item: StudyCard["vocabularyItems"][number],
  card: StudyCard
): StudyCard["vocabularyItems"][number] {
  const fallback = createFallbackVocabularyItem(
    item.term,
    card.sourceSentence || card.frontText,
    item.colorKey
  );
  return {
    ...item,
    basicMeaningKo: isPlaceholderMeaning(item.basicMeaningKo)
      ? fallback.basicMeaningKo
      : item.basicMeaningKo,
    meaningInContextKo: isPlaceholderContext(item.meaningInContextKo, card)
      ? fallback.meaningInContextKo
      : item.meaningInContextKo,
    etymologyKo: item.etymologyKo?.trim() || fallback.etymologyKo,
    usagePatterns: mergeUsagePatterns(item.usagePatterns, fallback.usagePatterns),
    examples: mergeDisplayExamples(item.examples, fallback.examples, card)
  };
}

function isPlaceholderMeaning(value?: string) {
  const normalized = normalizeDisplayText(value);
  return !normalized || normalized === "선택 표현";
}

function isPlaceholderContext(value: string | undefined, card: StudyCard) {
  const normalized = normalizeDisplayText(value);
  if (!normalized) {
    return true;
  }
  return [
    card.sourceSentence,
    card.frontText,
    card.literalTranslationKo,
    card.naturalTranslationKo,
    card.targetText
  ]
    .map(normalizeDisplayText)
    .filter(Boolean)
    .includes(normalized);
}

function mergeDisplayExamples(
  examples: string[] | undefined,
  fallbackExamples: string[],
  card: StudyCard
) {
  const sourceFingerprints = new Set(
    [card.sourceSentence, card.frontText].map(normalizeDisplayFingerprint).filter(Boolean)
  );
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of [...(examples ?? []), ...fallbackExamples]) {
    const normalized = String(value ?? "").trim();
    const fingerprint = normalizeDisplayFingerprint(normalized);
    if (!normalized || sourceFingerprints.has(fingerprint) || seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    result.push(normalized);
    if (result.length >= 3) {
      break;
    }
  }
  return result;
}

function mergeDisplayStrings(
  values: string[] | undefined,
  fallbackValues: string[] | undefined,
  limit: number
) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of [...(values ?? []), ...(fallbackValues ?? [])]) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function mergeUsagePatterns(values: string[] | undefined, fallbackValues: string[] | undefined) {
  const merged = mergeDisplayStrings(values, fallbackValues, 8);
  const collocation = merged.find((value) => /collocation/i.test(value));
  const ordered = collocation
    ? [collocation, ...merged.filter((value) => value !== collocation)]
    : merged;
  return ordered.slice(0, 4);
}

function normalizeDisplayText(value?: string) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDisplayFingerprint(value?: string) {
  return normalizeDisplayText(value).toLowerCase();
}

function ComparisonSections({ card }: { card: StudyCard }) {
  const comparisons = card.confusingComparisons ?? [];
  if (!comparisons.length) {
    return null;
  }

  if (card.cardType === "reading" && card.deckType === "input") {
    return (
      <section className="input-comparison-section">
        <div className="input-section-header">
          <h3>비슷한 표현 비교</h3>
          <span>{comparisons.length}개</span>
        </div>
        <div className="comparison-list input-comparison-list">
          {comparisons.map((comparison) => (
            <div className="comparison-item" key={comparison.title}>
              <div className="comparison-title-row">
                {comparison.kind ? (
                  <span className={`comparison-kind-badge kind-${comparison.kind}`}>
                    {getComparisonKindLabel(comparison.kind)}
                  </span>
                ) : null}
                <strong>{comparison.title}</strong>
              </div>
              <p>{comparison.explanationKo}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="comparison-list">
      {comparisons.map((comparison) => (
        <div className="comparison-item" key={comparison.title}>
          <div className="comparison-title-row">
            {comparison.kind ? (
              <span className={`comparison-kind-badge kind-${comparison.kind}`}>
                {getComparisonKindLabel(comparison.kind)}
              </span>
            ) : null}
            <strong>{comparison.title}</strong>
          </div>
          <p>{comparison.explanationKo}</p>
        </div>
      ))}
    </div>
  );
}

function getComparisonKindLabel(kind: ConfusingComparisonKind) {
  switch (kind) {
    case "similar":
      return "유사";
    case "contrast":
      return "대조";
    case "nuance":
      return "뉘앙스";
    case "collocation":
      return "결합";
    default:
      return "비교";
  }
}

function PumpActions({
  card,
  onStartWritingPractice
}: {
  card: StudyCard;
  onStartWritingPractice?: (card: StudyCard, promptIndex?: number) => void;
}) {
  return (
    <div className="pump-actions">
      {card.pumpPrompts?.map((prompt, index) => (
        <button
          className="button ghost"
          disabled={!onStartWritingPractice}
          key={`${prompt.type}-${prompt.promptKo}-${index}`}
          title={
            onStartWritingPractice
              ? "이 카드로 영작 훈련 시작"
              : "카드 목록 또는 복습 화면에서 사용할 수 있습니다"
          }
          type="button"
          onClick={() => onStartWritingPractice?.(card, index)}
        >
          <Mic2 size={17} />
          {getPumpPromptLabel(prompt.type)}
        </button>
      ))}
    </div>
  );
}

function getPumpPromptLabel(type: NonNullable<StudyCard["pumpPrompts"]>[number]["type"]) {
  if (type === "ko_to_en") {
    return "보고 말하기";
  }
  if (type === "make_sentence") {
    return "문장 만들기";
  }
  return "상황 질문";
}

function ReviewButtons({
  card,
  onReview
}: {
  card: StudyCard;
  onReview?: (rating: ReviewRating) => void;
}) {
  const ratings: Array<{ rating: ReviewRating; className: string }> = [
    { rating: "again", className: "danger" },
    { rating: "hard", className: "neutral" },
    { rating: "good", className: "success" },
    { rating: "easy", className: "info" }
  ];

  return (
    <div className="review-actions">
      {ratings.map(({ rating, className }) => (
        <button
          className={`button ${className}`}
          key={rating}
          type="button"
          onClick={() => onReview?.(rating)}
        >
          <strong>{getReviewRatingLabel(rating)}</strong>
          <small>{getNextReviewIntervalLabel(card, rating)}</small>
        </button>
      ))}
    </div>
  );
}

function stripSectionHeading(text: string | undefined, heading: string) {
  return String(text || "")
    .replace(new RegExp(`^\\s*${escapeRegExp(heading)}\\s*\\n?`, "i"), "")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
