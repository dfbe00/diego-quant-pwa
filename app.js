import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://ytzvufrmenpqjelkbthm.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0enZ1ZnJtZW5wcWplbGtidGhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1ODY3MzYsImV4cCI6MjExMDE2MjczNn0.BknsVFktOD0Ei4wTQgjEuR4f8xrjlZbtornw7wt_gkc";

const OWNER_EMAIL = "dfbe00@gmail.com";
const APP_PUBLIC_URL = "https://dfbe00.github.io/diego-quant-pwa/";
const USD_TO_CLP = 978;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentSection = "dashboard";
let displayCurrency = "USD";
let watchlistData = [];
let signalsData = [];
let chatData = [];
let marketCatalog = [];
let customSearchResults = [];
let exploreMainFilter = "ALL";
let exploreSubFilter = "ALL";
let optionsChainData = { underlying: "NVDA", underlyingPrice: 0, contracts: [] };
let optionsTypeFilter = "ALL";
let selectedModalAsset = null;
let deferredInstallPrompt = null;
let ttsEnabled = false;
let isRecordingVoice = false;
let speechRecognizer = null;
let mediaRecorder = null;
let audioChunks = [];

let uiConfig = {
  theme_accent: "purple",
  currency: "USD",
  show_news_section: false,
  show_portfolio_chart: true,
  show_buying_power: true,
  show_positions: true,
  show_quick_signals: true,
  custom_sections: [],
};

let portfolioState = {
  account: {
    equity: 100000.69,
    cash: 100000.69,
    buying_power: 200001.38,
    options_buying_power: 100000.69,
    last_equity: 100000.69,
    status: "ACTIVE",
  },
  positions: [],
  orders: [],
  history: null,
};

function fmtMoney(amountUSD, compact = false) {
  const num = Number(amountUSD || 0);
  if (displayCurrency === "CLP") {
    const clp = Math.round(num * USD_TO_CLP);
    return "CLP $" + clp.toLocaleString("es-CL");
  }
  return (
    "US $" +
    num.toLocaleString("en-US", {
      minimumFractionDigits: compact ? 0 : 2,
      maximumFractionDigits: compact ? 0 : 2,
    })
  );
}

function showToast(msg, type = "neutral") {
  const banner = document.getElementById("toast-banner");
  if (!banner) return;
  const styles =
    type === "rose"
      ? "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-zesty-red-500"
      : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200";
  banner.className = `mx-4 mt-4 p-3 rounded-lg text-xs font-medium border flex items-center justify-between ${styles}`;
  banner.innerHTML = `<span>${msg}</span><button onclick="this.parentElement.classList.add('hidden')" class="ml-3 text-slate-400 hover:text-slate-600">✕</button>`;
  banner.classList.remove("hidden");
  setTimeout(() => banner.classList.add("hidden"), 5000);
}

async function sendLocalPushNotification(title, body, tab = "signals") {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon: "./icon.svg",
        badge: "./icon.svg",
        data: { tab },
      });
      return;
    }
  } catch {}
  new Notification(title, { body, icon: "./icon.svg" });
}

window.requestPushNotificationPermission = async () => {
  if (!("Notification" in window)) {
    showToast("Tu navegador no soporta notificaciones push.", "rose");
    return;
  }
  const perm = await Notification.requestPermission();
  updatePushButtonUI();
  if (perm === "granted") {
    showToast("Notificaciones activadas.");
    await sendLocalPushNotification("Zesty", "Recibirás avisos cuando tengas una orden por confirmar.");
  }
};

function updatePushButtonUI() {
  const lbl = document.getElementById("push-perm-label");
  if (!lbl || !("Notification" in window)) return;
  lbl.textContent = Notification.permission === "granted" ? "Notificaciones activas" : "Notificaciones";
}

window.installOrDownloadDesktopApp = async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === "accepted") {
      deferredInstallPrompt = null;
      return;
    }
  }
  const batContent = [
    "@echo off",
    "title Zesty Quant",
    'if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" (',
    `  start "" "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" --app=${APP_PUBLIC_URL}`,
    "  exit",
    ")",
    'if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" (',
    `  start "" "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" --app=${APP_PUBLIC_URL}`,
    "  exit",
    ")",
    `start "" "${APP_PUBLIC_URL}"`,
  ].join("\r\n");

  const blob = new Blob([batContent], { type: "application/bat" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "Zesty_Escritorio.bat";
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast("Se descargó el acceso directo para computador.");
};

async function callEngine(action, payload = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sesión no iniciada");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/trading-engine`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || `Error HTTP ${res.status}`);
  }
  return data;
}

window.switchSection = (secName) => {
  currentSection = secName;
  const allSecs = ["dashboard", "explore", "options", "radar", "signals", "chat", "news", "orders", "leverage", "settings"];
  allSecs.forEach((s) => {
    const el = document.getElementById(`sec-${s}`);
    if (el) el.classList.toggle("hidden", s !== secName);
  });

  document.querySelectorAll(".sidebar-link").forEach((link) => {
    const active = link.getAttribute("data-nav") === secName;
    if (link.id === "sidebar-news-item" && !uiConfig.show_news_section) return;
    link.className = active
      ? "sidebar-link flex items-center justify-between px-4 py-2.5 text-sm transition-colors border-l-5 border-zesty-purple-500 bg-zesty-purple-50 dark:bg-zesty-purple-950/20 text-slate-800 dark:text-slate-200 font-medium"
      : "sidebar-link flex items-center justify-between px-4 py-2.5 text-sm transition-colors border-l-5 border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60";
  });

  document.querySelectorAll(".mob-nav-btn").forEach((btn) => {
    const active = btn.getAttribute("data-nav") === secName;
    btn.classList.toggle("text-zesty-purple-500", active);
    btn.classList.toggle("text-slate-400", !active);
  });

  document.getElementById("app-sidebar")?.classList.add("hidden");
  document.getElementById("sidebar-backdrop")?.classList.add("hidden");

  if (secName === "explore" && marketCatalog.length === 0) loadExploreCatalog();
  if (secName === "options" && optionsChainData.contracts.length === 0) window.loadOptionsChain("NVDA");
  if (secName === "news") window.loadMarketNews();
  if (secName === "chat") {
    const box = document.getElementById("chat-messages-box");
    if (box) box.scrollTop = box.scrollHeight;
  }
};

function applyDynamicUiConfig() {
  if (!uiConfig) return;

  const newsLi = document.getElementById("sidebar-news-item");
  if (newsLi) newsLi.classList.toggle("hidden", !uiConfig.show_news_section);

  document.getElementById("card-portfolio-chart")?.classList.toggle("hidden", uiConfig.show_portfolio_chart === false);
  document.getElementById("card-buying-power")?.classList.toggle("hidden", uiConfig.show_buying_power === false);
  document.getElementById("card-positions")?.classList.toggle("hidden", uiConfig.show_positions === false);

  const customContainer = document.getElementById("dashboard-custom-sections");
  const sidebarCustomWrap = document.getElementById("sidebar-custom-wrapper");
  const sidebarCustomList = document.getElementById("sidebar-custom-list");

  const customSections = Array.isArray(uiConfig.custom_sections) ? uiConfig.custom_sections : [];
  if (customSections.length === 0 && !uiConfig.show_news_section) {
    if (customContainer) customContainer.innerHTML = "";
    if (sidebarCustomWrap) sidebarCustomWrap.classList.add("hidden");
  } else {
    if (sidebarCustomWrap) sidebarCustomWrap.classList.toggle("hidden", customSections.length === 0);
    if (sidebarCustomList) {
      sidebarCustomList.innerHTML = customSections
        .map(
          (c) => `
          <a href="#dashboard" onclick="window.switchSection('dashboard'); return false;" class="flex items-center px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60">
            <span class="ml-3">${c.title}</span>
          </a>`
        )
        .join("");
    }

    let html = "";
    if (uiConfig.show_news_section) {
      html += `
      <div class="border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-6 bg-zesty-purple-50 dark:bg-slate-900/20 flex items-center justify-between">
        <div>
          <h3 class="text-sm font-bold text-slate-900 dark:text-white">Noticias del mercado</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Sección habilitada desde el asistente</p>
        </div>
        <button onclick="window.switchSection('news')" class="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-xs font-medium">
          Ver noticias
        </button>
      </div>`;
    }

    html += customSections
      .map(
        (c) => `
      <div class="border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-6 bg-zesty-purple-50 dark:bg-slate-900/20 space-y-3">
        <div>
          <h3 class="text-sm sm:text-base font-bold text-slate-900 dark:text-white">${c.title}</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">${c.subtitle || ""}</p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          ${(c.items || [])
            .map(
              (it) => `
            <div class="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div class="text-xs text-slate-500">${it.label || ""}</div>
              <div class="text-sm font-bold text-slate-900 dark:text-white mt-0.5">${it.value || ""}</div>
            </div>`
            )
            .join("")}
        </div>
      </div>`
      )
      .join("");

    if (customContainer) customContainer.innerHTML = html;
  }
}

function renderPortfolio() {
  const acc = portfolioState.account || {};
  const equity = Number(acc.equity || 100000.69);
  const lastEquity = Number(acc.last_equity || equity);
  const dayDiff = equity - lastEquity;
  const dayPct = lastEquity > 0 ? (dayDiff / lastEquity) * 100 : 0;

  document.getElementById("portfolio-currency-label").textContent =
    displayCurrency === "CLP" ? "Saldo total en 🇨🇱 CLP" : "Saldo total en 🇺🇸 USD";

  document.getElementById("portfolio-equity").textContent = fmtMoney(equity);
  const dayEl = document.getElementById("portfolio-day-change");
  const isUp = dayDiff >= 0;
  dayEl.className = `flex items-center text-sm mt-1 ${
    isUp ? "text-zesty-green-500" : "text-zesty-red-500 dark:text-zesty-red-400"
  }`;
  dayEl.innerHTML = `${isUp ? "+" : ""}${fmtMoney(dayDiff)} (${isUp ? "+" : ""}${dayPct.toFixed(
    2
  )}%) <span class="pl-1 text-slate-500 dark:text-slate-400">Hoy</span>`;

  document.getElementById("portfolio-cash").textContent = fmtMoney(acc.cash);
  document.getElementById("portfolio-bp").textContent = fmtMoney(acc.buying_power);
  document.getElementById("portfolio-max-pos").textContent = fmtMoney(equity * 0.1);

  const hist = portfolioState.history;
  let pts = hist?.equity?.filter((v) => v && v > 0) || [];
  if (pts.length < 5) {
    pts = [equity * 0.992, equity * 0.995, equity * 0.994, equity * 0.998, equity * 0.999, equity];
  }
  const minV = Math.min(...pts) * 0.998;
  const maxV = Math.max(...pts) * 1.002;
  const range = Math.max(1, maxV - minV);
  const width = 996;
  const height = 250;

  const coords = pts.map((v, idx) => {
    const x = (idx / Math.max(1, pts.length - 1)) * width;
    const y = height - ((v - minV) / range) * (height - 30) - 15;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const lineD = "M" + coords.join(" L");
  const areaD = `${lineD} L${width},${height} L0,${height} Z`;

  document.getElementById("chart-line-path")?.setAttribute("d", lineD);
  document.getElementById("chart-area-path")?.setAttribute("d", areaD);

  const positions = portfolioState.positions || [];
  document.getElementById("positions-count").textContent = `${positions.length} activas`;
  const posContainer = document.getElementById("positions-list");

  if (positions.length === 0) {
    posContainer.innerHTML = `
      <div class="flex flex-col items-center py-10">
        <div class="mb-3 text-slate-400 dark:text-slate-500">
          <i data-lucide="briefcase" class="w-10 h-10"></i>
        </div>
        <p class="text-sm font-medium text-slate-500 dark:text-slate-400">No tienes posiciones aún</p>
        <p class="mt-1 text-xs text-slate-400 dark:text-slate-500">Explora activos o confirma tus señales pendientes para comenzar a invertir</p>
        <button onclick="window.switchSection('explore')" class="mt-4 inline-flex items-center justify-center rounded-xl bg-zesty-purple-500 px-4 py-2 text-xs text-white shadow-xs hover:bg-zesty-purple-400">
          Explorar activos
        </button>
      </div>`;
    if (window.lucide) window.lucide.createIcons();
  } else {
    posContainer.innerHTML = `
      <div class="flex flex-col gap-1.5 mt-2">
        ${positions
          .map((p) => {
            const pl = Number(p.unrealized_pl || 0);
            const plPct = Number(p.unrealized_plpc || 0) * 100;
            const mktVal = Number(p.market_value || 0);
            return `
            <div class="flex justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200/80 dark:border-slate-800">
              <div>
                <p class="font-bold text-sm text-slate-900 dark:text-slate-100">${p.symbol}</p>
                <p class="text-xs text-slate-500 mt-0.5">${p.qty} unid. · Entrada $${Number(p.avg_entry_price).toFixed(2)}</p>
              </div>
              <div class="flex items-center gap-4">
                <div class="text-right">
                  <p class="text-sm font-medium text-slate-900 dark:text-slate-100">${fmtMoney(mktVal)}</p>
                  <p class="text-xs ${pl >= 0 ? "text-zesty-green-500" : "text-zesty-red-500"}">
                    ${pl >= 0 ? "+" : ""}${plPct.toFixed(2)}%
                  </p>
                </div>
                <button
                  onclick="window.proposeQuickTrade('${p.symbol}', 'sell', ${p.qty})"
                  class="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300"
                >
                  Vender
                </button>
              </div>
            </div>`;
          })
          .join("")}
      </div>`;
  }

  const orders = portfolioState.orders || [];
  const ordContainer = document.getElementById("orders-list");
  if (ordContainer) {
    if (orders.length === 0) {
      ordContainer.innerHTML = `<div class="p-6 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">No hay órdenes recientes.</div>`;
    } else {
      ordContainer.innerHTML = orders
        .map((o) => {
          const isBuy = o.side === "buy";
          return `
          <div class="p-4 rounded-lg bg-neutral-50 dark:bg-slate-900 flex items-center justify-between text-xs">
            <div>
              <p class="font-bold text-sm text-slate-900 dark:text-slate-100">${o.symbol} · ${isBuy ? "Compra" : "Venta"} (${o.qty || o.notional})</p>
              <p class="text-slate-500 mt-0.5">${new Date(o.created_at).toLocaleString("es-CL")}</p>
            </div>
            <span class="px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">${o.status}</span>
          </div>`;
        })
        .join("");
    }
  }
}

// Render Zesty Market Explorer (Exact Zesty Asset Row Structure)
async function loadExploreCatalog(query = "") {
  const container = document.getElementById("explore-sections-container");
  if (container && marketCatalog.length === 0) {
    container.innerHTML = `<div class="py-8 text-center text-xs text-slate-400">Cargando mercado desde Alpaca...</div>`;
  }
  try {
    const res = await callEngine("explore_market", { query });
    marketCatalog = res.catalog || [];
    customSearchResults = res.customResults || [];
    renderExploreSections();
  } catch (err) {
    showToast(`Error: ${err.message}`, "rose");
  }
}

function renderAssetRowZesty(item) {
  const isUp = Number(item.changePct || 0) >= 0;
  const borderColor =
    item.assetClass === "etf" || item.assetClass === "fixed_income" || item.assetClass === "leveraged"
      ? "border-zesty-purple-500"
      : "border-zesty-green-500";
  const cleanSym = item.symbol.replace("/USD", "");
  const logoUrl = `https://assets.parqet.com/logos/symbol/${encodeURIComponent(cleanSym)}?format=png`;

  return `
  <a
    href="#asset/${item.symbol}"
    onclick="window.openAssetModal('${item.symbol}'); return false;"
    class="flex justify-between flex-1 items-center bg-neutral-50 dark:bg-slate-900 p-4 rounded-lg hover:bg-neutral-100/70 dark:hover:bg-slate-800/80 transition-all duration-200"
  >
    <div class="flex justify-between flex-1 items-center">
      <div class="flex items-start gap-4">
        <div class="relative inline-block flex-shrink-0 mt-0.5">
          <img
            src="${logoUrl}"
            alt="${item.symbol}"
            width="28"
            height="28"
            onerror="this.style.display='none'; this.nextElementSibling.classList.remove('hidden');"
            class="w-7 h-7 rounded-full border-2 ${borderColor} object-cover bg-white dark:bg-slate-800"
          />
          <div class="hidden w-7 h-7 rounded-full border-2 ${borderColor} bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-[10px] text-slate-700 dark:text-slate-300">
            ${item.symbol.slice(0, 3)}
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <p class="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">${item.name}</p>
          <div class="flex flex-row items-center gap-2">
            <p class="text-xs text-slate-500 dark:text-slate-400 border w-fit px-2.5 py-0.5 rounded-full border-slate-200 dark:border-slate-800">${item.symbol}</p>
            ${item.leverage ? `<span class="text-xs text-slate-400">${item.leverage}</span>` : ""}
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-1 items-end ml-4">
        <p class="text-xs text-slate-500 dark:text-slate-400">Precio actual</p>
        <p class="text-sm sm:text-base text-slate-900 dark:text-slate-100 font-medium">${fmtMoney(item.price)}</p>
        <p class="text-xs sm:text-sm ${isUp ? "text-zesty-green-500 dark:text-zesty-green-400" : "text-zesty-red-500 dark:text-zesty-red-400"}">
          ${isUp ? "+" : ""}${Number(item.changePct || 0).toFixed(2)}%
        </p>
      </div>
    </div>
    <i data-lucide="chevron-right" class="w-5 h-5 ml-3 text-slate-400"></i>
  </a>`;
}

function renderExploreSections() {
  const container = document.getElementById("explore-sections-container");
  if (!container) return;

  const q = (document.getElementById("explore-search-input")?.value || "").trim().toUpperCase();
  let items = [...customSearchResults, ...marketCatalog];

  if (q) {
    items = items.filter(
      (i) =>
        i.symbol.toUpperCase().includes(q) ||
        i.name.toUpperCase().includes(q) ||
        i.subCategory.toUpperCase().includes(q)
    );
  }
  if (exploreMainFilter !== "ALL") {
    items = items.filter((i) => i.category === exploreMainFilter);
  }
  if (exploreSubFilter !== "ALL") {
    items = items.filter((i) => i.subCategory === exploreSubFilter);
  }

  if (items.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Presiona Enter en el buscador para consultar ese símbolo directamente en Alpaca.</div>`;
    return;
  }

  const groups = {};
  for (const it of items) {
    const g = it.subCategory || it.category;
    if (!groups[g]) groups[g] = [];
    groups[g].push(it);
  }

  container.innerHTML = Object.entries(groups)
    .map(
      ([groupTitle, groupItems]) => `
      <section class="flex flex-col gap-3">
        <header class="flex items-center justify-between">
          <h2 class="text-xl font-bold">${groupTitle}</h2>
          <span class="text-xs text-zesty-purple-500">${groupItems.length} activos</span>
        </header>
        <div class="flex flex-col gap-1">
          ${groupItems.map(renderAssetRowZesty).join("")}
        </div>
      </section>`
    )
    .join("");

  if (window.lucide) window.lucide.createIcons();
}

window.filterSubCategory = (subCat) => {
  exploreMainFilter = "ALL";
  exploreSubFilter = subCat;
  renderExploreSections();
};

// Asset Detail Modal
window.openAssetModal = async (symbol) => {
  const item =
    marketCatalog.find((m) => m.symbol === symbol) ||
    customSearchResults.find((m) => m.symbol === symbol) || {
      symbol,
      name: symbol,
      category: "Acciones EEUU",
      subCategory: "Alpaca",
      price: 0,
      changePct: 0,
    };
  selectedModalAsset = item;

  document.getElementById("modal-title").textContent = item.name;
  document.getElementById("modal-symbol-badge").textContent = item.symbol;
  document.getElementById("modal-category").textContent = item.subCategory || item.category;
  document.getElementById("modal-price").textContent = fmtMoney(item.price);
  const chgEl = document.getElementById("modal-change");
  const isUp = Number(item.changePct || 0) >= 0;
  chgEl.textContent = `${isUp ? "+" : ""}${Number(item.changePct || 0).toFixed(2)}%`;
  chgEl.className = `text-sm font-medium ${isUp ? "text-zesty-green-500" : "text-zesty-red-500"}`;

  document.getElementById("modal-indicators-content").textContent = "Consultando canales a 20 días en Alpaca...";
  document.getElementById("asset-modal").classList.remove("hidden");

  try {
    const detail = await callEngine("get_asset_detail", { symbol: item.symbol });
    if (detail.latestPrice) {
      selectedModalAsset.price = detail.latestPrice;
      document.getElementById("modal-price").textContent = fmtMoney(detail.latestPrice);
    }
    const ind = detail.indicators;
    if (ind) {
      const sl = (ind.last_price * 0.93).toFixed(2);
      document.getElementById("modal-indicators-content").innerHTML = `
        <div class="grid grid-cols-4 gap-2 py-2 text-center bg-slate-50 dark:bg-slate-800/50 rounded-lg">
          <div><div class="text-[10px] text-slate-400">Piso 20D</div><div class="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">$${ind.composite_lower}</div></div>
          <div><div class="text-[10px] text-slate-400">Media 20D</div><div class="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">$${ind.composite_middle}</div></div>
          <div><div class="text-[10px] text-slate-400">Techo 20D</div><div class="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">$${ind.composite_upper}</div></div>
          <div><div class="text-[10px] text-slate-400">RSI (14)</div><div class="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">${ind.rsi_14}</div></div>
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed pt-1">
          En simple: En las últimas 4 semanas se ha movido entre $${ind.composite_lower} y $${ind.composite_upper}. El stop-loss automático del 7% se ubica en $${sl}.
        </p>`;
    } else {
      document.getElementById("modal-indicators-content").textContent = "Disponible para operar en Alpaca.";
    }
  } catch {
    document.getElementById("modal-indicators-content").textContent = "Disponible para operar en Alpaca.";
  }
};

window.closeAssetModal = () => {
  document.getElementById("asset-modal").classList.add("hidden");
};

// Options Chain
window.loadOptionsChain = async (underlying) => {
  const sym = (underlying || "NVDA").trim().toUpperCase();
  const listEl = document.getElementById("options-chain-list");
  const bannerEl = document.getElementById("options-underlying-banner");
  if (listEl) listEl.innerHTML = `<div class="py-8 text-center text-xs text-slate-400">Cargando contratos de ${sym}...</div>`;
  try {
    const res = await callEngine("get_options_chain", { symbol: sym });
    optionsChainData = res;
    if (bannerEl) {
      bannerEl.textContent = `${res.underlying} · Precio actual: US $${res.underlyingPrice} · ${res.contracts.length} contratos disponibles`;
    }
    renderOptionsChain();
  } catch (err) {
    if (listEl) listEl.innerHTML = `<div class="p-4 text-xs text-zesty-red-500">Error: ${err.message}</div>`;
  }
};

window.filterOptionsType = (type) => {
  optionsTypeFilter = type;
  renderOptionsChain();
};

function renderOptionsChain() {
  const listEl = document.getElementById("options-chain-list");
  if (!listEl) return;
  let contracts = optionsChainData.contracts || [];
  if (optionsTypeFilter !== "ALL") {
    contracts = contracts.filter((c) => c.type === optionsTypeFilter);
  }

  if (contracts.length === 0) {
    listEl.innerHTML = `<div class="p-6 text-center text-xs text-slate-400">No hay contratos para este filtro.</div>`;
    return;
  }

  listEl.innerHTML = contracts
    .map((c) => {
      const isCall = c.type === "call";
      const totalContractUSD = (Number(c.price || 1.5) * 100).toFixed(0);
      const simpleExp = isCall
        ? `En simple (Call): Costo total de US $${totalContractUSD} por 1 contrato (100 acciones). Ganas si ${optionsChainData.underlying} sube sobre $${(c.strike_price + Number(c.price)).toFixed(2)} antes del ${c.expiration_date}.`
        : `En simple (Put): Costo total de US $${totalContractUSD} como cobertura bajista. Ganas si ${optionsChainData.underlying} baja de $${(c.strike_price - Number(c.price)).toFixed(2)} antes del ${c.expiration_date}.`;

      return `
      <div class="bg-neutral-50 dark:bg-slate-900 p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="space-y-1 flex-1">
          <div class="flex items-center gap-2">
            <span class="font-bold text-sm text-slate-900 dark:text-slate-100">${isCall ? "Call" : "Put"} · Strike $${c.strike_price}</span>
            <span class="text-xs px-2.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-500">Vence ${c.expiration_date}</span>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400">${simpleExp}</p>
        </div>

        <div class="flex items-center justify-between sm:justify-end gap-4">
          <div class="text-right">
            <p class="text-xs text-slate-500">Prima / Total x100</p>
            <p class="text-sm font-bold text-slate-900 dark:text-slate-100">US $${c.price} <span class="font-normal text-xs text-slate-500">(US $${totalContractUSD})</span></p>
          </div>
          <button
            onclick="window.proposeOptionTrade('${c.symbol}', ${c.price})"
            class="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-zesty-purple-500 text-xs font-medium whitespace-nowrap"
          >
            Seleccionar
          </button>
        </div>
      </div>`;
    })
    .join("");
}

window.proposeOptionTrade = async (optionSymbol, price) => {
  try {
    showToast(`Preparando orden para ${optionSymbol}...`);
    await callEngine("create_proposal", {
      symbol: optionSymbol,
      side: "buy",
      price,
      qty: 1,
      is_option: true,
      reason: `Contrato de opción (${optionSymbol})`,
    });
    await loadDatabaseData();
    window.switchSection("signals");
  } catch (err) {
    showToast(`Error: ${err.message}`, "rose");
  }
};

// Signals & Confirmations (Clean, restrained cards with plain-language explanation)
function renderSignals() {
  const pending = signalsData.filter((s) => s.status === "PENDING_CONFIRMATION");
  const history = signalsData.filter((s) => s.status !== "PENDING_CONFIRMATION");

  const sbBadge = document.getElementById("sidebar-signals-badge");
  const mobBadge = document.getElementById("mob-signals-badge");
  [sbBadge, mobBadge].forEach((b) => {
    if (b) {
      b.textContent = String(pending.length);
      b.classList.toggle("hidden", pending.length === 0);
    }
  });

  const dashBanner = document.getElementById("dashboard-pending-banner");
  if (dashBanner) {
    if (pending.length > 0) {
      dashBanner.classList.remove("hidden");
      dashBanner.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p class="text-sm font-bold text-slate-900 dark:text-white">Tienes ${pending.length} orden(es) pendiente(s) de confirmación</p>
            <p class="text-xs text-slate-500 mt-0.5">
              ${pending.map((p) => `${p.side === "buy" ? "Comprar" : "Vender"} ${p.symbol} (${fmtMoney(p.suggested_notional)})`).join(" · ")}
            </p>
          </div>
          <button
            onclick="window.switchSection('signals')"
            class="rounded-xl bg-zesty-purple-500 hover:bg-zesty-purple-400 px-4 py-2 text-xs text-white font-medium w-fit"
          >
            Revisar órdenes
          </button>
        </div>`;
    } else {
      dashBanner.classList.add("hidden");
    }
  }

  const pendingEl = document.getElementById("pending-signals-list");
  if (pendingEl) {
    if (pending.length === 0) {
      pendingEl.innerHTML = `
        <div class="p-8 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
          No tienes órdenes pendientes de confirmación.
        </div>`;
    } else {
      pendingEl.innerHTML = pending
        .map((s) => {
          const isBuy = s.side === "buy";
          const ind = s.indicators || {};
          const simpleExp =
            ind.simple_explanation ||
            `En simple: El precio de ${s.symbol} ($${s.current_price}) se encuentra cerca del piso de su rango de 20 días. La orden invierte ${fmtMoney(s.suggested_notional)} (${s.portfolio_pct || 10}% de tu capital) con stop-loss en $${s.stop_loss_price} (-7%) y objetivo en $${s.take_profit_price}.`;

          return `
          <div class="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-zesty-purple-50 dark:bg-slate-900/20 space-y-4">
            <div class="flex items-start justify-between">
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-bold text-base text-slate-900 dark:text-white">${isBuy ? "Comprar" : "Vender"} ${s.symbol}</span>
                  <span class="text-xs px-2.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-500">US $${Number(s.current_price).toFixed(2)}</span>
                </div>
                <p class="text-xs text-slate-500 mt-0.5">${s.trigger_reason}</p>
              </div>
              <span class="text-xs text-slate-400">Enviada a @dfbe00_inversiones2_bot</span>
            </div>

            <!-- Simple explanation for non-technical readers -->
            <div class="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
              <p class="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1">Explicación sencilla</p>
              <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">${simpleExp}</p>
            </div>

            <div class="grid grid-cols-3 gap-3 text-xs">
              <div>
                <p class="text-slate-500">Monto (${s.portfolio_pct || 10}% del portafolio)</p>
                <p class="font-bold text-slate-900 dark:text-white mt-0.5">${fmtMoney(s.suggested_notional)} (${s.suggested_qty} unid.)</p>
              </div>
              <div>
                <p class="text-slate-500">Stop-Loss (-7%)</p>
                <p class="font-bold text-slate-900 dark:text-white mt-0.5">US $${Number(s.stop_loss_price || 0).toFixed(2)}</p>
              </div>
              <div>
                <p class="text-slate-500">Objetivo</p>
                <p class="font-bold text-slate-900 dark:text-white mt-0.5">US $${Number(s.take_profit_price || 0).toFixed(2)}</p>
              </div>
            </div>

            <p class="text-xs text-slate-500 dark:text-slate-400">
              Detalle técnico: ${s.ai_rationale || ""}
            </p>

            <div class="flex gap-2 pt-1">
              <button
                onclick="window.confirmSignal('${s.id}')"
                class="rounded-xl px-5 py-2 text-xs font-medium bg-zesty-purple-500 hover:bg-zesty-purple-400 text-white"
              >
                Confirmar orden en Alpaca
              </button>
              <button
                onclick="window.rejectSignal('${s.id}')"
                class="rounded-xl px-4 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Descartar
              </button>
            </div>
          </div>`;
        })
        .join("");
    }
  }

  const historyEl = document.getElementById("history-signals-list");
  if (historyEl) {
    if (history.length === 0) {
      historyEl.innerHTML = `<div class="p-4 text-xs text-slate-400">Sin historial de órdenes aún.</div>`;
    } else {
      historyEl.innerHTML = history
        .slice(0, 12)
        .map((s) => {
          return `
          <div class="p-4 rounded-lg bg-neutral-50 dark:bg-slate-900 flex items-center justify-between text-xs">
            <div>
              <p class="font-bold text-slate-900 dark:text-slate-100">${s.side === "buy" ? "Compra" : "Venta"} ${s.symbol} · ${s.suggested_qty} unid. (${fmtMoney(s.suggested_notional)})</p>
              <p class="text-slate-500 mt-0.5">${s.trigger_reason}</p>
            </div>
            <span class="px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
              ${s.status === "CONFIRMED_EXECUTED" ? "Ejecutada" : "Descartada"}
            </span>
          </div>`;
        })
        .join("");
    }
  }
}

// Watchlist (20D Channels)
function renderWatchlist() {
  const container = document.getElementById("watchlist-cards");
  if (!container) return;

  container.innerHTML = watchlistData
    .map((w) => {
      const price = Number(w.last_price || 0);
      const chg = Number(w.change_pct || 0);
      const isUp = chg >= 0;

      return `
      <div class="bg-neutral-50 dark:bg-slate-900 p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="font-bold text-sm text-slate-900 dark:text-slate-100">${w.name}</span>
            <span class="text-xs px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-800 text-slate-500">${w.symbol}</span>
          </div>
          <p class="text-xs text-slate-500">
            Canal promedio 20D: $${w.composite_lower ?? "-"} – $${w.composite_upper ?? "-"} (Media $${w.composite_middle ?? "-"}) · RSI(14): ${w.rsi_14 ?? "-"}
          </p>
        </div>

        <div class="flex items-center justify-between sm:justify-end gap-4">
          <div class="text-right">
            <p class="text-sm font-medium text-slate-900 dark:text-slate-100">${price ? fmtMoney(price) : "—"}</p>
            <p class="text-xs ${isUp ? "text-zesty-green-500" : "text-zesty-red-500"}">${isUp ? "+" : ""}${chg.toFixed(2)}%</p>
          </div>
          <button
            onclick="window.proposeQuickTrade('${w.symbol}', 'buy')"
            class="px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium hover:border-zesty-purple-500"
          >
            Preparar orden
          </button>
        </div>
      </div>`;
    })
    .join("");
}

window.loadMarketNews = async () => {
  const container = document.getElementById("news-list-container");
  if (!container) return;
  container.innerHTML = `<div class="py-6 text-xs text-slate-400">Cargando noticias desde Alpaca...</div>`;
  try {
    const res = await callEngine("get_news");
    const newsList = res.news || [];
    if (newsList.length === 0) {
      container.innerHTML = `<div class="py-6 text-xs text-slate-400">No hay noticias disponibles.</div>`;
      return;
    }
    container.innerHTML = newsList
      .map(
        (n) => `
      <a href="${n.url}" target="_blank" rel="noopener noreferrer" class="p-4 rounded-lg bg-neutral-50 dark:bg-slate-900 hover:bg-neutral-100 dark:hover:bg-slate-800/80 transition flex flex-col gap-1">
        <div class="flex items-center justify-between text-xs text-slate-400">
          <span>${n.source} · ${(n.symbols || []).slice(0, 3).join(", ")}</span>
          <span>${new Date(n.created_at).toLocaleDateString("es-CL")}</span>
        </div>
        <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">${n.headline}</h3>
        <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">${n.summary || ""}</p>
      </a>`
      )
      .join("");
  } catch (err) {
    container.innerHTML = `<div class="p-4 text-xs text-zesty-red-500">Error: ${err.message}</div>`;
  }
};

function renderChat() {
  const box = document.getElementById("chat-messages-box");
  if (!box) return;
  if (chatData.length === 0) {
    box.innerHTML = `<div class="p-6 text-center text-xs text-slate-400">Escribe o usa el micrófono para hablar con tu asistente.</div>`;
    return;
  }

  box.innerHTML = chatData
    .map((m) => {
      const isUser = m.sender === "user";
      const isSys = m.sender === "system";
      if (isSys) {
        return `<div class="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs text-center">${m.message}</div>`;
      }
      return `
      <div class="flex flex-col ${isUser ? "items-end" : "items-start"}">
        <span class="text-[10px] text-slate-400 mb-1 px-1">${isUser ? "Tú" : "Asistente"} · ${m.channel === "telegram" ? "Telegram" : "Web"}</span>
        <div class="max-w-[85%] p-3.5 rounded-xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-zesty-purple-500 text-white"
            : "bg-neutral-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
        }">${m.message}</div>
      </div>`;
    })
    .join("");

  box.scrollTop = box.scrollHeight;
}

function speakTextIfEnabled(text) {
  if (!ttsEnabled || !("speechSynthesis" in window) || !text) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "es-ES";
    utter.rate = 1.05;
    window.speechSynthesis.speak(utter);
  } catch {}
}

async function toggleVoiceCapture() {
  const banner = document.getElementById("voice-status-banner");
  const input = document.getElementById("chat-input");

  if (isRecordingVoice) {
    window.stopVoiceCapture();
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    try {
      speechRecognizer = new SpeechRecognition();
      speechRecognizer.lang = "es-CL";
      speechRecognizer.interimResults = true;
      speechRecognizer.continuous = false;

      isRecordingVoice = true;
      banner?.classList.remove("hidden");

      speechRecognizer.onresult = (event) => {
        let transcript = "";
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (input) input.value = transcript;
      };

      speechRecognizer.onend = () => {
        isRecordingVoice = false;
        banner?.classList.add("hidden");
        const finalVal = input?.value.trim();
        if (finalVal) sendChatMessage(finalVal);
      };

      speechRecognizer.onerror = () => {
        isRecordingVoice = false;
        banner?.classList.add("hidden");
      };

      speechRecognizer.start();
      return;
    } catch {}
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = String(reader.result || "").split(",")[1];
        if (base64) {
          showToast("Procesando audio...");
          const res = await callEngine("chat", {
            message: "",
            audio_base64: base64,
            audio_mime: blob.type || "audio/webm",
          });
          await loadDatabaseData();
          if (res.reply) speakTextIfEnabled(res.reply);
          if (res.navigateTo) window.switchSection(res.navigateTo);
        }
      };
      reader.readAsDataURL(blob);
    };
    isRecordingVoice = true;
    banner?.classList.remove("hidden");
    mediaRecorder.start();
  } catch (err) {
    showToast(`No se pudo acceder al micrófono: ${err.message}`, "rose");
  }
}

window.stopVoiceCapture = () => {
  if (speechRecognizer) {
    try {
      speechRecognizer.stop();
    } catch {}
    speechRecognizer = null;
  }
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  isRecordingVoice = false;
  document.getElementById("voice-status-banner")?.classList.add("hidden");
};

async function loadDatabaseData() {
  const prevPendingIds = new Set(signalsData.filter((s) => s.status === "PENDING_CONFIRMATION").map((s) => s.id));

  const [{ data: wl }, { data: sigs }, { data: chats }, { data: cfg }] = await Promise.all([
    supabase.from("watchlist").select("*").order("category").order("symbol"),
    supabase.from("trade_signals").select("*").order("created_at", { ascending: false }).limit(30),
    supabase.from("chat_messages").select("*").order("created_at", { ascending: true }).limit(50),
    supabase.from("strategy_config").select("*").eq("id", 1).maybeSingle(),
  ]);

  watchlistData = wl || [];
  signalsData = sigs || [];
  chatData = chats || [];

  for (const s of signalsData) {
    if (s.status === "PENDING_CONFIRMATION" && prevPendingIds.size > 0 && !prevPendingIds.has(s.id)) {
      sendLocalPushNotification(
        `Nueva orden por confirmar: ${s.symbol}`,
        s.indicators?.simple_explanation || s.trigger_reason,
        "signals"
      );
    }
  }

  if (cfg) {
    document.getElementById("cfg-sl").value = cfg.stop_loss_pct;
    document.getElementById("cfg-max-pos").value = cfg.max_position_pct;
    document.getElementById("cfg-rsi-buy").value = cfg.rsi_oversold;
    document.getElementById("cfg-rsi-sell").value = cfg.rsi_overbought;
    if (cfg.ui_config) {
      uiConfig = { ...uiConfig, ...cfg.ui_config };
      applyDynamicUiConfig();
    }
  }

  renderSignals();
  renderWatchlist();
  renderChat();
}

async function loadAlpacaPortfolio(period = "1M") {
  try {
    const data = await callEngine("get_portfolio", { period });
    portfolioState = data;
    renderPortfolio();
  } catch {
    renderPortfolio();
  }
}

window.refreshAll = async () => {
  showToast("Actualizando portafolio...");
  await Promise.all([loadDatabaseData(), loadAlpacaPortfolio()]);
};

window.runScanNow = async () => {
  try {
    showToast("Escaneando canales de 20 días...");
    const res = await callEngine("scan_market", { force_proposal: false });
    await loadDatabaseData();
    showToast(`Indicadores actualizados (${res.scanned} activos).`);
  } catch (err) {
    showToast(`Error: ${err.message}`, "rose");
  }
};

window.confirmSignal = async (signalId) => {
  try {
    showToast("Enviando orden a Alpaca...");
    await callEngine("confirm_signal", { signal_id: signalId });
    showToast("Orden ejecutada en Alpaca.");
    await Promise.all([loadDatabaseData(), loadAlpacaPortfolio()]);
  } catch (err) {
    showToast(`Error: ${err.message}`, "rose");
  }
};

window.rejectSignal = async (signalId) => {
  try {
    await callEngine("reject_signal", { signal_id: signalId });
    await loadDatabaseData();
  } catch (err) {
    showToast(`Error: ${err.message}`, "rose");
  }
};

window.proposeQuickTrade = async (symbol, side, qty, useMargin = false) => {
  try {
    window.closeAssetModal();
    showToast(`Preparando orden para ${symbol}...`);
    await callEngine("create_proposal", { symbol, side, qty, use_margin: useMargin });
    await loadDatabaseData();
    window.switchSection("signals");
  } catch (err) {
    showToast(`Error: ${err.message}`, "rose");
  }
};

async function sendChatMessage(text) {
  const input = document.getElementById("chat-input");
  const btn = document.getElementById("chat-send-btn");
  if (input) input.value = "";
  if (btn) btn.disabled = true;

  try {
    const res = await callEngine("chat", { message: text });
    await loadDatabaseData();
    if (res.reply) speakTextIfEnabled(res.reply);
    if (res.uiConfig) {
      uiConfig = res.uiConfig;
      applyDynamicUiConfig();
    }
    if (res.navigateTo) window.switchSection(res.navigateTo);
  } catch (err) {
    showToast(`Error: ${err.message}`, "rose");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function setupRealtime() {
  supabase
    .channel("zesty-quant-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "trade_signals" }, () => loadDatabaseData())
    .on("postgres_changes", { event: "*", schema: "public", table: "watchlist" }, () => loadDatabaseData())
    .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => loadDatabaseData())
    .on("postgres_changes", { event: "*", schema: "public", table: "strategy_config" }, () => loadDatabaseData())
    .subscribe();
}

async function initAuthenticatedApp() {
  document.getElementById("auth-view").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");
  updatePushButtonUI();
  if (window.lucide) window.lucide.createIcons();

  setupRealtime();
  await Promise.all([loadDatabaseData(), loadAlpacaPortfolio(), loadExploreCatalog()]);
}

document.addEventListener("DOMContentLoaded", async () => {
  if (window.lucide) window.lucide.createIcons();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "OPEN_TAB" && event.data.tab) {
        window.switchSection(event.data.tab);
      }
    });
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });

  // Default to Zesty's clean Light Mode unless user switched to Dark
  const savedTheme = localStorage.getItem("zesty_theme") || "light";
  document.documentElement.classList.toggle("dark", savedTheme === "dark");
  document.documentElement.classList.toggle("light", savedTheme !== "dark");
  document.documentElement.style.colorScheme = savedTheme === "dark" ? "dark" : "light";

  document.getElementById("theme-toggle-btn")?.addEventListener("click", () => {
    const isDark = document.documentElement.classList.toggle("dark");
    document.documentElement.classList.toggle("light", !isDark);
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    localStorage.setItem("zesty_theme", isDark ? "dark" : "light");
  });

  document.getElementById("mobile-menu-btn")?.addEventListener("click", () => {
    const sb = document.getElementById("app-sidebar");
    const bd = document.getElementById("sidebar-backdrop");
    sb?.classList.toggle("hidden");
    sb?.classList.add("flex");
    bd?.classList.toggle("hidden");
  });
  document.getElementById("sidebar-backdrop")?.addEventListener("click", () => {
    document.getElementById("app-sidebar")?.classList.add("hidden");
    document.getElementById("sidebar-backdrop")?.classList.add("hidden");
  });

  document.getElementById("push-perm-btn")?.addEventListener("click", window.requestPushNotificationPermission);
  document.getElementById("desktop-install-btn")?.addEventListener("click", window.installOrDownloadDesktopApp);

  document.querySelectorAll(".sidebar-link, .mob-nav-btn").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const target = el.getAttribute("data-nav");
      if (target) window.switchSection(target);
    });
  });

  const usdBtn = document.getElementById("curr-usd-btn");
  const clpBtn = document.getElementById("curr-clp-btn");
  const updateCurrencyBtns = () => {
    const isUsd = displayCurrency === "USD";
    if (usdBtn && clpBtn) {
      usdBtn.className = isUsd
        ? "flex-1 rounded-lg px-6 py-2 text-sm font-medium transition-colors sm:flex-none bg-white text-zesty-purple-500 shadow-sm dark:bg-slate-700 dark:text-zesty-purple-400"
        : "flex-1 rounded-lg px-6 py-2 text-sm font-medium transition-colors sm:flex-none text-slate-500 hover:text-slate-700 dark:text-slate-400";
      clpBtn.className = !isUsd
        ? "flex-1 rounded-lg px-6 py-2 text-sm font-medium transition-colors sm:flex-none bg-white text-zesty-purple-500 shadow-sm dark:bg-slate-700 dark:text-zesty-purple-400"
        : "flex-1 rounded-lg px-6 py-2 text-sm font-medium transition-colors sm:flex-none text-slate-500 hover:text-slate-700 dark:text-slate-400";
    }
    renderPortfolio();
    renderSignals();
    renderExploreSections();
  };
  usdBtn?.addEventListener("click", () => {
    displayCurrency = "USD";
    updateCurrencyBtns();
  });
  clpBtn?.addEventListener("click", () => {
    displayCurrency = "CLP";
    updateCurrencyBtns();
  });

  document.querySelectorAll(".period-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = btn.getAttribute("data-period") || "1M";
      document.querySelectorAll(".period-btn").forEach((b) => {
        const active = b.getAttribute("data-period") === p;
        b.className = active
          ? "period-btn rounded-xl px-3.5 py-1.5 text-xs sm:text-sm bg-zesty-purple-500 text-white"
          : "period-btn rounded-xl px-3.5 py-1.5 text-xs sm:text-sm bg-slate-200 hover:bg-slate-300 text-slate-900 dark:text-slate-100 dark:bg-slate-800";
      });
      loadAlpacaPortfolio(p);
    });
  });

  document.getElementById("explore-search-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = document.getElementById("explore-search-input")?.value.trim();
    await loadExploreCatalog(q);
  });
  document.getElementById("explore-search-input")?.addEventListener("input", () => {
    renderExploreSections();
  });

  document.querySelectorAll(".explore-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      exploreMainFilter = pill.getAttribute("data-filter") || "ALL";
      exploreSubFilter = "ALL";
      document.querySelectorAll(".explore-pill").forEach((p) => {
        const active = p.getAttribute("data-filter") === exploreMainFilter;
        p.className = active
          ? "explore-pill text-nowrap inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-all border border-zesty-purple-500 bg-zesty-purple-500 text-white"
          : "explore-pill text-nowrap inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition-all border border-zesty-purple-300 bg-zesty-purple-200/80 text-slate-700 dark:border-zesty-purple-800 dark:bg-zesty-purple-900/20 dark:text-slate-300";
      });
      renderExploreSections();
    });
  });

  document.getElementById("modal-propose-btn")?.addEventListener("click", () => {
    if (!selectedModalAsset) return;
    const side = document.getElementById("modal-trade-side").value;
    const qty = document.getElementById("modal-trade-qty").value;
    const useMargin = document.getElementById("modal-trade-margin").checked;
    window.proposeQuickTrade(selectedModalAsset.symbol, side, qty ? Number(qty) : undefined, useMargin);
  });

  document.getElementById("modal-options-btn")?.addEventListener("click", () => {
    if (!selectedModalAsset) return;
    const sym = selectedModalAsset.symbol;
    window.closeAssetModal();
    window.switchSection("options");
    window.loadOptionsChain(sym);
  });

  document.getElementById("new-proposal-toggle-btn")?.addEventListener("click", () => {
    document.getElementById("proposal-form")?.classList.toggle("hidden");
  });

  document.getElementById("proposal-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const sym = document.getElementById("prop-symbol").value.trim().toUpperCase();
    const side = document.getElementById("prop-side").value;
    const qty = document.getElementById("prop-qty").value;
    const useMargin = document.getElementById("prop-margin").checked;
    await window.proposeQuickTrade(sym, side, qty ? Number(qty) : undefined, useMargin);
    document.getElementById("proposal-form").reset();
    document.getElementById("proposal-form").classList.add("hidden");
  });

  document.getElementById("add-watchlist-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const sym = document.getElementById("add-symbol-input").value.trim().toUpperCase();
    const cat = document.getElementById("add-category-input").value;
    if (!sym) return;
    const { error } = await supabase.from("watchlist").upsert({
      symbol: sym,
      name: sym,
      category: cat,
      enabled: true,
    });
    if (error) showToast(`Error: ${error.message}`, "rose");
    else {
      document.getElementById("add-symbol-input").value = "";
      await window.runScanNow();
    }
  });

  document.getElementById("mic-btn")?.addEventListener("click", toggleVoiceCapture);
  document.getElementById("tts-toggle-btn")?.addEventListener("click", () => {
    ttsEnabled = !ttsEnabled;
    const lbl = document.getElementById("tts-status-label");
    if (lbl) lbl.textContent = ttsEnabled ? "Respuesta por voz: On" : "Respuesta por voz: Off";
  });

  document.getElementById("chat-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = document.getElementById("chat-input")?.value.trim();
    if (val) sendChatMessage(val);
  });

  document.querySelectorAll(".chat-chip").forEach((chip) => {
    chip.addEventListener("click", () => sendChatMessage(chip.textContent.trim()));
  });

  document.getElementById("strategy-config-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await supabase
      .from("strategy_config")
      .update({
        stop_loss_pct: Number(document.getElementById("cfg-sl").value),
        max_position_pct: Number(document.getElementById("cfg-max-pos").value),
        rsi_oversold: Number(document.getElementById("cfg-rsi-buy").value),
        rsi_overbought: Number(document.getElementById("cfg-rsi-sell").value),
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) showToast(`Error: ${error.message}`, "rose");
    else showToast("Configuración guardada.");
  });

  document.getElementById("test-telegram-btn")?.addEventListener("click", async () => {
    try {
      await callEngine("test_telegram");
      showToast("Mensaje enviado a @dfbe00_inversiones2_bot");
    } catch (err) {
      showToast(`Error: ${err.message}`, "rose");
    }
  });

  document.getElementById("password-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const newPass = document.getElementById("new-password-input").value;
    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (error) showToast(`Error: ${error.message}`, "rose");
    else {
      document.getElementById("new-password-input").value = "";
      showToast("Contraseña actualizada.");
    }
  });

  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.reload();
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session && session.user?.email?.toLowerCase() === OWNER_EMAIL) {
    initAuthenticatedApp();
  }

  document.getElementById("login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim().toLowerCase();
    const password = document.getElementById("login-password").value;
    const errEl = document.getElementById("login-error");
    const btn = document.getElementById("login-btn");
    errEl.classList.add("hidden");

    if (email !== OWNER_EMAIL) {
      errEl.textContent = "Acceso exclusivo para dfbe00@gmail.com.";
      errEl.classList.remove("hidden");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Ingresando...";
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    btn.textContent = "Continuar";

    if (error) {
      errEl.textContent = error.message;
      errEl.classList.remove("hidden");
      return;
    }
    if (data.session) initAuthenticatedApp();
  });
});
