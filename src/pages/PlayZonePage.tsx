import {
  Clock3,
  Download,
  Filter,
  Gamepad2,
  Play,
  Search,
  ShieldCheck,
  Star,
  UploadCloud
} from "lucide-react";
import { useMemo, useState } from "react";

type PlayZoneStatus = "installed" | "featured" | "update";
type PlayZoneCategory = "전체" | "설치됨" | "추천" | "학습" | "액션" | "스토리";
type PlayZoneRuntimeId = "cartridge";

type PlayZoneItem = {
  id: string;
  title: string;
  creator: string;
  category: Exclude<PlayZoneCategory, "전체" | "설치됨" | "추천">;
  status: PlayZoneStatus;
  summary: string;
  tags: string[];
  playTime: string;
  lastPlayed: string;
  progress: number;
  rating: number;
  coverClassName: string;
  cartridgeId?: string;
  entryUrl?: string;
  runtimeId?: PlayZoneRuntimeId;
};

type PlayZonePageProps = {
  walletBalance?: number;
};

const playZoneItems: PlayZoneItem[] = [
  {
    id: "diamond-bistro",
    title: "Diamond Bistro",
    creator: "LEM Prototype",
    category: "스토리",
    status: "installed",
    summary:
      "작은 식당에서 주문, 조리, 서빙, 수금을 돌리고 다이아로 레어 종업원을 영입하는 카페 경영 프로토타입.",
    tags: ["카페경영", "레어직원", "다이아"],
    playTime: "0분",
    lastPlayed: "방금 추가",
    progress: 8,
    rating: 4.7,
    coverClassName: "cover-bistro",
    cartridgeId: "diamond-bistro",
    entryUrl: "cartridges/diamond-bistro/game/index.html",
    runtimeId: "cartridge"
  },
  {
    id: "phrase-dungeon",
    title: "Phrase Dungeon",
    creator: "LEM Lab",
    category: "학습",
    status: "installed",
    summary: "짧은 영어 표현을 골라 방을 돌파하는 카드 기반 던전.",
    tags: ["표현", "복습", "턴제"],
    playTime: "42분",
    lastPlayed: "오늘",
    progress: 68,
    rating: 4.8,
    coverClassName: "cover-phrase"
  },
  {
    id: "shadow-listening",
    title: "Shadow Listening",
    creator: "Mina Workshop",
    category: "학습",
    status: "featured",
    summary: "음성 힌트를 듣고 문장을 재구성하는 리듬형 듣기 게임.",
    tags: ["듣기", "리듬", "문장"],
    playTime: "18분",
    lastPlayed: "어제",
    progress: 34,
    rating: 4.6,
    coverClassName: "cover-shadow"
  },
  {
    id: "word-rail",
    title: "Word Rail",
    creator: "CodexQA",
    category: "액션",
    status: "update",
    summary: "다가오는 단어를 품사별 레일로 빠르게 분류한다.",
    tags: ["단어", "속도", "분류"],
    playTime: "1.6시간",
    lastPlayed: "3일 전",
    progress: 82,
    rating: 4.3,
    coverClassName: "cover-rail"
  },
  {
    id: "dialogue-cafe",
    title: "Dialogue Cafe",
    creator: "Community Pack",
    category: "스토리",
    status: "installed",
    summary: "손님과 대화하며 자연스러운 응답을 고르는 스토리 팩.",
    tags: ["회화", "선택지", "캐릭터"],
    playTime: "2.4시간",
    lastPlayed: "지난주",
    progress: 56,
    rating: 4.9,
    coverClassName: "cover-cafe"
  },
  {
    id: "grammar-arena",
    title: "Grammar Arena",
    creator: "StudyForge",
    category: "액션",
    status: "featured",
    summary: "제한 시간 안에 문법 오류를 찾아 콤보를 쌓는다.",
    tags: ["문법", "콤보", "타임어택"],
    playTime: "0분",
    lastPlayed: "미플레이",
    progress: 0,
    rating: 4.2,
    coverClassName: "cover-arena"
  },
  {
    id: "memory-route",
    title: "Memory Route",
    creator: "Local Creator",
    category: "스토리",
    status: "installed",
    summary: "라이프 마이닝 문장을 길찾기 단서로 사용하는 탐험형 게임.",
    tags: ["라이프", "문맥", "탐험"],
    playTime: "26분",
    lastPlayed: "5일 전",
    progress: 21,
    rating: 4.5,
    coverClassName: "cover-route"
  }
];

const categories: PlayZoneCategory[] = ["전체", "설치됨", "추천", "학습", "액션", "스토리"];
const gameDeveloperAgentGuideFileName = "language-miner-game-agent-guide.md";
const gameDeveloperAgentGuideDocs = [
  {
    title: "Public Cartridge Guide",
    source: "public compact build",
    content:
      "Build cartridges as standalone iframe games. Keep game code independent from the main app and communicate through explicit host messages only."
  },
  {
    title: "Public Safety Rules",
    source: "public compact build",
    content:
      "Do not include API keys, tokens, private file paths, personal notes, user cards, logs, profiles, or private prompts in a cartridge package."
  },
  {
    title: "Diamond Bistro Demo",
    source: "public/cartridges/diamond-bistro/game",
    content:
      "The included Diamond Bistro runtime is a static demo cartridge for GitHub Pages. It does not read local files or app databases."
  }
];

export function PlayZonePage({ walletBalance = 0 }: PlayZonePageProps) {
  const [activeCategory, setActiveCategory] = useState<PlayZoneCategory>("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState(playZoneItems[0]?.id ?? "");
  const [statusMessage, setStatusMessage] = useState("");

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return playZoneItems.filter((item) => {
      if (activeCategory === "전체") {
        return matchesPlayZoneQuery(item, query);
      }
      if (
        activeCategory === "설치됨" &&
        (item.status === "installed" || item.status === "update")
      ) {
        return matchesPlayZoneQuery(item, query);
      }
      if (activeCategory === "추천" && item.status === "featured") {
        return matchesPlayZoneQuery(item, query);
      }
      return item.category === activeCategory && matchesPlayZoneQuery(item, query);
    });
  }, [activeCategory, searchQuery]);

  const selectedItem = filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0];

  function setCategory(category: PlayZoneCategory) {
    setActiveCategory(category);
    setStatusMessage("");
  }

  function handlePlay() {
    if (!selectedItem) {
      return;
    }
    if (selectedItem.runtimeId && selectedItem.entryUrl) {
      void openPlayZoneRuntimeWindow(selectedItem);
      return;
    }
    setStatusMessage(
      `${selectedItem.title} 실행은 Game Pack 런타임 연결 뒤 활성화됩니다. 현재는 팩 정보와 권한 상태를 확인할 수 있습니다.`
    );
  }

  function handleInstall() {
    if (!selectedItem) {
      return;
    }
    const action = selectedItem.status === "featured" ? "설치" : "업데이트";
    setStatusMessage(`${selectedItem.title} ${action}는 Pack validator 연결 뒤 활성화됩니다.`);
  }

  function downloadGameDeveloperAgentGuide() {
    const markdown = createGameDeveloperAgentGuideMarkdown();
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = gameDeveloperAgentGuideFileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusMessage(
      `게임 개발 에이전트 전달 파일을 다운로드했습니다: ${gameDeveloperAgentGuideFileName}`
    );
  }

  async function openPlayZoneRuntimeWindow(item: PlayZoneItem) {
    const runtimeId = item.runtimeId ?? "cartridge";
    const cartridgeId = item.cartridgeId ?? item.id;
    const entryUrl = item.entryUrl ?? "";
    try {
      const openedByHost = await window.localEnglishMiner?.app?.openPlayZoneRuntimeWindow?.({
        runtimeId,
        cartridgeId,
        title: item.title,
        entryUrl,
        walletBalance
      });
      if (openedByHost) {
        setStatusMessage(`${item.title}을(를) 새 게임 창으로 실행했습니다.`);
        return;
      }
    } catch {
      // Fall back to browser window.open for web previews.
    }

    const runtimeUrl = createPlayZoneRuntimeUrl({
      runtimeId,
      cartridgeId,
      title: item.title,
      entryUrl,
      walletBalance
    });
    const gameWindow = window.open(
      runtimeUrl,
      `lem-game-${cartridgeId}`,
      "popup,width=1280,height=820,resizable=yes,scrollbars=no"
    );

    if (!gameWindow) {
      setStatusMessage("새 게임 창이 차단되었습니다. 브라우저 또는 Electron 창 설정에서 팝업을 허용해 주세요.");
      return;
    }

    gameWindow.focus();
    setStatusMessage(`${item.title}을(를) 새 게임 창으로 실행했습니다.`);
  }

  return (
    <section className="play-zone-page">
      <aside className="play-zone-library">
        <div className="play-zone-search">
          <Search size={16} />
          <input
            type="search"
            placeholder="게임 검색"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setStatusMessage("");
            }}
          />
        </div>
        <div className="play-zone-filter-heading">
          <Filter size={15} />
          <span>라이브러리</span>
        </div>
        <div className="play-zone-category-list">
          {categories.map((category) => (
            <button
              className={activeCategory === category ? "active" : ""}
              key={category}
              type="button"
              onClick={() => setCategory(category)}
            >
              <span>{category}</span>
              <small>{getCategoryCount(category)}</small>
            </button>
          ))}
        </div>
        <div className="play-zone-import-box">
          <UploadCloud size={18} />
          <div>
            <strong>카트리지 폴더</strong>
            <span>.lemgame / zip / 개발 폴더</span>
          </div>
        </div>
        <button
          className="play-zone-author-kit"
          type="button"
          onClick={downloadGameDeveloperAgentGuide}
        >
          <Download size={18} />
          <span>
            <strong>에이전트 전달 파일</strong>
            <small>게임 제작 규칙, 보안, 다이아 계약</small>
          </span>
        </button>
      </aside>

      <div className="play-zone-content">
        {selectedItem ? (
          <div className="play-zone-hero">
            <div className={`play-zone-hero-art ${selectedItem.coverClassName}`}>
              <span>{selectedItem.category}</span>
              <strong>{selectedItem.title}</strong>
            </div>
            <div className="play-zone-hero-body">
              <div className="play-zone-title-line">
                <div>
                  <span className="play-zone-kicker">선택한 게임</span>
                  <h2>{selectedItem.title}</h2>
                </div>
                <span className="play-zone-rating">
                  <Star size={15} />
                  {selectedItem.rating.toFixed(1)}
                </span>
              </div>
              <p>{selectedItem.summary}</p>
              <div className="play-zone-tags">
                {selectedItem.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div className="play-zone-actions">
                <button className="button primary" type="button" onClick={handlePlay}>
                  <Play size={16} />
                  플레이
                </button>
                <button className="button secondary" type="button" onClick={handleInstall}>
                  <Download size={16} />
                  {selectedItem.status === "featured" ? "설치" : "업데이트"}
                </button>
              </div>
              {statusMessage ? <p className="play-zone-status">{statusMessage}</p> : null}
            </div>
          </div>
        ) : (
          <div className="play-zone-empty-selection">
            <strong>검색 결과가 없습니다.</strong>
            <span>검색어를 지우거나 다른 카테고리를 선택하세요.</span>
          </div>
        )}

        <div className="play-zone-shelf-heading">
          <div>
            <span className="play-zone-kicker">게임 팩</span>
            <h3>{activeCategory}</h3>
          </div>
          <span>{filteredItems.length}개</span>
        </div>
        <div className="play-zone-grid">
          {filteredItems.map((item) => (
            <button
              className={item.id === selectedItem?.id ? "play-zone-card active" : "play-zone-card"}
              key={item.id}
              type="button"
              onClick={() => {
                setSelectedId(item.id);
                setStatusMessage("");
              }}
            >
              <span className={`play-zone-card-cover ${item.coverClassName}`}>
                <span>{getStatusLabel(item.status)}</span>
              </span>
              <span className="play-zone-card-body">
                <strong>{item.title}</strong>
                <small>{item.creator}</small>
                <span className="play-zone-progress">
                  <span style={{ width: `${item.progress}%` }} />
                </span>
              </span>
            </button>
          ))}
          {filteredItems.length === 0 ? (
            <div className="play-zone-empty-result">검색 결과가 없습니다.</div>
          ) : null}
        </div>
      </div>

      <aside className="play-zone-detail">
        <div className="play-zone-detail-header">
          <Gamepad2 size={18} />
          <h2>팩 정보</h2>
        </div>
        {selectedItem ? (
          <>
            <div className="play-zone-detail-cover">
              <div className={selectedItem.coverClassName}>
                <span>{selectedItem.title}</span>
              </div>
            </div>
            <dl className="play-zone-facts">
              <div>
                <dt>제작자</dt>
                <dd>{selectedItem.creator}</dd>
              </div>
              <div>
                <dt>플레이 시간</dt>
                <dd>{selectedItem.playTime}</dd>
              </div>
              <div>
                <dt>최근 실행</dt>
                <dd>{selectedItem.lastPlayed}</dd>
              </div>
              <div>
                <dt>진행률</dt>
                <dd>{selectedItem.progress}%</dd>
              </div>
            </dl>
            <div className="play-zone-safety">
              <ShieldCheck size={17} />
              <div>
                <strong>샌드박스 실행</strong>
                <span>게임 코드는 실행 버튼을 누른 뒤 별도 런타임으로 로딩</span>
              </div>
            </div>
            <div className="play-zone-activity">
              <div>
                <Clock3 size={15} />
                <span>최근 활동</span>
              </div>
              <p>{selectedItem.lastPlayed}에 마지막으로 열었습니다.</p>
            </div>
          </>
        ) : (
          <div className="play-zone-detail-empty">
            <strong>선택된 팩 없음</strong>
            <span>현재 필터에 맞는 Game Pack이 없습니다.</span>
          </div>
        )}
      </aside>
    </section>
  );
}

function createPlayZoneRuntimeUrl(input: {
  runtimeId: PlayZoneRuntimeId;
  cartridgeId: string;
  title: string;
  entryUrl: string;
  walletBalance: number;
}) {
  const runtimeUrl = new URL(window.location.href);
  runtimeUrl.hash = "";
  runtimeUrl.search = "";
  runtimeUrl.searchParams.set("playZoneRuntime", input.runtimeId);
  runtimeUrl.searchParams.set("cartridgeId", input.cartridgeId);
  runtimeUrl.searchParams.set("title", input.title);
  runtimeUrl.searchParams.set("entryUrl", input.entryUrl);
  runtimeUrl.searchParams.set(
    "walletBalance",
    String(Math.max(0, Math.floor(input.walletBalance)))
  );
  return runtimeUrl.toString();
}

function getCategoryCount(category: PlayZoneCategory) {
  if (category === "전체") {
    return playZoneItems.length;
  }
  if (category === "설치됨") {
    return playZoneItems.filter((item) => item.status === "installed" || item.status === "update")
      .length;
  }
  if (category === "추천") {
    return playZoneItems.filter((item) => item.status === "featured").length;
  }
  return playZoneItems.filter((item) => item.category === category).length;
}

function matchesPlayZoneQuery(item: PlayZoneItem, query: string) {
  if (!query) {
    return true;
  }
  return [item.title, item.creator, item.category, item.summary, ...item.tags]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function getStatusLabel(status: PlayZoneStatus) {
  if (status === "installed") {
    return "설치됨";
  }
  if (status === "update") {
    return "업데이트";
  }
  return "추천";
}

function createGameDeveloperAgentGuideMarkdown() {
  const sections = gameDeveloperAgentGuideDocs.map(
    (doc) => `## ${doc.title}\n\nSource: \`${doc.source}\`\n\n${doc.content.trim()}`
  );

  return [
    "# Language Miner Game Developer Agent Guide",
    "",
    "이 파일은 게임 개발 에이전트에게 그대로 전달하기 위한 제작 규칙 모음입니다.",
    "에이전트는 Game Pack을 만들 때 아래 문서의 manifest, 권한, 보안, 다이아 사용 계약을 따라야 합니다.",
    "",
    "## Quick Instruction For The Agent",
    "",
    "- 목표는 억지 학습게임이 아니라, 장르를 제한하지 않는 독립적인 게임으로 먼저 재미있는 게임 루프를 만드는 것이다.",
    "- PlayZone Game Pack은 모바일 캐주얼로 제한하지 않는다. 캐주얼, 인디, AAA식 액션/RPG/전략/시뮬레이션/탐험/스토리 게임 모두 가능하다.",
    "- 학습 요소를 제거했을 때 게임으로서의 재미가 무너지면 방향이 틀린 것이다. 게임 화면, 보상, 상점, 성장 구조가 학습 도구처럼 보이면 안 된다.",
    "- 학습은 주로 게임 바깥에서 다이아를 얻는 루프이고, 게임 안의 다이아는 메타 보상/프리미엄 재화 레이어로 사용한다.",
    "- 퀴즈, 암기, 문법 문제, 듣기 테스트가 기본 진행을 막는 핵심 루프가 되면 안 된다.",
    "- 게임 제작은 별도 프로젝트/폴더에서 진행할 수 있어야 한다. LanguageMiner 앱 소스를 수정하거나 import하지 말고 독립 Game Pack 카트리지 폴더를 만든다.",
    "- 개발 중에는 `game/index.html` 직접 실행 또는 로컬 정적 서버 실행으로 게임 화면, 조작, 보상, 상점, 저장 흐름을 자체 확인할 수 있어야 한다.",
    "- 앱 Host API가 없는 환경에서는 pack 내부 mock host adapter를 사용한다. 지갑/다이아/저장/카드 접근은 mock 경계로 흉내 내고, 앱 통합 시 실제 Host API bridge로 교체 가능하게 만든다.",
    "- README.md에는 앱 없이 자체 실행하는 방법, 권장 로컬 서버 명령, mock Host API의 한계, 앱 통합 시 교체할 adapter 경계를 적는다.",
    "- 플레이존 라이브러리는 런처 역할만 한다. 게임은 실행 버튼을 누른 뒤 새 창 또는 별도 런타임 URL에서 로딩되어야 하며, 앱 시작 시 무거운 게임 코드와 에셋을 로딩하면 안 된다.",
    "- 게임 코드는 lazy/dynamic import, iframe, 또는 별도 번들처럼 메인 앱과 분리 가능한 구조로 설계한다. 게임 종료/새로고침/오류가 메인 학습 앱을 멈추게 만들면 안 된다.",
    "- `contentType: \"game_pack\"`인 Pack을 만든다.",
    "- 표준 배포 확장자는 `.lemgame`을 사용한다. 내부는 zip 호환이며, 하나의 자기완결 PlayZone 카트리지로 취급한다.",
    "- 개발 중에는 `.zip`이나 압축 해제 폴더도 허용하지만, 최종 전달물은 한 덩어리 카트리지로 묶을 수 있어야 한다.",
    "- 에뮬레이터 ROM 폴더처럼 동작하게 설계한다. 앱은 사용자가 지정한 카트리지 폴더를 참조하고, 시작 시에는 manifest/썸네일/hash 같은 메타데이터만 스캔한다.",
    "- 실제 게임 코드와 무거운 에셋은 사용자가 실행 버튼을 눌렀을 때만 로딩하거나 검증된 runtime cache에 풀어야 한다.",
    "- 저장 데이터는 카트리지 파일 밖에 둔다. 게임 등록을 제거하거나 카트리지 파일이 이동되어도 save data는 기본 삭제하지 않는다.",
    "- 외부 UGC는 sandboxed iframe/html runtime을 기본으로 한다. React/native runtime은 빌트인 또는 신뢰된 pack에만 허용한다.",
    "- 기본은 오프라인 지향이다. 네트워크 접근은 manifest가 명시적으로 요청할 때만 허용한다.",
    "- 설치 상태와 신뢰 상태를 분리해 보고한다: built-in, scanned, trusted, online-permission, warning, blocked.",
    "- `manifest.json`, `README.md`, `security-report.md`를 포함한다.",
    "- 모든 경로는 pack 내부 상대 경로만 사용한다.",
    "- 외부 네트워크, 파일 시스템, 지갑, 카드 접근은 manifest permissions에 명시한다.",
    "- 앱에서 얻은 다이아는 게임 안에서 시간 단축, 희귀/한정 아이템, 스킨, 장비, 추가 콘텐츠, 편의 기능, 프리미엄 선택지에 쓰는 재화처럼 설계할 수 있다.",
    "- 다이아 차감은 직접 구현하지 말고 Host API 계약에 맞춘 mock 또는 호출 코드만 작성한다.",
    "- 다이아를 실제 돈, 환전, 투자, 수익, 랜덤박스, 도박형 보상처럼 표현하거나 사용하지 않는다.",
    "- iframe/html 방식은 sandbox와 postMessage Host API를 전제로 만든다.",
    "- 결과 요약에는 생성 파일, 권한, 다이아 액션, 현재 앱에서 가능한 것과 추가 구현이 필요한 것을 적는다.",
    "",
    ...sections
  ].join("\n");
}
