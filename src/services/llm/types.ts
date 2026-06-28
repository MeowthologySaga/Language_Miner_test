import type {
  GeneratedCardData,
  GenerateCharacterChatReplyInput,
  GenerateLifeExpressionCardInput,
  GenerateReadingCardInput
} from "../../shared/types";

export interface LLMProvider {
  name: string;
  testConnection(): Promise<boolean>;
  generateReadingCard(input: GenerateReadingCardInput): Promise<GeneratedCardData>;
  generateLifeExpressionCard(
    input: GenerateLifeExpressionCardInput
  ): Promise<GeneratedCardData>;
  generateCharacterChatReply(input: GenerateCharacterChatReplyInput): Promise<string>;
}
