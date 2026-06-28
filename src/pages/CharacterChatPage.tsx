import {
  Bot,
  Download,
  FileJson,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Upload
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { LLMProvider } from "../services/llm/types";
import {
  CHARACTER_PRESETS_STORAGE_KEY,
  CHARACTER_SESSION_STORAGE_KEY,
  createDefaultCharacterPreset,
  exportCharacterPresetAsTavernV2,
  parseCharacterPresetJson,
  replaceCharacterMacros,
  selectCharacterRagHints
} from "../shared/characterCards";
import { randomId } from "../shared/ids";
import type { CharacterChatMessage, CharacterPreset, StudyCard } from "../shared/types";

type CharacterChatPageProps = {
  cards: StudyCard[];
  provider: LLMProvider;
};

type CharacterSessions = Record<string, CharacterChatMessage[]>;

export function CharacterChatPage({ cards, provider }: CharacterChatPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [presets, setPresets] = useState<CharacterPreset[]>(() => readCharacterPresets());
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [sessions, setSessions] = useState<CharacterSessions>(() => readCharacterSessions());
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);

  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) ?? presets[0];
  const messages = selectedPreset ? getSessionMessages(sessions, selectedPreset) : [];
  const previewHints = useMemo(
    () => selectCharacterRagHints(cards, draft || messages.at(-1)?.content || "", 3),
    [cards, draft, messages]
  );

  useEffect(() => {
    if (!selectedPresetId && presets[0]) {
      setSelectedPresetId(presets[0].id);
    }
  }, [presets, selectedPresetId]);

  function updatePresets(next: CharacterPreset[]) {
    setPresets(next);
    localStorage.setItem(CHARACTER_PRESETS_STORAGE_KEY, JSON.stringify(next));
  }

  function updateSessions(next: CharacterSessions) {
    setSessions(next);
    localStorage.setItem(CHARACTER_SESSION_STORAGE_KEY, JSON.stringify(next));
  }

  function updateSelectedPreset(patch: Partial<CharacterPreset>) {
    if (!selectedPreset) {
      return;
    }
    const updated = {
      ...selectedPreset,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    updatePresets(presets.map((preset) => (preset.id === updated.id ? updated : preset)));
  }

  function createPreset() {
    const now = new Date().toISOString();
    const preset: CharacterPreset = {
      ...createDefaultCharacterPreset(now),
      id: randomId(),
      name: "New Character",
      description: "",
      personality: "",
      scenario: "",
      firstMessage: "Hey. What's up?",
      messageExample: "",
      alternateGreetings: [],
      tags: [],
      sourceFormat: "local",
      createdAt: now,
      updatedAt: now
    };
    updatePresets([preset, ...presets]);
    updateSessions({
      ...sessions,
      [preset.id]: initialMessagesFromPreset(preset)
    });
    setSelectedPresetId(preset.id);
  }

  function deletePreset() {
    if (!selectedPreset || presets.length <= 1) {
      setError("캐릭터는 최소 1개가 필요합니다.");
      return;
    }
    const nextPresets = presets.filter((preset) => preset.id !== selectedPreset.id);
    const nextSessions = { ...sessions };
    delete nextSessions[selectedPreset.id];
    updatePresets(nextPresets);
    updateSessions(nextSessions);
    setSelectedPresetId(nextPresets[0]?.id ?? "");
  }

  function resetChat() {
    if (!selectedPreset) {
      return;
    }
    updateSessions({
      ...sessions,
      [selectedPreset.id]: initialMessagesFromPreset(selectedPreset)
    });
    setStatus("대화를 초기화했습니다.");
  }

  async function importPreset(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }
    setError("");
    setStatus("");
    try {
      const imported = parseCharacterPresetJson(await file.text());
      updatePresets([imported, ...presets]);
      updateSessions({
        ...sessions,
        [imported.id]: initialMessagesFromPreset(imported)
      });
      setSelectedPresetId(imported.id);
      setStatus(`${imported.name} 캐릭터카드를 가져왔습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "캐릭터카드를 가져오지 못했습니다.");
    }
  }

  function exportPreset() {
    if (!selectedPreset) {
      return;
    }
    const data = JSON.stringify(exportCharacterPresetAsTavernV2(selectedPreset), null, 2);
    const blob = new Blob([data], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${sanitizeFileName(selectedPreset.name)}.character.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function sendMessage() {
    const content = draft.trim();
    if (!selectedPreset || !content || isSending) {
      return;
    }
    setDraft("");
    setStatus("");
    setError("");
    setIsSending(true);

    const now = new Date().toISOString();
    const userMessage: CharacterChatMessage = {
      id: randomId(),
      role: "user",
      content,
      createdAt: now
    };
    const previousMessages = getSessionMessages(sessions, selectedPreset);
    const optimisticMessages = [...previousMessages, userMessage];
    updateSessions({
      ...sessions,
      [selectedPreset.id]: optimisticMessages
    });

    try {
      const ragHints = selectCharacterRagHints(
        cards,
        [content, previousMessages.slice(-3).map((message) => message.content).join(" ")].join(" "),
        4
      );
      const reply = await provider.generateCharacterChatReply({
        character: selectedPreset,
        messages: previousMessages,
        userMessage: content,
        ragHints,
        learnerLevel: "intermediate"
      });
      const characterMessage: CharacterChatMessage = {
        id: randomId(),
        role: "character",
        content: replaceCharacterMacros(reply, selectedPreset.name),
        createdAt: new Date().toISOString()
      };
      updateSessions({
        ...sessions,
        [selectedPreset.id]: [...optimisticMessages, characterMessage]
      });
      setStatus(ragHints.length ? `카드 힌트 ${ragHints.length}개를 조용히 참고했습니다.` : "");
    } catch (caught) {
      updateSessions({
        ...sessions,
        [selectedPreset.id]: optimisticMessages
      });
      setError(caught instanceof Error ? caught.message : "캐릭터 응답 생성에 실패했습니다.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="character-chat-page">
      <aside className="character-preset-panel">
        <div className="character-panel-heading">
          <div>
            <h2>Character Chat</h2>
            <p>캐릭터 컨셉 우선, 문장카드는 자연스러운 보조 힌트로만 사용합니다.</p>
          </div>
          <button className="mini-button" type="button" onClick={createPreset}>
            <Plus size={14} />
            새 캐릭터
          </button>
        </div>

        <div className="character-preset-list">
          {presets.map((preset) => (
            <button
              className={preset.id === selectedPreset?.id ? "active" : ""}
              key={preset.id}
              type="button"
              onClick={() => setSelectedPresetId(preset.id)}
            >
              <Bot size={18} />
              <span>
                <strong>{preset.name}</strong>
                <small>{preset.sourceFormat ?? "local"}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="character-import-row">
          <button className="button secondary" type="button" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} />
            JSON 가져오기
          </button>
          <button className="button secondary" type="button" onClick={exportPreset}>
            <Download size={16} />
            V2 내보내기
          </button>
          <input ref={fileInputRef} accept=".json,application/json" type="file" onChange={importPreset} />
        </div>

        <section className="character-editor">
          <label>
            <span>이름</span>
            <input
              value={selectedPreset?.name ?? ""}
              onChange={(event) => updateSelectedPreset({ name: event.target.value })}
            />
          </label>
          <label>
            <span>설명</span>
            <textarea
              value={selectedPreset?.description ?? ""}
              onChange={(event) => updateSelectedPreset({ description: event.target.value })}
            />
          </label>
          <label>
            <span>성격</span>
            <textarea
              value={selectedPreset?.personality ?? ""}
              onChange={(event) => updateSelectedPreset({ personality: event.target.value })}
            />
          </label>
          <label>
            <span>상황</span>
            <textarea
              value={selectedPreset?.scenario ?? ""}
              onChange={(event) => updateSelectedPreset({ scenario: event.target.value })}
            />
          </label>
          <label>
            <span>첫 메시지</span>
            <textarea
              value={selectedPreset?.firstMessage ?? ""}
              onChange={(event) => updateSelectedPreset({ firstMessage: event.target.value })}
            />
          </label>
        </section>
      </aside>

      <section className="character-chat-panel">
        <header className="character-chat-header">
          <div>
            <h2>
              <MessageCircle size={20} />
              {selectedPreset?.name ?? "Character"}
            </h2>
            <p>{provider.name} · 최근 카드 {cards.length}개 중 관련 표현만 짧게 참고</p>
          </div>
          <div className="character-chat-actions">
            <button className="button secondary" type="button" onClick={resetChat}>
              <RefreshCw size={16} />
              대화 초기화
            </button>
            <button className="button secondary" type="button" onClick={deletePreset}>
              <Trash2 size={16} />
              삭제
            </button>
          </div>
        </header>

        {status ? <p className="success-text">{status}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        <div className="character-message-list">
          {messages.map((message) => (
            <article className={`character-message ${message.role}`} key={message.id}>
              <strong>{message.role === "character" ? selectedPreset?.name : "Me"}</strong>
              <p>{replaceCharacterMacros(message.content, selectedPreset?.name ?? "Character")}</p>
            </article>
          ))}
          {isSending ? (
            <article className="character-message character pending">
              <strong>{selectedPreset?.name}</strong>
              <p>
                <Loader2 className="spin inline-icon" size={15} />
                typing...
              </p>
            </article>
          ) : null}
        </div>

        <div className="character-rag-strip">
          <FileJson size={16} />
          <span>이번 입력에 가까운 카드 힌트</span>
          {previewHints.length ? (
            previewHints.map((hint) => (
              <small key={hint.cardId}>{hint.terms[0] || hint.sourceSentence.slice(0, 28)}</small>
            ))
          ) : (
            <small>없음</small>
          )}
        </div>

        <form
          className="character-chat-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          <textarea
            placeholder="캐릭터에게 말하기..."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
          />
          <button className="button primary" disabled={!draft.trim() || isSending} type="submit">
            {isSending ? <Loader2 className="spin" size={17} /> : <Send size={17} />}
            보내기
          </button>
        </form>
      </section>
    </div>
  );
}

function readCharacterPresets() {
  try {
    const saved = localStorage.getItem(CHARACTER_PRESETS_STORAGE_KEY);
    const parsed = saved ? (JSON.parse(saved) as CharacterPreset[]) : [];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // Use default below.
  }
  return [createDefaultCharacterPreset()];
}

function readCharacterSessions(): CharacterSessions {
  try {
    const saved = localStorage.getItem(CHARACTER_SESSION_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as CharacterSessions) : {};
  } catch {
    return {};
  }
}

function getSessionMessages(sessions: CharacterSessions, preset: CharacterPreset) {
  return sessions[preset.id]?.length ? sessions[preset.id] : initialMessagesFromPreset(preset);
}

function initialMessagesFromPreset(preset: CharacterPreset): CharacterChatMessage[] {
  if (!preset.firstMessage.trim()) {
    return [];
  }
  return [
    {
      id: `${preset.id}-first-message`,
      role: "character",
      content: preset.firstMessage,
      createdAt: preset.createdAt
    }
  ];
}

function sanitizeFileName(value: string) {
  return (value || "character").replace(/[\\/:*?"<>|]+/g, "-").trim();
}
