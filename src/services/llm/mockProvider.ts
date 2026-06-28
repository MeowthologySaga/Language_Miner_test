import type { LLMProvider } from "./types";
import type {
  GeneratedCardData,
  GenerateCharacterChatReplyInput,
  GenerateLifeExpressionCardInput,
  GenerateReadingCardInput,
  HighlightColorKey,
  LearningProfile
} from "../../shared/types";
import { createLifeExpressionFallbackCard } from "./lifeExpressionCard";
import {
  buildCharacterChatSystemPrompt,
  buildCharacterChatUserPrompt
} from "../../shared/characterCards";
import { ensureBrowserSentenceSelectedTerms } from "../../shared/browserSentenceFallbackCard";
import { normalizeTargetLanguageVocabularyExamples } from "../../shared/vocabularyExampleLanguage";

const sampleSentence =
  "Narrow, deserted streets wind through dilapidated buildings, their facades worn and battered by time and neglect.";

const mockHighlightColors: HighlightColorKey[] = [
  "red",
  "orange",
  "blue",
  "purple",
  "green",
  "pink",
  "cyan",
  "yellow",
  "lime",
  "slate"
];

export class MockProvider implements LLMProvider {
  name = "MockProvider";

  async testConnection() {
    return true;
  }

  async generateReadingCard(input: GenerateReadingCardInput): Promise<GeneratedCardData> {
    await delay(180);
    const { targetLanguage, nativeLanguage } = input.learningProfile;
    const sentence = input.sourceSentence.trim() || sampleSentence;
    const selectedTerms = parseSelectedTerms(input.selectedText).slice(
      0,
      mockHighlightColors.length
    );
    if (sentence.includes("dilapidated buildings")) {
      return ensureBrowserSentenceSelectedTerms(
        sampleReadingCard(sentence, selectedTerms, input.learningProfile),
        input.selectedText,
        mockHighlightColors,
        { targetLanguageCode: targetLanguage.code }
      );
    }

    const terms = selectedTerms.length > 0 ? selectedTerms : ["selected expression"];
    const generated: GeneratedCardData = {
      cardType: "reading",
      sourceSentence: sentence,
      frontText: sentence,
      literalTranslationKo: `원문 구조를 따라 읽으면 ${terms
        .map((term) => `"${term}"`)
        .join(", ")}가 문장 핵심 표현으로 쓰였습니다.`,
      naturalTranslationKo: `문맥상 ${terms
        .map((term) => `"${term}"`)
        .join(", ")}의 의미를 먼저 떠올리며 문장 전체를 이해하면 됩니다.`,
      highlightMappings: terms.map((term, index) => ({
        sourceText: term,
        literalKo: term,
        naturalKo: term,
        colorKey: mockHighlightColors[index]
      })),
      vocabularyItems: terms.map((term, index) => ({
        term,
        ipa: "",
        partOfSpeech: "phrase",
        basicMeaningKo: "문맥 기반 의미 확인 필요",
        meaningInContextKo: "선택한 표현을 중심으로 생성된 Mock 카드입니다.",
        colorKey: mockHighlightColors[index],
        examples: [
          `Try using "${term}" in your own sentence.`,
          `The expression "${term}" appears in this reading context.`,
          `Writers use "${term}" to make the meaning more precise.`
        ]
      })),
      structureNote: "",
      confusingComparisons: [],
      pumpPrompts: []
    };
    return ensureBrowserSentenceSelectedTerms(generated, input.selectedText, mockHighlightColors, {
      targetLanguageCode: targetLanguage.code
    });
  }

  async generateLifeExpressionCard(
    input: GenerateLifeExpressionCardInput
  ): Promise<GeneratedCardData> {
    await delay(180);
    return createLifeExpressionFallbackCard(input);
    /*
    const koreanText = input.koreanText.trim();
    const expression = "I keep putting it off because it feels overwhelming.";

    return {
      cardType: "life_expression",
      sourceSentence: expression,
      targetText: koreanText,
      frontText: expression,
      literalTranslationKo: "나는 그것이 부담스럽게 느껴져서 계속 미루고 있다.",
      naturalTranslationKo:
        koreanText || "해야 하는 걸 알지만 부담스러워서 자꾸 미루게 된다.",
      highlightMappings: [
        {
          sourceText: "putting it off",
          literalKo: "미루고 있다",
          naturalKo: "자꾸 미루게 된다",
          colorKey: "red"
        },
        {
          sourceText: "overwhelming",
          literalKo: "부담스럽게",
          naturalKo: "부담스러워서",
          colorKey: "orange"
        }
      ],
      vocabularyItems: [
        {
          term: "put off",
          ipa: "/pʊt ɔːf/",
          partOfSpeech: "phr. v.",
          basicMeaningKo: "미루다",
          meaningInContextKo: "해야 할 일을 부담감 때문에 뒤로 미루는 느낌",
          colorKey: "red",
          examples: [
            "I keep putting off the report.",
            "Do not put it off until tomorrow."
          ]
        },
        {
          term: "overwhelming",
          ipa: "/ˌoʊvərˈwelmɪŋ/",
          partOfSpeech: "adj.",
          basicMeaningKo: "압도적인, 감당하기 벅찬",
          meaningInContextKo: "일이 너무 커 보여 시작하기 어려운 상태",
          colorKey: "orange",
          examples: [
            "The workload feels overwhelming.",
            "It can be overwhelming at first."
          ]
        }
      ],
      structureNote:
        "I keep + -ing = 반복적으로 계속 그렇게 한다. because it feels overwhelming = 이유를 자연스럽게 설명한다.",
      confusingComparisons: [
        {
          title: "put off vs delay",
          explanationKo:
            "delay는 일정이 늦어지는 중립적 표현이고, put off는 스스로 미루는 뉘앙스가 강하다."
        }
      ],
      pumpPrompts: [
        {
          type: "ko_to_en",
          promptKo: koreanText || "그 일이 너무 부담스러워서 계속 미루고 있어.",
          requiredTerms: ["put off", "overwhelming"]
        }
      ]
    };
    */
  }

  async generateCharacterChatReply(input: GenerateCharacterChatReplyInput): Promise<string> {
    await delay(160);
    const recentUserLine = input.userMessage.trim();
    const hint = input.ragHints[0];
    const characterName = input.character.name || "Character";
    // Keep prompt builders exercised in mock mode so regressions show up during development.
    void buildCharacterChatSystemPrompt({
      character: input.character,
      ragHints: input.ragHints
    });
    void buildCharacterChatUserPrompt({
      character: input.character,
      messages: input.messages,
      userMessage: input.userMessage
    });
    if (hint?.terms.length) {
      return `${characterName}: I get what you mean. ${recentUserLine ? `When you say "${recentUserLine}", ` : ""}it makes me think of "${hint.terms[0]}" in a pretty natural way. Tell me the part that actually matters to you.`;
    }
    return `${characterName}: I hear you. Start from the messy part, not the polished version. What happened?`;
  }
}

export function sampleReadingCard(
  sourceSentence = sampleSentence,
  selectedTerms = ["dilapidated", "facades", "neglect"],
  learningProfile?: LearningProfile
): GeneratedCardData {
  const normalizedSelectedTerms = normalizeSelectedSampleTerms(selectedTerms);
  const highlightMappings = normalizedSelectedTerms.map((term, index) => {
    const detail = getSampleTermDetail(term);
    return {
      sourceText: detail.sourceText,
      literalKo: detail.literalKo,
      naturalKo: detail.naturalKo,
      colorKey: mockHighlightColors[index]
    };
  });
  const vocabularyItems = normalizedSelectedTerms.map((term, index) => {
    const detail = getSampleTermDetail(term);
    return {
      ...detail.vocabulary,
      examples: normalizeTargetLanguageVocabularyExamples({
        values: detail.vocabulary.examples,
        term: detail.vocabulary.term,
        sourceTexts: [sourceSentence],
        targetLanguageCode: learningProfile?.targetLanguage.code
      }),
      colorKey: mockHighlightColors[index]
    };
  });

  return {
    cardType: "reading",
    sourceSentence,
    frontText: sourceSentence,
    literalTranslationKo:
      "좁고 인적 드문 거리들이 황폐한 건물들 사이를 굽이쳐 지나간다. 그 건물들의 외벽은 시간과 방치에 의해 닳고 두들겨 맞은 상태다.",
    naturalTranslationKo:
      "좁고 인적 드문 거리들이 허름한 건물 사이로 굽이친다. 외벽은 세월과 방치로 닳고 두들겨 맞은 듯하다.",
    highlightMappings,
    vocabularyItems,
    structureNote: "",
    confusingComparisons: [
      {
        kind: "contrast",
        title: "dilapidated vs old",
        explanationKo:
          "old는 단순히 오래된 것이고, dilapidated는 관리되지 않아 허물어질 듯 낡은 상태를 말한다."
      },
      {
        kind: "similar",
        title: "neglect vs ignore",
        explanationKo:
          "ignore는 의식적으로 무시하는 것이고, neglect는 돌보거나 관리해야 할 것을 방치하는 느낌이다."
      }
    ],
    pumpPrompts: []
  };
}

type SampleTermDetail = {
  sourceText: string;
  literalKo: string;
  naturalKo: string;
  vocabulary: ReturnType<typeof vocab>;
};

function getSampleTermDetail(term: string): SampleTermDetail {
  const normalized = normalizeSampleTerm(term);
  return sampleTermDetails[normalized] ?? genericSampleTermDetail(term);
}

function normalizeSelectedSampleTerms(terms: string[]) {
  const uniqueTerms: string[] = [];
  terms.forEach((term) => {
    const normalized = normalizeSampleTerm(term);
    if (!normalized) {
      return;
    }

    if (!uniqueTerms.some((candidate) => normalizeSampleTerm(candidate) === normalized)) {
      uniqueTerms.push(term.trim());
    }
  });

  return uniqueTerms.slice(0, mockHighlightColors.length);
}

function parseSelectedTerms(selectedText: string) {
  return selectedText
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);
}

function normalizeSampleTerm(term: string) {
  return term.trim().toLowerCase().replace(/[.,!?;:]+$/g, "");
}

const sampleTermDetails: Record<string, SampleTermDetail> = {
  narrow: {
    sourceText: "Narrow",
    literalKo: "좁고",
    naturalKo: "좁고",
    vocabulary: vocab(
      "narrow",
      "/ˈnæroʊ/",
      "adj.",
      "좁은",
      "거리의 폭이 넓지 않은 상태",
      "red",
      ["The alley was too narrow for cars.", "A narrow path led to the river."]
    )
  },
  deserted: {
    sourceText: "deserted",
    literalKo: "인적 드문",
    naturalKo: "인적 드문",
    vocabulary: vocab(
      "deserted",
      "/dɪˈzɜːrtɪd/",
      "adj.",
      "사람이 없는, 버려진",
      "거리에 사람이 거의 없어 텅 빈 느낌",
      "orange",
      ["The station was deserted at midnight.", "We walked down a deserted road."]
    )
  },
  streets: {
    sourceText: "streets",
    literalKo: "거리들이",
    naturalKo: "거리들이",
    vocabulary: vocab(
      "street",
      "/striːt/",
      "n.",
      "거리, 도로",
      "건물 사이로 이어지는 도시의 길",
      "blue",
      ["The streets were quiet after rain.", "Children played in the street."]
    )
  },
  wind: {
    sourceText: "wind",
    literalKo: "굽이쳐 지나간다",
    naturalKo: "굽이친다",
    vocabulary: vocab(
      "wind",
      "/waɪnd/",
      "v.",
      "구불구불 이어지다",
      "길이 직선이 아니라 건물 사이를 휘어 지나가는 모습",
      "purple",
      ["The road winds through the hills.", "A river winds across the plain."]
    )
  },
  dilapidated: {
    sourceText: "dilapidated",
    literalKo: "황폐한 건물들",
    naturalKo: "허름한 건물",
    vocabulary: vocab(
      "dilapidated",
      "/dɪˈlæpɪdeɪtɪd/",
      "adj.",
      "황폐한, 다 허물어진",
      "관리되지 않아 낡고 허물어질 듯한 상태",
      "green",
      [
        "They live in a dilapidated house near the tracks.",
        "A dilapidated shed stood in the field.",
        "The school replaced its dilapidated facilities."
      ],
      {
        etymologyKo:
          "단순히 old가 아니라, 관리 부족으로 망가져 가는 이미지가 강한 표현입니다.",
        usagePatterns: [
          "Collocation: dilapidated + building/facility",
          "a dilapidated house",
          "dilapidated buildings",
          "dilapidated facilities"
        ]
      }
    )
  },
  buildings: {
    sourceText: "buildings",
    literalKo: "건물들",
    naturalKo: "건물",
    vocabulary: vocab(
      "building",
      "/ˈbɪldɪŋ/",
      "n.",
      "건물",
      "거리 양옆에 서 있는 구조물",
      "pink",
      ["Tall buildings lined the avenue.", "The old building was empty."]
    )
  },
  facades: {
    sourceText: "facades",
    literalKo: "외벽",
    naturalKo: "외벽",
    vocabulary: vocab(
      "facade",
      "/fəˈsɑːd/",
      "n.",
      "건물의 정면, 외벽",
      "건물 바깥쪽에서 보이는 앞면이나 외관",
      "cyan",
      [
        "The theater's facade was restored.",
        "Behind the grand facade lay cramped rooms.",
        "The shop kept its historic facade."
      ],
      {
        etymologyKo:
          "프랑스어 계열에서 온 말로, 건물의 얼굴처럼 보이는 앞면을 가리킵니다.",
        usagePatterns: [
          "Collocation: building facade",
          "building facade",
          "historic facade",
          "glass facade"
        ]
      }
    )
  },
  worn: {
    sourceText: "worn",
    literalKo: "닳고",
    naturalKo: "닳고",
    vocabulary: vocab(
      "worn",
      "/wɔːrn/",
      "adj.",
      "닳은, 낡은",
      "오래 사용되거나 시간이 지나 표면이 낡은 상태",
      "yellow",
      ["The steps were worn smooth.", "He wore a worn leather jacket."]
    )
  },
  battered: {
    sourceText: "battered",
    literalKo: "두들겨 맞은",
    naturalKo: "두들겨 맞은 듯",
    vocabulary: vocab(
      "battered",
      "/ˈbætərd/",
      "adj.",
      "낡고 손상된",
      "비바람이나 시간 때문에 여기저기 상처 난 느낌",
      "lime",
      ["A battered sign hung above the door.", "The boat looked old and battered."]
    )
  },
  time: {
    sourceText: "time",
    literalKo: "시간",
    naturalKo: "세월",
    vocabulary: vocab(
      "time",
      "/taɪm/",
      "n.",
      "시간, 세월",
      "오랜 세월이 건물 외벽을 낡게 만든 원인",
      "slate",
      ["Time changes every city.", "The house had suffered from time and weather."]
    )
  },
  neglect: {
    sourceText: "neglect",
    literalKo: "방치",
    naturalKo: "방치",
    vocabulary: vocab(
      "neglect",
      "/nɪˈɡlekt/",
      "n./v.",
      "방치, 소홀; 방치하다",
      "오랫동안 관리되지 않아 망가진 원인",
      "red",
      [
        "The park shows years of neglect.",
        "Do not neglect your health.",
        "Historical sites suffer from neglect."
      ],
      {
        etymologyKo:
          "돌봐야 할 것을 그냥 두는 느낌입니다. ignore보다 관리 책임을 놓친 뉘앙스가 강합니다.",
        usagePatterns: [
          "Collocation: years of neglect",
          "years of neglect",
          "suffer from neglect",
          "neglect your health"
        ]
      }
    )
  }
};

function genericSampleTermDetail(term: string): SampleTermDetail {
  return {
    sourceText: term,
    literalKo: term,
    naturalKo: term,
    vocabulary: vocab(
      term,
      "",
      "phrase",
      "문맥 기반 의미 확인 필요",
      "선택한 표현을 중심으로 생성된 Mock 단어 설명입니다.",
      "red",
      [
        `I noticed "${term}" in the sentence.`,
        `Try using "${term}" in a short reply.`,
        `The expression "${term}" changes the tone.`
      ],
      {
        etymologyKo: `"${term}"의 형태와 쓰임을 함께 확인하세요.`,
        usagePatterns: [
          `Collocation: "${term}" + noun/verb`,
          `use "${term}"`,
          `"${term}" in context`,
          `"${term}" + sentence`
        ]
      }
    )
  };
}

function vocab(
  term: string,
  ipa: string,
  partOfSpeech: string,
  basicMeaningKo: string,
  meaningInContextKo: string,
  colorKey: HighlightColorKey,
  examples: string[],
  options: {
    etymologyKo?: string;
    usagePatterns?: string[];
  } = {}
) {
  return {
    term,
    ipa,
    partOfSpeech,
    basicMeaningKo,
    meaningInContextKo,
    etymologyKo: options.etymologyKo,
    usagePatterns: options.usagePatterns,
    colorKey,
    examples
  };
}

function delay(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}
