const params = new URLSearchParams(window.location.search);
const cartridgeId = params.get("cartridgeId") || "diamond-bistro";
const walletBalance = Number(params.get("walletBalance") || 0);

document.getElementById("cartridgeId").textContent = cartridgeId;
document.getElementById("walletBalance").textContent = Number.isFinite(walletBalance)
  ? Math.max(0, Math.floor(walletBalance)).toLocaleString()
  : "0";

window.parent?.postMessage(
  {
    source: "playzone-cartridge",
    type: "ready",
    cartridgeId
  },
  "*"
);
