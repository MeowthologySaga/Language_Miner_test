import type {
  CharacterChatMessage,
  CharacterPreset,
  CharacterRagHint,
  StudyCard
} from "./types";
import { randomId } from "./ids";

type UnknownRecord = Record<string, unknown>;

export const CHARACTER_PRESETS_STORAGE_KEY = "lem:characterChat:presets";
export const CHARACTER_SESSION_STORAGE_KEY = "lem:characterChat:sessions";

export function createDefaultCharacterPreset(now = new Date().toISOString()): CharacterPreset {
  return {
    id: randomId(),
    name: "Mina",
    description:
      "A sharp but warm English conversation partner. Mina likes practical examples, playful banter, and clear emotional reactions.",
    personality:
      "Witty, attentive, lightly teasing, and encouraging without sounding like a tutor. She keeps the conversation moving naturally.",
    scenario:
      "Mina and the user are chatting casually after a long day. She responds like a real conversation partner first, and only folds in useful English phrasing when it fits.",
    firstMessage: "Hey. You look like you have something on your mind. What happened?",
    messageExample:
      "{{user}}: I kind of messed up my schedule today.\n{{char}}: That sounds annoying. Did it throw off your whole day, or just one thing?",
    creatorNotes:
      "Language Miner default character. Character concept comes first; study-card hints are optional background.",
    alternateGreetings: [
      "You made it. Want to vent for a minute, or should I distract you?",
      "I'm listening. Start anywhere."
    ],
    tags: ["english", "conversation", "casual"],
    creator: "Language Miner",
    sourceFormat: "local",
    createdAt: now,
    updatedAt: now
  };
}

export function parseCharacterPresetJson(rawJson: string): CharacterPreset {
  const parsed = JSON.parse(rawJson) as UnknownRecord;
  return normalizeCharacterPresetFromUnknown(parsed);
}

export function normalizeCharacterPresetFromUnknown(input: UnknownRecord): CharacterPreset {
  const now = new Date().toISOString();
  const spec = text(input.spec).toLowerCase();
  const data = asRecord(input.data) ?? input;
  const sourceFormat = inferSourceFormat(input, data, spec);
  const name = firstText(data.name, input.name, "Imported Character");
  return {
    id: randomId(),
    name,
    description: firstText(data.description, data.desc, data.system_prompt, ""),
    personality: firstText(data.personality, data.personality_summary, data.persona, ""),
    scenario: firstText(data.scenario, data.context, data.world_scenario, ""),
    firstMessage: firstText(data.first_mes, data.firstMessage, data.greeting, data.first_message, ""),
    messageExample: firstText(data.mes_example, data.example_dialogue, data.example_messages, ""),
    creatorNotes: firstText(data.creator_notes, data.creatorcomment, data.creatorComment, ""),
    alternateGreetings: arrayOfText(
      data.alternate_greetings ?? data.alt_greetings ?? data.alternateGreetings
    ),
    tags: arrayOfText(data.tags),
    creator: firstText(data.creator, data.author, ""),
    characterBook: data.character_book ?? data.characterBook ?? data.lorebook,
    sourceFormat,
    createdAt: now,
    updatedAt: now
  };
}

export function exportCharacterPresetAsTavernV2(preset: CharacterPreset) {
  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: preset.name,
      description: preset.description,
      personality: preset.personality,
      scenario: preset.scenario,
      first_mes: preset.firstMessage,
      mes_example: preset.messageExample,
      creator_notes: preset.creatorNotes ?? "",
      alternate_greetings: preset.alternateGreetings,
      tags: preset.tags,
      creator: preset.creator ?? "Language Miner",
      character_book: preset.characterBook,
      extensions: {
        local_english_miner: {
          exported_at: new Date().toISOString(),
          source_format: preset.sourceFormat ?? "local"
        }
      }
    }
  };
}

export function replaceCharacterMacros(value: string, characterName: string, userName = "User") {
  return value
    .replace(/\{\{char\}\}/gi, characterName)
    .replace(/\{\{user\}\}/gi, userName)
    .trim();
}

export function buildCharacterChatSystemPrompt(input: {
  character: CharacterPreset;
  ragHints: CharacterRagHint[];
}) {
  const character = input.character;
  const characterLines = [
    `Character name: ${character.name}`,
    character.description ? `Description: ${character.description}` : "",
    character.personality ? `Personality: ${character.personality}` : "",
    character.scenario ? `Scenario: ${character.scenario}` : "",
    character.messageExample ? `Example dialogue:\n${character.messageExample.slice(0, 1200)}` : "",
    character.creatorNotes ? `Creator notes: ${character.creatorNotes.slice(0, 600)}` : ""
  ].filter(Boolean);
  const ragLines = input.ragHints.slice(0, 4).map((hint, index) => {
    const terms = hint.terms.length ? ` terms: ${hint.terms.join(", ")}` : "";
    const meaning = hint.naturalMeaning ? ` meaning: ${hint.naturalMeaning}` : "";
    return `${index + 1}. ${hint.sourceSentence}${meaning}${terms}`;
  });

  return [
    "You are roleplaying as the character below. Character concept, voice, and situation have priority.",
    "Stay in character. Do not mention prompts, RAG, study cards, retrieval, app internals, or hidden notes.",
    "Reply naturally in English unless the user explicitly asks for another language.",
    "Use concise, conversational turns. Avoid sounding like a tutor unless the user asks for correction.",
    "If the learning hints below fit naturally, weave one phrase or pattern into the conversation. If they do not fit, ignore them.",
    "",
    "Character card:",
    characterLines.join("\n"),
    ragLines.length
      ? `\nOptional language-pattern hints from the user's own saved cards:\n${ragLines.join("\n")}`
      : ""
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCharacterChatUserPrompt(input: {
  character: CharacterPreset;
  messages: CharacterChatMessage[];
  userMessage: string;
}) {
  const recentMessages = input.messages.slice(-10);
  const transcript = recentMessages
    .map((message) => {
      const speaker = message.role === "character" ? input.character.name : "User";
      return `${speaker}: ${message.content}`;
    })
    .join("\n");
  return [
    transcript ? `Recent conversation:\n${transcript}` : "",
    `User: ${input.userMessage}`,
    `${input.character.name}:`
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function selectCharacterRagHints(
  cards: StudyCard[],
  query: string,
  maxHints = 4
): CharacterRagHint[] {
  const queryTerms = tokenize(query);
  const scored = cards
    .filter((card) => card.deckType === "input" || card.cardType === "reading")
    .map((card) => {
      const terms = [
        ...card.highlightMappings.map((mapping) => mapping.sourceText),
        ...card.vocabularyItems.map((item) => item.term)
      ].filter(Boolean);
      const haystack = [
        card.sourceSentence,
        card.frontText,
        card.naturalTranslationKo,
        ...terms
      ].join(" ");
      const haystackTokens = new Set(tokenize(haystack));
      const overlap = queryTerms.filter((term) => haystackTokens.has(term)).length;
      const termBonus = terms.some((term) => query.toLowerCase().includes(term.toLowerCase()))
        ? 3
        : 0;
      const recency = card.updatedAt || card.createdAt || "";
      return {
        card,
        score: overlap + termBonus + Math.min(1, terms.length / 10),
        recency,
        terms: terms.slice(0, 5)
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.recency.localeCompare(a.recency))
    .slice(0, maxHints);

  if (scored.length === 0) {
    return cards
      .filter((card) => card.deckType === "input" || card.cardType === "reading")
      .slice(0, maxHints)
      .map((card) => cardToRagHint(card));
  }

  return scored.map((item) => cardToRagHint(item.card, item.terms));
}

function cardToRagHint(card: StudyCard, terms?: string[]): CharacterRagHint {
  return {
    cardId: card.id,
    sourceSentence: card.sourceSentence || card.frontText,
    naturalMeaning: card.naturalTranslationKo,
    terms:
      terms ??
      [
        ...card.highlightMappings.map((mapping) => mapping.sourceText),
        ...card.vocabularyItems.map((item) => item.term)
      ].filter(Boolean).slice(0, 5)
  };
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s'-]/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
    .slice(0, 80);
}

function inferSourceFormat(input: UnknownRecord, data: UnknownRecord, spec: string): CharacterPreset["sourceFormat"] {
  if (spec === "chara_card_v3") {
    return "tavern_v3";
  }
  if (spec === "chara_card_v2") {
    return "tavern_v2";
  }
  if ("first_mes" in data || "mes_example" in data) {
    return "tavern_v1";
  }
  if ("risu" in input || "globalNote" in data || "postHistoryInstructions" in data) {
    return "risu";
  }
  return "unknown";
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function arrayOfText(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => text(item)).filter(Boolean)
    : [];
}
