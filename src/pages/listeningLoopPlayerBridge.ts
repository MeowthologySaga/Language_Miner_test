import { LIFE_MINER_BRIDGE_BASE_URL } from "../shared/lifeLogCapture";

const LISTENING_YOUTUBE_HOST_SOURCE = "lem-listening-youtube-host";
const LISTENING_YOUTUBE_PLAYER_SOURCE = "lem-listening-youtube-player";

export type YouTubePlayer = {
  loadVideoById(input: { videoId: string; startSeconds?: number; endSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setLoopRange?(input: { startSeconds: number; endSeconds: number; enabled: boolean }): void;
  unloadModule?(moduleName: string): void;
  setOption?(moduleName: string, option: string, value: unknown): void;
  destroy(): void;
};

type ListeningYouTubePlayerCommand =
  | {
      source: typeof LISTENING_YOUTUBE_HOST_SOURCE;
      type: "load";
      videoId: string;
      startSeconds: number;
      endSeconds?: number;
      loopEnabled: boolean;
    }
  | {
      source: typeof LISTENING_YOUTUBE_HOST_SOURCE;
      type: "set-loop-range";
      startSeconds: number;
      endSeconds: number;
      loopEnabled: boolean;
    }
  | {
      source: typeof LISTENING_YOUTUBE_HOST_SOURCE;
      type: "seek";
      seconds: number;
      allowSeekAhead: boolean;
    }
  | {
      source: typeof LISTENING_YOUTUBE_HOST_SOURCE;
      type: "play" | "pause" | "destroy";
    };

type ListeningYouTubePlayerMessage = {
  source?: string;
  type?: string;
  state?: number;
  currentTime?: number;
  code?: number;
};

export function createListeningYouTubePlayerBridge(
  frame: HTMLIFrameElement,
  options: {
    videoId: string;
    startSeconds: number;
    endSeconds: number;
    loopEnabled: boolean;
    onReady: () => void;
    onStateChange: (state: number) => void;
    onError: (code: number) => void;
  }
): YouTubePlayer {
  let isReady = false;
  let destroyed = false;
  let currentTime = options.startSeconds;
  let playerState = 0;
  let loopEnabled = options.loopEnabled;
  const pendingCommands: ListeningYouTubePlayerCommand[] = [];
  const playerOrigin = new URL(LIFE_MINER_BRIDGE_BASE_URL).origin;

  function postCommand(command: ListeningYouTubePlayerCommand) {
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

  function handleMessage(event: MessageEvent<ListeningYouTubePlayerMessage>) {
    if (event.origin !== playerOrigin || event.data?.source !== LISTENING_YOUTUBE_PLAYER_SOURCE) {
      return;
    }
    if (destroyed) {
      return;
    }

    if (event.data.type === "ready") {
      isReady = true;
      options.onReady();
      flushPendingCommands();
      return;
    }

    if (event.data.type === "time" && typeof event.data.currentTime === "number") {
      currentTime = event.data.currentTime;
      return;
    }

    if (event.data.type === "state" && typeof event.data.state === "number") {
      playerState = event.data.state;
      options.onStateChange(playerState);
      return;
    }

    if (event.data.type === "error") {
      options.onError(typeof event.data.code === "number" ? event.data.code : 0);
    }
  }

  window.addEventListener("message", handleMessage);
  frame.src = getListeningYouTubePlayerUrl(
    options.videoId,
    options.startSeconds,
    options.endSeconds,
    options.loopEnabled
  );

  return {
    loadVideoById(input) {
      postCommand({
        source: LISTENING_YOUTUBE_HOST_SOURCE,
        type: "load",
        videoId: input.videoId,
        startSeconds: input.startSeconds ?? 0,
        endSeconds: input.endSeconds,
        loopEnabled
      });
    },
    playVideo() {
      postCommand({ source: LISTENING_YOUTUBE_HOST_SOURCE, type: "play" });
    },
    pauseVideo() {
      postCommand({ source: LISTENING_YOUTUBE_HOST_SOURCE, type: "pause" });
    },
    getCurrentTime() {
      return currentTime;
    },
    getPlayerState() {
      return playerState;
    },
    seekTo(seconds, allowSeekAhead) {
      currentTime = seconds;
      postCommand({
        source: LISTENING_YOUTUBE_HOST_SOURCE,
        type: "seek",
        seconds,
        allowSeekAhead
      });
    },
    setLoopRange(input) {
      loopEnabled = input.enabled;
      postCommand({
        source: LISTENING_YOUTUBE_HOST_SOURCE,
        type: "set-loop-range",
        startSeconds: input.startSeconds,
        endSeconds: input.endSeconds,
        loopEnabled: input.enabled
      });
    },
    destroy() {
      destroyed = true;
      window.removeEventListener("message", handleMessage);
      try {
        frame.contentWindow?.postMessage(
          { source: LISTENING_YOUTUBE_HOST_SOURCE, type: "destroy" },
          playerOrigin
        );
      } catch {
        // The iframe may already be gone during Electron shutdown.
      }
      frame.removeAttribute("src");
    }
  };
}

export function getListeningYouTubePlayerUrl(
  videoId: string,
  startSeconds: number,
  endSeconds: number,
  loopEnabled: boolean
) {
  const url = new URL("/listening-youtube-player", LIFE_MINER_BRIDGE_BASE_URL);
  url.searchParams.set("videoId", videoId);
  url.searchParams.set("start", String(Math.max(0, Math.floor(startSeconds))));
  url.searchParams.set("end", String(Math.max(0, Math.ceil(endSeconds))));
  url.searchParams.set("loop", loopEnabled ? "1" : "0");
  return url.toString();
}

export function getYouTubePlayerErrorTitle(code: number) {
  if (code === 153) {
    return "앱 내부 재생이 막힌 영상입니다";
  }
  return "YouTube 재생 오류";
}

export function getYouTubePlayerErrorMessage(code: number) {
  if (code === 153) {
    return "YouTube 임베드 설정/출처 검증에서 거절된 영상입니다. 문장 루프와 저장은 계속 사용할 수 있고, 영상은 YouTube에서 열어 확인하세요.";
  }
  return `플레이어 오류 ${code}가 발생했습니다. 이 영상은 외부 YouTube에서 재생해 주세요.`;
}

export function suppressYouTubeCaptions(player: YouTubePlayer | null) {
  if (!player) {
    return;
  }

  for (const delay of [0, 250, 900, 1800]) {
    window.setTimeout(() => {
      try {
        player.unloadModule?.("captions");
        player.unloadModule?.("cc");
        player.setOption?.("captions", "track", {});
      } catch {
        // YouTube iframe modules are best-effort and vary by embed state.
      }
    }, delay);
  }
}
