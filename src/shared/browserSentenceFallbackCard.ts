import type {
  ConfusingComparison,
  ConfusingComparisonKind,
  GeneratedCardData,
  HighlightColorKey,
  HighlightMapping,
  VocabularyItem
} from "./types";
import { normalizeTargetLanguageVocabularyExamples } from "./vocabularyExampleLanguage";

export type BrowserSentenceFallbackCardInput = {
  selectedText: string;
  sourceSentence: string;
  translatedSentence?: string;
  colorKeys: HighlightColorKey[];
  targetLanguageCode?: string;
};

type FallbackTermDetail = {
  ipa?: string;
  partOfSpeech: string;
  basicMeaningKo: string;
  meaningInContextKo: string;
  literalKo?: string;
  naturalKo?: string;
  etymologyKo?: string;
  usagePatterns: string[];
  examples: string[];
  comparison?: BrowserSentenceComparison;
};

type BrowserSentenceComparison = ConfusingComparison;

export function createBrowserSentenceFallbackCardData({
  selectedText,
  sourceSentence,
  translatedSentence,
  colorKeys,
  targetLanguageCode
}: BrowserSentenceFallbackCardInput): GeneratedCardData {
  const terms = parseBrowserSelectedTerms(selectedText).slice(0, colorKeys.length);
  const vocabularyItems = terms.map((term, index) =>
    createFallbackVocabularyItem(term, sourceSentence, colorKeys[index], targetLanguageCode)
  );

  return {
    cardType: "reading",
    deckType: "input",
    direction: "target_to_native",
    sourceSentence,
    frontText: sourceSentence,
    targetText: translatedSentence || undefined,
    literalTranslationKo: translatedSentence || "원문 구조를 기준으로 다시 생성이 필요합니다.",
    naturalTranslationKo: translatedSentence || "선택한 표현이 들어간 원문의 자연스러운 뜻을 확인해야 합니다.",
    highlightMappings: vocabularyItems.map((item) => {
      const detail = getFallbackTermDetail(item.term);
      return {
        sourceText: item.term,
        literalKo: detail.literalKo,
        naturalKo: detail.naturalKo,
        colorKey: item.colorKey
      };
    }),
    vocabularyItems,
    structureNote: "",
    confusingComparisons: createFallbackConfusingComparisons(terms),
    pumpPrompts: []
  };
}

export function createFallbackVocabularyItem(
  term: string,
  sourceSentence: string,
  colorKey: HighlightColorKey,
  targetLanguageCode?: string
): VocabularyItem {
  const detail = getFallbackTermDetail(term);
  return {
    term,
    ipa: normalizeBrowserVocabularyIpa(term, detail.ipa ?? ""),
    partOfSpeech: detail.partOfSpeech,
    basicMeaningKo: detail.basicMeaningKo,
    meaningInContextKo: detail.meaningInContextKo,
    etymologyKo: detail.etymologyKo,
    usagePatterns: detail.usagePatterns,
    colorKey,
    examples: normalizeTargetLanguageVocabularyExamples({
      values: detail.examples,
      term,
      sourceTexts: [sourceSentence],
      targetLanguageCode
    })
  };
}

export function normalizeBrowserVocabularyIpa(
  term: string,
  value: unknown,
  fallbackValue?: unknown
) {
  const candidates = [value, fallbackValue];
  for (const candidate of candidates) {
    const normalized = normalizeIpaCandidate(term, candidate);
    if (normalized) {
      return normalized;
    }
  }
  return createAcronymIpa(term) ?? "";
}

function normalizeIpaCandidate(term: string, value: unknown) {
  const raw = normalizeText(String(value ?? ""));
  if (!raw || isInvalidIpaText(raw)) {
    return "";
  }

  const slashMatch = raw.match(/\/([^/]{1,90})\//);
  const bracketMatch = raw.match(/\[([^\]]{1,90})\]/);
  const hadPhoneticWrapper = Boolean(slashMatch || bracketMatch);
  const extracted = slashMatch?.[1] ?? bracketMatch?.[1] ?? raw;
  const candidate = extracted
    .replace(/^ipa\s*[:=-]\s*/i, "")
    .replace(/^phonetic\s*[:=-]\s*/i, "")
    .replace(/^pronunciation\s*[:=-]\s*/i, "")
    .replace(/[∕⁄]/g, "/")
    .replace(/:/g, "ː")
    .replace(/^[\/\[\]\s]+|[\/\[\]\s]+$/g, "")
    .trim();

  if (!candidate || candidate.length > 90 || isInvalidIpaText(candidate)) {
    return "";
  }
  if (looksLikePlainOrthography(term, candidate, hadPhoneticWrapper)) {
    return "";
  }
  if (!looksLikeIpaText(candidate, hadPhoneticWrapper)) {
    return "";
  }
  return `/${candidate}/`;
}

function isInvalidIpaText(value: string) {
  return (
    /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(value) ||
    /\b(unknown|none|null|n\/a|na|not available|if known|same as|pronounced|pronunciation|spelled|respelling|sounds like|발음|없음|모름)\b/i.test(
      value
    )
  );
}

function looksLikePlainOrthography(term: string, candidate: string, hadPhoneticWrapper: boolean) {
  const normalizedCandidate = normalizeIpaPlainKey(candidate);
  const normalizedTerm = normalizeIpaPlainKey(term);
  if (!normalizedCandidate || !normalizedTerm) {
    return false;
  }
  if (normalizedCandidate === normalizedTerm) {
    return !hadPhoneticWrapper;
  }
  const asciiOnly = /^[a-z\s'-]+$/i.test(candidate);
  const multipleWords = candidate.trim().split(/\s+/).length > 1;
  return asciiOnly && multipleWords;
}

function looksLikeIpaText(candidate: string, hadPhoneticWrapper: boolean) {
  if (/[{}<>0-9]/.test(candidate)) {
    return false;
  }
  if (/\b(gee|zed|zee|double|letter|dash|hyphen|slash|comma|period)\b/i.test(candidate)) {
    return false;
  }
  if (/[æɑɒɔəɚɝɛɜɪʊʌʃʒθðŋɡɹɾʔˈˌːˑ̃]/u.test(candidate)) {
    return true;
  }
  return hadPhoneticWrapper && /^[a-z .'-]+$/i.test(candidate) && candidate.trim().split(/\s+/).length <= 1;
}

function normalizeIpaPlainKey(value: string) {
  return normalizeText(value)
    .replace(/[\/\[\]ˈˌːˑ.]/g, "")
    .replace(/[^a-z]+/gi, "")
    .toLowerCase();
}

function createAcronymIpa(term: string) {
  const letters = term.replace(/[^a-z]/gi, "");
  if (letters.length < 2 || letters.length > 6) {
    return undefined;
  }
  const known = knownAcronymIpa[letters.toLowerCase()];
  if (known) {
    return known;
  }
  const normalizedTerm = term.trim();
  const looksLikeAcronym =
    normalizedTerm === normalizedTerm.toUpperCase() || !/[aeiou]/i.test(letters);
  if (!looksLikeAcronym) {
    return undefined;
  }
  const letterIpa: Record<string, string> = {
    a: "eɪ",
    b: "biː",
    c: "siː",
    d: "diː",
    e: "iː",
    f: "ef",
    g: "dʒiː",
    h: "eɪtʃ",
    i: "aɪ",
    j: "dʒeɪ",
    k: "keɪ",
    l: "el",
    m: "em",
    n: "en",
    o: "oʊ",
    p: "piː",
    q: "kjuː",
    r: "ɑːr",
    s: "es",
    t: "tiː",
    u: "juː",
    v: "viː",
    w: "ˈdʌbəl juː",
    x: "eks",
    y: "waɪ",
    z: "ziː"
  };
  const parts = [...letters.toLowerCase()].map((letter) => letterIpa[letter]).filter(Boolean);
  return parts.length === letters.length ? `/${parts.join(" ")}/` : undefined;
}

const knownAcronymIpa: Record<string, string> = {
  ngl: "/ˌɛn dʒiː ˈɛl/",
  tbh: "/ˌtiː biː ˈeɪtʃ/",
  imo: "/ˌaɪ em ˈoʊ/",
  imho: "/ˌaɪ em eɪtʃ ˈoʊ/",
  idk: "/ˌaɪ diː ˈkeɪ/"
};

type BrowserSentenceTermCard = {
  sourceSentence: string;
  highlightMappings: HighlightMapping[];
  vocabularyItems: VocabularyItem[];
  confusingComparisons?: BrowserSentenceComparison[];
  languageMetadata?: {
    profileTargetLanguageCode?: string;
  };
};

export function ensureBrowserSentenceSelectedTerms<T extends BrowserSentenceTermCard>(
  card: T,
  selectedText: string,
  colorKeys: HighlightColorKey[],
  options: { targetLanguageCode?: string } = {}
): T & { confusingComparisons: BrowserSentenceComparison[] } {
  const targetLanguageCode =
    options.targetLanguageCode || card.languageMetadata?.profileTargetLanguageCode;
  const terms = parseBrowserSelectedTerms(selectedText).slice(0, colorKeys.length);
  if (!terms.length) {
    return {
      ...card,
      confusingComparisons: card.confusingComparisons ?? []
    };
  }

  const fallbackCard = createBrowserSentenceFallbackCardData({
    selectedText: terms.join(", "),
    sourceSentence: card.sourceSentence,
    colorKeys,
    targetLanguageCode
  });
  const existingItems = new Map<string, VocabularyItem>();
  card.vocabularyItems.forEach((item, index) => {
    registerExistingVocabularyItem(existingItems, item.term, item);
    registerExistingVocabularyItem(existingItems, card.highlightMappings[index]?.sourceText, item);
  });
  const fallbackItems = new Map(
    fallbackCard.vocabularyItems.map((item) => [normalizeTermKey(item.term), item])
  );
  const existingMappings = new Map(
    card.highlightMappings.map((mapping) => [normalizeTermKey(mapping.sourceText), mapping])
  );
  const fallbackMappings = new Map(
    fallbackCard.highlightMappings.map((mapping) => [normalizeTermKey(mapping.sourceText), mapping])
  );
  const existingComparisons = card.confusingComparisons ?? [];
  const fallbackComparisons = createFallbackConfusingComparisons(terms);

  const vocabularyItems = terms.map((term, index) => {
    const key = normalizeTermKey(term);
    const colorKey = getTermColorKey(colorKeys, index);
    const fallbackItem =
      fallbackItems.get(key) ??
      createFallbackVocabularyItem(
        term,
        card.sourceSentence,
        colorKey,
        targetLanguageCode
      );
    const existingItem = existingItems.get(key);
    return existingItem
      ? {
          ...existingItem,
          ipa: normalizeBrowserVocabularyIpa(existingItem.term || term, existingItem.ipa, fallbackItem.ipa),
          colorKey: existingItem.colorKey || fallbackItem.colorKey,
          usagePatterns: mergeBrowserUsagePatterns(
            existingItem.usagePatterns,
            fallbackItem.usagePatterns
          ),
          examples: targetLanguageCode
            ? normalizeTargetLanguageVocabularyExamples({
                values: existingItem.examples,
                fallbackValues: fallbackItem.examples,
                term: existingItem.term || term,
                sourceTexts: [card.sourceSentence],
                targetLanguageCode
              })
            : existingItem.examples
        }
      : fallbackItem;
  });

  const highlightMappings = terms.map((term, index) => {
    const key = normalizeTermKey(term);
    const vocabularyItem = vocabularyItems[index];
    const fallbackMapping = fallbackMappings.get(key);
    const existingMapping = existingMappings.get(key);
    return {
      sourceText: existingMapping?.sourceText || fallbackMapping?.sourceText || term,
      literalKo:
        existingMapping?.literalKo ||
        fallbackMapping?.literalKo ||
        vocabularyItem.basicMeaningKo,
      naturalKo:
        existingMapping?.naturalKo ||
        fallbackMapping?.naturalKo ||
        vocabularyItem.meaningInContextKo ||
        vocabularyItem.basicMeaningKo,
      colorKey: existingMapping?.colorKey || vocabularyItem.colorKey || getTermColorKey(colorKeys, index)
    };
  });

  return {
    ...card,
    vocabularyItems,
    highlightMappings,
    confusingComparisons: mergeSelectedTermComparisons(
      existingComparisons,
      fallbackComparisons,
      terms
    )
  };
}

function createFallbackConfusingComparisons(terms: string[]): BrowserSentenceComparison[] {
  return terms.map((term) => {
    const detail = getFallbackTermDetail(term);
    return getKnownComparison(term) ?? detail.comparison ?? createGenericComparison(term);
  });
}

function mergeSelectedTermComparisons(
  existingComparisons: BrowserSentenceComparison[],
  fallbackComparisons: BrowserSentenceComparison[],
  terms: string[]
) {
  const merged = existingComparisons.filter(isUsableComparison).map(normalizeComparison);
  const seenTitles = new Set(merged.map((comparison) => normalizeText(comparison.title).toLowerCase()));

  terms.forEach((term, index) => {
    const normalizedTerm = normalizeTermKey(term);
    const hasTermComparison = merged.some((comparison) =>
      normalizeText(`${comparison.title} ${comparison.explanationKo}`)
        .toLowerCase()
        .includes(normalizedTerm)
    );
    const fallbackComparison = fallbackComparisons[index];
    const fallbackTitleKey = normalizeText(fallbackComparison?.title).toLowerCase();
    if (!hasTermComparison && fallbackComparison && !seenTitles.has(fallbackTitleKey)) {
      merged.push(fallbackComparison);
      seenTitles.add(fallbackTitleKey);
    }
  });

  return merged;
}

function isUsableComparison(value: BrowserSentenceComparison) {
  const title = normalizeText(value.title).toLowerCase();
  const explanation = normalizeText(value.explanationKo).toLowerCase();
  if (!title || !explanation) {
    return false;
  }
  return !/(similar expression|similar word|selected term|concrete alternative|placeholder)/i.test(
    `${title} ${explanation}`
  );
}

function normalizeComparison(value: BrowserSentenceComparison): BrowserSentenceComparison {
  return {
    ...value,
    kind: normalizeComparisonKind(value.kind) ?? inferComparisonKind(value)
  };
}

function registerExistingVocabularyItem(
  items: Map<string, VocabularyItem>,
  keyValue: string | undefined,
  item: VocabularyItem
) {
  const key = normalizeTermKey(keyValue || "");
  if (!key || items.has(key)) {
    return;
  }
  items.set(key, item);
}

function createGenericComparison(term: string): BrowserSentenceComparison {
  const inferred = inferGenericComparison(term);
  return {
    kind: inferred.kind,
    title: `${term} vs ${inferred.alternative}`,
    explanationKo: `"${term}"은 원문 문장에서의 역할을 기준으로 익히세요. "${inferred.alternative}"은 비슷해 보여도 ${inferred.focusKo}이 달라질 수 있습니다. 예: I noticed "${term}" in context. / I used "${inferred.alternative}" in a simpler sentence.`
  };
}

function getKnownComparison(term: string): BrowserSentenceComparison | undefined {
  return knownComparisonDetails[normalizeTermKey(term)];
}

function normalizeComparisonKind(value: unknown): ConfusingComparisonKind | undefined {
  return comparisonKinds.includes(value as ConfusingComparisonKind)
    ? (value as ConfusingComparisonKind)
    : undefined;
}

function inferComparisonKind(value: BrowserSentenceComparison): ConfusingComparisonKind {
  const text = normalizeText(`${value.title} ${value.explanationKo}`).toLowerCase();
  if (/\b(opposite|contrast|antonym)\b/.test(text)) {
    return "contrast";
  }
  if (/\b(collocation|combine|object)\b|go with/.test(text)) {
    return "collocation";
  }
  if (/\b(nuance|tone|register|formal|casual|strength)\b/.test(text)) {
    return "nuance";
  }
  return "similar";
}

function inferGenericComparison(term: string): {
  kind: ConfusingComparisonKind;
  alternative: string;
  focusKo: string;
} {
  const normalized = normalizeTermKey(term);
  if (/\w+ly$/.test(normalized)) {
    return {
      kind: "nuance",
      alternative: "plainly",
      focusKo: "강도와 어조"
    };
  }
  if (/\w+(ed|en)$/.test(normalized)) {
    return {
      kind: "contrast",
      alternative: "unchanged",
      focusKo: "상태의 방향"
    };
  }
  if (term.includes(" ")) {
    return {
      kind: "collocation",
      alternative: "direct translation",
      focusKo: "함께 붙는 단어"
    };
  }
  return {
    kind: "similar",
    alternative: "near synonym",
    focusKo: "쓰임과 자연스러움"
  };
}

const comparisonKinds: ConfusingComparisonKind[] = [
  "similar",
  "contrast",
  "nuance",
  "collocation"
];

const knownComparisonDetails: Record<string, BrowserSentenceComparison> = {
  ngl: {
    kind: "nuance",
    title: "NGL vs TBH",
    explanationKo:
      "NGL은 의외이거나 살짝 고백하듯 의견을 꺼낼 때 자주 쓰는 채팅 말투이고, TBH는 더 일반적인 '솔직히 말하면'에 가깝습니다. 예: NGL, that was fun. / TBH, I agree with you."
  },
  encounter: {
    kind: "similar",
    title: "encounter vs meet",
    explanationKo:
      "encounter는 우연히 마주치거나 문제를 겪는 느낌이 강하고, meet는 사람을 만나거나 조건을 충족한다는 일반 표현입니다. 예: She encountered a problem. / She met a friend."
  },
  encounters: {
    kind: "similar",
    title: "encounters vs meets",
    explanationKo:
      "encounters는 뜻밖에 마주치거나 겪는 느낌이고, meets는 사람을 만나거나 요구 조건을 충족할 때 자연스럽습니다. 예: The hero encounters a trap. / The hero meets a guide."
  },
  riddle: {
    kind: "similar",
    title: "riddle vs puzzle",
    explanationKo:
      "riddle은 말장난이나 질문 형태의 수수께끼에 가깝고, puzzle은 퍼즐·문제 전반을 넓게 가리킵니다. 예: He solved the riddle. / She finished the puzzle."
  },
  riddles: {
    kind: "similar",
    title: "riddles vs puzzles",
    explanationKo:
      "riddles는 언어로 푸는 수수께끼 느낌이고, puzzles는 조각 맞추기나 논리 문제까지 포함합니다. 예: The book has riddles. / The game has puzzles."
  },
  significantly: {
    kind: "nuance",
    title: "significantly vs slightly",
    explanationKo:
      "significantly는 변화나 차이가 뚜렷하게 크다는 말이고, slightly는 아주 조금이라는 약한 표현입니다. 예: The score improved significantly. / The score improved slightly."
  },
  revised: {
    kind: "nuance",
    title: "revised vs edited",
    explanationKo:
      "revised는 내용이나 구조를 다시 검토해 고친 느낌이고, edited는 문장·형식·오류를 다듬는 넓은 표현입니다. 예: She revised the plan. / She edited the paragraph."
  },
  dilapidated: {
    kind: "contrast",
    title: "dilapidated vs well-maintained",
    explanationKo:
      "dilapidated는 관리 부족으로 허물어질 듯 낡은 상태이고, well-maintained는 잘 관리된 반대 상태입니다. 예: a dilapidated building / a well-maintained building."
  },
  facade: {
    kind: "collocation",
    title: "facade vs face",
    explanationKo:
      "facade는 건물의 정면과 잘 결합하고, face는 사람 얼굴이나 사물의 앞면에 더 넓게 쓰입니다. 예: a glass facade / a friendly face."
  },
  facades: {
    kind: "collocation",
    title: "facades vs faces",
    explanationKo:
      "facades는 건물 외벽·정면과 결합하고, faces는 사람 얼굴이나 표면을 말할 때 자연스럽습니다. 예: historic facades / familiar faces."
  },
  neglect: {
    kind: "similar",
    title: "neglect vs ignore",
    explanationKo:
      "neglect는 돌보거나 관리해야 할 것을 방치하는 느낌이고, ignore는 알고도 무시하는 행동에 가깝습니다. 예: years of neglect / ignore a warning."
  }
};

function mergeBrowserUsagePatterns(
  values: string[] | undefined,
  fallbackValues: string[] | undefined
) {
  const merged = uniqueNonEmptyStrings([...(values ?? []), ...(fallbackValues ?? [])]);
  const collocation = merged.find(isCollocationPattern);
  const ordered = collocation
    ? [collocation, ...merged.filter((value) => value !== collocation)]
    : merged;
  return ordered.slice(0, 4);
}

export function parseBrowserSelectedTerms(value: string) {
  const normalized = normalizeText(value);
  const terms = normalized.includes(",")
    ? normalized.split(",")
    : normalized.split(/\s+/).length <= 4
      ? [normalized]
      : normalized.split(/\s+/).slice(0, 4);
  const uniqueTerms: string[] = [];
  for (const term of terms) {
    const cleaned = term.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!cleaned) {
      continue;
    }
    if (!uniqueTerms.some((candidate) => candidate.toLowerCase() === cleaned.toLowerCase())) {
      uniqueTerms.push(cleaned);
    }
  }
  return uniqueTerms.length > 0 ? uniqueTerms : [normalized].filter(Boolean);
}

function getFallbackTermDetail(term: string): FallbackTermDetail {
  const normalized = term.trim().toLowerCase();
  const known = knownTermDetails[normalized];
  if (known) {
    return known;
  }
  return {
    partOfSpeech: term.includes(" ") ? "phrase" : "word",
    basicMeaningKo: "문맥 기반 의미 확인 필요",
    meaningInContextKo: "선택한 표현을 원문 안에서 확인해야 합니다.",
    etymologyKo: `"${term}"의 형태와 주변 단어 조합을 함께 보세요.`,
    usagePatterns: [
      `Collocation: "${term}" + noun/verb`,
      `use "${term}"`,
      `"${term}" in context`,
      `"${term}" + sentence`
    ],
    examples: [
      `I noticed "${term}" in the sentence.`,
      `Try using "${term}" in a short reply.`,
      `The expression "${term}" changes the tone.`
    ]
  };
}

const knownTermDetails: Record<string, FallbackTermDetail> = {
  ngl: {
    ipa: "/ˌɛn dʒiː ˈɛl/",
    partOfSpeech: "internet slang / discourse marker",
    basicMeaningKo: "솔직히 말해서",
    meaningInContextKo: "말 앞이나 뒤에 붙여 자기 의견을 솔직하게 꺼내는 채팅 표현",
    literalKo: "솔직히 말해서",
    naturalKo: "솔직히",
    etymologyKo:
      "NGL = not gonna lie의 약어. 보통 글자 이름 N-G-L로 읽고, 의미는 not gonna lie로 이해합니다.",
    usagePatterns: [
      "Expanded form: not gonna lie",
      "NGL, ...",
      "NGL + opinion",
      "not gonna lie, ..."
    ],
    examples: [
      "NGL, that ending was great.",
      "NGL, I expected a harder fight.",
      "I'm tired, NGL."
    ],
    comparison: {
      kind: "nuance",
      title: "NGL vs TBH",
      explanationKo:
        "NGL은 의외이거나 살짝 고백하듯 의견을 꺼낼 때 자주 쓰는 채팅 말투이고, TBH는 더 일반적인 '솔직히 말하면'에 가깝습니다. 예: NGL, that was fun. / TBH, I agree with you."
    }
  },
  how: {
    ipa: "/haʊ/",
    partOfSpeech: "adverb",
    basicMeaningKo: "어떻게, 어떤 방식으로",
    meaningInContextKo: "방법이나 경로를 묻는 의문사",
    literalKo: "어떻게",
    naturalKo: "어떻게",
    etymologyKo: "How do I + 동사원형...? = 내가 어떻게 ...하지? / 어떻게 ...할 수 있지?",
    usagePatterns: [
      "Collocation: How do I + verb?",
      "How do I ...?",
      "How can I ...?",
      "How do you ...?"
    ],
    examples: [
      "How do I open this door?",
      "How can I reach that ledge?",
      "How do you solve this puzzle?"
    ]
  },
  what: {
    ipa: "/wʌt/",
    partOfSpeech: "pronoun",
    basicMeaningKo: "무엇, 어떤 것",
    meaningInContextKo: "대상이나 내용을 묻는 의문사",
    literalKo: "무엇",
    naturalKo: "뭐",
    etymologyKo: "What + be/do...? = 무엇인지, 무엇을 하는지 묻는 기본 의문문 구조입니다.",
    usagePatterns: [
      "Collocation: What + be/do + subject?",
      "What is ...?",
      "What do I ...?",
      "What should I ...?"
    ],
    examples: ["What is this item?", "What do I need next?", "What should I say?"]
  },
  where: {
    ipa: "/wer/",
    partOfSpeech: "adverb",
    basicMeaningKo: "어디에, 어디로",
    meaningInContextKo: "장소나 방향을 묻는 의문사",
    literalKo: "어디",
    naturalKo: "어디",
    etymologyKo: "Where + be/can/do...? = 위치나 이동 방향을 묻는 구조입니다.",
    usagePatterns: [
      "Collocation: Where + be/can/do",
      "Where is ...?",
      "Where can I ...?",
      "Where do I go?"
    ],
    examples: ["Where is the entrance?", "Where can I rest?", "Where do I go next?"]
  },
  why: {
    ipa: "/waɪ/",
    partOfSpeech: "adverb",
    basicMeaningKo: "왜, 어째서",
    meaningInContextKo: "이유나 원인을 묻는 의문사",
    literalKo: "왜",
    naturalKo: "왜",
    etymologyKo: "Why + do/does/is...? = 이유를 직접 묻는 의문문 구조입니다.",
    usagePatterns: [
      "Collocation: Why + auxiliary + subject",
      "Why is ...?",
      "Why do I ...?",
      "Why does it ...?"
    ],
    examples: ["Why is the door locked?", "Why do I need this key?", "Why does it matter?"]
  },
  attention: {
    ipa: "/əˈtenʃən/",
    partOfSpeech: "noun",
    basicMeaningKo: "주의, 관심",
    meaningInContextKo: "paying attention은 신경을 쓰거나 집중한다는 뜻입니다.",
    literalKo: "주의",
    naturalKo: "신경",
    etymologyKo: "pay attention to + 대상 = ~에 주의를 기울이다 / 신경 쓰다.",
    usagePatterns: [
      "Collocation: pay attention to ...",
      "pay attention",
      "pay attention to ...",
      "give attention to ..."
    ],
    examples: [
      "Please pay attention to the road.",
      "She paid close attention to the details.",
      "I wasn't paying attention during the call."
    ]
  },
  hibernated: {
    ipa: "/ˈhaɪbərneɪtɪd/",
    partOfSpeech: "verb",
    basicMeaningKo: "겨울잠을 잤다, 긴 잠에 들어 있었다",
    meaningInContextKo: "오랫동안 잠들어 시대 변화에서 뒤처진 상태를 비유합니다.",
    literalKo: "잠들었다",
    naturalKo: "긴 잠에 들어 있었다",
    etymologyKo: "hibernate는 동물이 겨울잠을 자는 뜻에서, 컴퓨터 절전/긴 공백 상태에도 쓰입니다.",
    usagePatterns: [
      "Collocation: hibernate through winter",
      "hibernate through ...",
      "be hibernating",
      "come out of hibernation"
    ],
    examples: [
      "The bear hibernated through the winter.",
      "My laptop hibernated after an hour.",
      "He seemed to have hibernated for years."
    ]
  }
};

function normalizeText(value: string) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueNonEmptyStrings(values: Array<string | undefined>) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeText(value || "");
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function isCollocationPattern(value: string) {
  return /collocation/i.test(value);
}

function normalizeTermKey(value: string) {
  return normalizeText(value)
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .toLowerCase();
}

function getTermColorKey(colorKeys: HighlightColorKey[], index: number): HighlightColorKey {
  return colorKeys[index % colorKeys.length] ?? "red";
}
