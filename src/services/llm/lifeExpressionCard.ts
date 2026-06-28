import type { GeneratedCardData, GenerateLifeExpressionCardInput } from "../../shared/types";
import { defaultLearningProfile } from "../../shared/languages";

export type LifeExpressionAnswerCandidate = {
  text: string;
  kind: "recommended" | "rejected";
  register?: "best" | "short" | "casual" | "polite" | "neutral";
  noteKo?: string;
};

export type LifeExpressionCardDraft = GeneratedCardData & {
  answerCandidates?: LifeExpressionAnswerCandidate[];
};

export function createLifeExpressionJsonShape(input?: GenerateLifeExpressionCardInput) {
  const { targetLanguage, nativeLanguage } = input?.learningProfile ?? defaultLearningProfile;
  return {
    cardType: "life_expression",
    deckType: "output",
    direction: "native_to_target",
    sourceSentence: `captured ${nativeLanguage.nameEn} Me text`,
    targetText: `best natural ${targetLanguage.nameEn} version of Me's reply`,
    frontText:
      `맥락\none short ${nativeLanguage.nameEn} context summary\n\n원문\nA: original previous message\nMe: captured ${nativeLanguage.nameEn} Me text`,
    literalTranslationKo:
      `${targetLanguage.nameKo} 대화\nA: previous message translated into ${targetLanguage.nameEn}\nMe: best natural ${targetLanguage.nameEn} reply`,
    naturalTranslationKo:
      `내 답변 변형\n짧게: shorter ${targetLanguage.nameEn} version\n캐주얼: casual ${targetLanguage.nameEn} version\n공손하게: polite ${targetLanguage.nameEn} version`,
    answerCandidates: [
      {
        text: `best natural ${targetLanguage.nameEn} reply`,
        kind: "recommended",
        register: "best",
        noteKo: `best answer to memorize, explained in ${nativeLanguage.nameEn}`
      },
      {
        text: `short natural ${targetLanguage.nameEn} reply`,
        kind: "recommended",
        register: "short",
        noteKo: `short answer variant, explained in ${nativeLanguage.nameEn}`
      },
      {
        text: `literal but unnatural ${targetLanguage.nameEn} wording`,
        kind: "rejected",
        register: "neutral",
        noteKo: `why this should not be memorized, explained in ${nativeLanguage.nameEn}`
      }
    ],
    highlightMappings: [
      {
        sourceText: `key ${targetLanguage.nameEn} expression`,
        literalKo: `literal meaning in ${nativeLanguage.nameEn}`,
        naturalKo: `natural usage meaning in ${nativeLanguage.nameEn}`,
        colorKey: "red"
      }
    ],
    vocabularyItems: [
      {
        term: `key ${targetLanguage.nameEn} expression`,
        ipa: "",
        partOfSpeech: "phrase",
        basicMeaningKo: `basic meaning in ${nativeLanguage.nameEn}`,
        meaningInContextKo: "meaning in this conversation",
        colorKey: "red",
        examples: ["short natural example 1", "short natural example 2"]
      }
    ],
    structureNote:
      "기억할 표현\n- key expression 1\n- key expression 2\n\n주의할 표현\nwording that should not be memorized for this intent",
    confusingComparisons: [
      {
        title: "문맥에 안 맞는 표현",
        explanationKo: "why this wording should not be memorized for the intended meaning"
      }
    ],
    pumpPrompts: [
      {
        type: "ko_to_en",
        promptKo: "captured Korean Me text",
        requiredTerms: ["key English expression"]
      }
    ]
  };
}

export function createLifeExpressionSystemPrompt(input: GenerateLifeExpressionCardInput) {
  const { targetLanguage, nativeLanguage } = input.learningProfile;
  return [
    `You create natural ${targetLanguage.nameEn} conversation cards from ${nativeLanguage.nameEn} life-mining captures.`,
    "Return valid JSON only. Do not wrap JSON in Markdown.",
    "The captured message is always the learner's own message. Label it as Me.",
    "Use any previous context only as conversation context. Do not invent after-context.",
    "Preserve Me as the learner label, but normalize all other speaker names to A, B, C in output fields.",
    "Do not copy real usernames, account handles, emails, profile names, URLs, or local paths from context into the card.",
    `Explain learning notes in ${nativeLanguage.nameEn}.`,
    `Target output language: ${targetLanguage.nameEn} (${targetLanguage.code}).`,
    `Learner native language: ${nativeLanguage.nameEn} (${nativeLanguage.code}).`,
    "Return exactly this JSON shape and field names:",
    JSON.stringify(createLifeExpressionJsonShape(input), null, 2)
  ].join("\n");
}

export function createLifeExpressionUserPrompt(input: GenerateLifeExpressionCardInput) {
  const { targetLanguage, nativeLanguage } = input.learningProfile;
  return [
    `Captured Me text: ${input.koreanText}`,
    input.beforeContext ? `Previous speaker-labelled context:\n${input.beforeContext}` : "",
    input.afterContext ? `After context, if explicitly provided:\n${input.afterContext}` : "",
    "Rules:",
    "- cardType must be \"life_expression\".",
    "- deckType must be \"output\".",
    "- direction must be \"native_to_target\".",
    `- sourceSentence must be the captured ${nativeLanguage.nameEn} Me text.`,
    `- targetText must be the best natural ${targetLanguage.nameEn} version of Me's reply.`,
    "- frontText must use exactly these headings: 맥락, 원문.",
    `- frontText must include a short ${nativeLanguage.nameEn} context summary under 맥락.`,
    `- frontText's 원문 must show the previous speaker-labelled context followed by Me: captured ${nativeLanguage.nameEn} text.`,
    `- literalTranslationKo must use the heading ${targetLanguage.nameKo} 대화 and match the same speaker order as 원문, translated into natural ${targetLanguage.nameEn}.`,
    "- naturalTranslationKo must use the heading 내 답변 변형 and include 짧게, 캐주얼, 공손하게.",
    "- answerCandidates is required. Put natural answers in kind \"recommended\" and tempting but wrong or literal answers in kind \"rejected\".",
    "- Include at least three recommended answerCandidates with best, short, and casual or polite registers. Include a rejected candidate when there is a tempting word-for-word rendering.",
    "- structureNote must explain reusable expressions and any unnatural wording cautions in the learner's native language, but validation must come from answerCandidates.",
    "- First infer Me's intended meaning from the whole conversation, then write target-language replies for that intent. Do not translate the captured text word-by-word.",
    "- targetText must exactly equal one recommended answerCandidates[].text and must not equal any rejected answerCandidates[].text.",
    "- The Me line in literalTranslationKo must use the same recommended answer as targetText.",
    "- naturalTranslationKo should present the recommended answer variants for the learner.",
    "- Rejected candidates are useful only as warnings in notes, never as the answer to memorize.",
    "- Do not include instructional text like 'say this in English' on the front."
  ]
    .filter(Boolean)
    .join("\n");
}

export function repairLifeExpressionCardConsistency(card: LifeExpressionCardDraft): GeneratedCardData {
  if (card.cardType !== "life_expression") {
    return stripLifeExpressionDraftFields(card);
  }

  const targetText = normalizeLifeExpressionCandidate(card.targetText);
  const candidates = normalizeLifeExpressionAnswerCandidates(card.answerCandidates);
  if (candidates.length === 0) {
    return stripLifeExpressionDraftFields(card);
  }

  const recommended = candidates.filter((candidate) => candidate.kind === "recommended");
  const rejected = candidates.filter((candidate) => candidate.kind === "rejected");
  const targetIsRecommended = recommended.some((candidate) =>
    expressionsMatch(candidate.text, targetText)
  );
  const targetIsRejected = rejected.some((candidate) => expressionsMatch(candidate.text, targetText));

  if (targetText && targetIsRecommended && !targetIsRejected) {
    return stripLifeExpressionDraftFields(card);
  }

  const replacement = recommended.find(
    (candidate) =>
      !rejected.some((rejectedCandidate) =>
        expressionsMatch(rejectedCandidate.text, candidate.text)
      )
  )?.text;
  if (!replacement) {
    return stripLifeExpressionDraftFields(card);
  }

  return stripLifeExpressionDraftFields({
    ...card,
    targetText: replacement,
    literalTranslationKo: replaceStandaloneExpression(card.literalTranslationKo, targetText, replacement)
  });
}

export function createLifeExpressionFallbackCard(
  input: GenerateLifeExpressionCardInput
): GeneratedCardData {
  const { targetLanguage } = input.learningProfile;
  const koreanText = input.koreanText.trim() || "나 좀 늦을 것 같아. 먼저 시작해도 돼.";
  const originalConversation = formatOriginalConversation(input.beforeContext, koreanText);
  const fallbackOutput = getFallbackOutput(targetLanguage.code);
  const fallbackTerms = getFallbackTerms(targetLanguage.code);

  return {
    cardType: "life_expression",
    deckType: "output",
    direction: "native_to_target",
    sourceSentence: koreanText,
    targetText: fallbackOutput.best,
    frontText: [
      "맥락",
      "내가 실제 대화에서 쓴 한국어 답변을 영어로 자연스럽게 말하는 상황.",
      "",
      "원문",
      originalConversation
    ].join("\n"),
    literalTranslationKo: [
      `${targetLanguage.nameKo} 대화`,
      inferFallbackTargetConversation(input.beforeContext, targetLanguage.nameKo),
      `Me: ${fallbackOutput.best}`
    ]
      .filter(Boolean)
      .join("\n"),
    naturalTranslationKo: [
      "내 답변 변형",
      `짧게: ${fallbackOutput.short}`,
      `캐주얼: ${fallbackOutput.casual}`,
      `공손하게: ${fallbackOutput.polite}`
    ].join("\n"),
    highlightMappings: [
      {
        sourceText: fallbackTerms[0],
        literalKo: "조금 늦을 것 같다",
        naturalKo: "예정보다 살짝 늦어질 때 쓰는 표현",
        colorKey: "red"
      },
      {
        sourceText: fallbackTerms[1],
        literalKo: "나 없이 먼저 진행해",
        naturalKo: "나 기다리지 말고 먼저 시작해",
        colorKey: "blue"
      }
    ],
    vocabularyItems: [
      {
        term: fallbackTerms[0],
        ipa: "",
        partOfSpeech: "phrase",
        basicMeaningKo: "조금 늦을 것 같다",
        meaningInContextKo: "약속이나 대화 참여가 예정 시간보다 늦어질 때 쓰는 자연스러운 표현",
        colorKey: "red",
        examples: [
          "I'm running a little late, but I'll be there soon.",
          "Sorry, I'm running a little late."
        ]
      },
      {
        term: fallbackTerms[1],
        ipa: "",
        partOfSpeech: "phrase",
        basicMeaningKo: "나 없이 먼저 진행해",
        meaningInContextKo: "상대에게 기다리지 말고 먼저 시작하라고 할 때 쓰는 표현",
        colorKey: "blue",
        examples: [
          "Go ahead without me. I'll catch up later.",
          "If I'm not there by 7, go ahead without me."
        ]
      }
    ],
    structureNote: [
      "기억할 표현",
      `- ${fallbackTerms[0]}`,
      `- ${fallbackTerms[1]}`,
      `- ${fallbackOutput.polite}`,
      "",
      "주의할 표현",
      getFallbackAwkwardDirectTranslation(targetLanguage.code)
    ].join("\n"),
    confusingComparisons: [
      {
        title: "문맥에 안 맞는 표현",
        explanationKo:
          `${getFallbackAwkwardDirectTranslation(targetLanguage.code)}처럼 한국어 어순을 그대로 옮기면 어색합니다. 상황에 맞는 자연스러운 표현을 통째로 기억하는 편이 좋습니다.`
      }
    ],
    pumpPrompts: [
      {
        type: "ko_to_en",
        promptKo: koreanText,
        requiredTerms: fallbackTerms
      }
    ]
  };
}

function normalizeLifeExpressionAnswerCandidates(value: unknown): LifeExpressionAnswerCandidate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: LifeExpressionAnswerCandidate[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const text = normalizeLifeExpressionCandidate(record.text);
    const kind = record.kind;
    if (!text || (kind !== "recommended" && kind !== "rejected")) {
      continue;
    }
    const key = `${kind}:${normalizeComparableText(text)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({
      text,
      kind,
      register: normalizeAnswerCandidateRegister(record.register),
      noteKo: typeof record.noteKo === "string" ? record.noteKo.trim() : undefined
    });
  }
  return result;
}

function normalizeAnswerCandidateRegister(
  value: unknown
): LifeExpressionAnswerCandidate["register"] | undefined {
  return value === "best" ||
    value === "short" ||
    value === "casual" ||
    value === "polite" ||
    value === "neutral"
    ? value
    : undefined;
}

function stripLifeExpressionDraftFields(card: LifeExpressionCardDraft): GeneratedCardData {
  const { answerCandidates: _answerCandidates, ...studyCardFields } = card;
  return studyCardFields;
}

function replaceStandaloneExpression(value: unknown, source: string, replacement: string) {
  const text = String(value ?? "");
  if (!text || !source.trim()) {
    return text;
  }
  return text
    .split(/\r?\n/)
    .map((line) => {
      const labelled = line.match(/^(\s*(?:Me|나|私|僕|俺|저)\s*[:：]\s*)(.+)$/i);
      if (labelled && expressionsMatch(labelled[2], source)) {
        return `${labelled[1]}${replacement}`;
      }
      return expressionsMatch(line, source) ? replacement : line;
    })
    .join("\n");
}

function expressionsMatch(left: unknown, right: unknown) {
  return normalizeComparableText(left) === normalizeComparableText(right);
}

function normalizeLifeExpressionCandidate(value: unknown) {
  return String(value ?? "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparableText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/["'“”‘’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatOriginalConversation(beforeContext: string | undefined, koreanText: string) {
  const context = beforeContext?.trim();
  return [context, `Me: ${koreanText}`].filter(Boolean).join("\n");
}

function inferFallbackTargetConversation(beforeContext: string | undefined, targetLanguageKo: string) {
  if (!beforeContext?.trim()) {
    return "";
  }
  return beforeContext
    .split(/\n+/)
    .map((line) => {
      const [speaker] = line.split(":");
      const label = speaker?.trim() || "A";
      if (label === "Me") {
        return `Me: 이전 메시지를 자연스러운 ${targetLanguageKo}로 번역한 문장.`;
      }
      return `${label}: 이전 메시지를 자연스러운 ${targetLanguageKo}로 번역한 문장.`;
    })
    .join("\n");
}

function getFallbackOutput(targetLanguageCode: string) {
  if (targetLanguageCode.trim().toLowerCase() === "ja") {
    return {
      best: "少し遅れそうです。先に始めていて大丈夫です。",
      short: "少し遅れます。先に始めてください。",
      casual: "ちょっと遅れそうだから、先に始めてて。",
      polite: "少し遅れるかもしれませんので、先に始めていただいて大丈夫です。"
    };
  }

  return {
    best: "I think I'm going to be a bit late. You can start without me.",
    short: "I'll be a bit late. Go ahead without me.",
    casual: "I'm running a little late, so just start without me.",
    polite: "I might be a bit late, so please feel free to start without me."
  };
}

function getFallbackTerms(targetLanguageCode: string) {
  if (targetLanguageCode.trim().toLowerCase() === "ja") {
    return ["少し遅れそう", "先に始めていて"];
  }
  return ["running a little late", "go ahead without me"];
}

function getFallbackAwkwardDirectTranslation(targetLanguageCode: string) {
  if (targetLanguageCode.trim().toLowerCase() === "ja") {
    return "私は少し遅いです。";
  }
  return "I will be late a little.";
}
