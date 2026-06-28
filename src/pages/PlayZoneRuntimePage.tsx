import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import "./PlayZoneRuntimePage.css";

type PlayZoneRuntimeId = "cartridge";

type PlayZoneRuntimePayload = {
  runtimeId: PlayZoneRuntimeId | null;
  cartridgeId: string;
  title: string;
  entryUrl: string | null;
};

export function PlayZoneRuntimePage() {
  const payload = useMemo(() => readRuntimePayload(), []);
  const [walletBalance, setWalletBalance] = useState(() => readInitialWalletBalance());
  const [frameLoaded, setFrameLoaded] = useState(false);

  useEffect(() => {
    document.title = payload.title ? `${payload.title} - PlayZone` : "PlayZone Game";
  }, [payload.title]);

  useEffect(() => {
    let cancelled = false;

    void window.localEnglishMiner?.wallet
      ?.get()
      .then((wallet) => {
        if (!cancelled) {
          setWalletBalance(wallet.balance);
        }
      })
      .catch(() => {
        // The query value is a safe fallback for web previews without the Electron bridge.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const frameUrl = useMemo(() => {
    if (!payload.entryUrl) {
      return null;
    }
    return createCartridgeFrameUrl(payload.entryUrl, payload.cartridgeId, walletBalance);
  }, [payload.cartridgeId, payload.entryUrl, walletBalance]);

  if (payload.runtimeId !== "cartridge" || !frameUrl) {
    return (
      <main className="play-zone-runtime-window">
        <div className="play-zone-runtime-window-error">
          <strong>Playable cartridge entry was not found.</strong>
          <button type="button" onClick={closeGameWindow}>
            Close
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="play-zone-runtime-window">
      {!frameLoaded ? (
        <div className="play-zone-runtime-window-loading">
          <Loader2 className="spin" size={24} />
          <span>Loading cartridge...</span>
        </div>
      ) : null}
      <iframe
        className="play-zone-runtime-frame"
        title={payload.title}
        src={frameUrl}
        sandbox="allow-scripts allow-pointer-lock allow-popups"
        referrerPolicy="no-referrer"
        onLoad={() => setFrameLoaded(true)}
      />
    </main>
  );
}

function readRuntimePayload(): PlayZoneRuntimePayload {
  if (typeof window === "undefined") {
    return {
      runtimeId: null,
      cartridgeId: "",
      title: "PlayZone Game",
      entryUrl: null
    };
  }

  const params = new URLSearchParams(window.location.search);
  const runtimeId = params.get("playZoneRuntime") === "cartridge" ? "cartridge" : null;
  const cartridgeId = sanitizeToken(params.get("cartridgeId") ?? "external-cartridge");
  const title = sanitizeTitle(params.get("title") ?? "PlayZone Game");
  const entryUrl = readSafeEntryUrl(params.get("entryUrl"));

  return {
    runtimeId,
    cartridgeId,
    title,
    entryUrl
  };
}

function readInitialWalletBalance() {
  if (typeof window === "undefined") {
    return 0;
  }
  const value = Number(new URLSearchParams(window.location.search).get("walletBalance"));
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function readSafeEntryUrl(value: string | null) {
  if (!value || typeof window === "undefined") {
    return null;
  }

  try {
    const parsed = new URL(value, window.location.href);
    if (parsed.protocol === "file:") {
      return parsed.toString();
    }
    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.origin === window.location.origin
    ) {
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function createCartridgeFrameUrl(entryUrl: string, cartridgeId: string, walletBalance: number) {
  const url = new URL(entryUrl, window.location.href);
  url.searchParams.set("cartridgeId", cartridgeId);
  url.searchParams.set("walletBalance", String(Math.max(0, Math.floor(walletBalance))));
  url.searchParams.set("playZoneHost", "local-english-miner");
  return url.toString();
}

function sanitizeToken(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
  return normalized || "external-cartridge";
}

function sanitizeTitle(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.slice(0, 80) || "PlayZone Game";
}

function closeGameWindow() {
  window.close();
}
