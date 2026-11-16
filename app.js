import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://ytzvufrmenpqjelkbthm.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0enZ1ZnJtZW5wcWplbGtidGhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1ODY3MzYsImV4cCI6MjExMDE2MjczNn0.BknsVFktOD0Ei4wTQgjEuR4f8xrjlZbtornw7wt_gkc";

const OWNER_EMAIL = "dfbe00@gmail.com";
const APP_PUBLIC_URL = "https://dfbe00.github.io/diego-quant-pwa/";
const USD_TO_CLP = 978;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State
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

// Currency Formatter
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

function showToast(msg, type = "purple") {
  const banner = document.getElementById("toast-banner");
  if (!banner) return;
  const styles =
    type === "rose"
      ? "bg-rose-500/15 border-rose-500/40 text-rose-400"
      : type === "emerald"
      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
      : "bg-zesty-purple-500/15 border-zesty-purple-500/40 text-zesty-purple-400";
  banner.className = `mx-4 mt-4 p-3.5 rounded-xl text-xs font-semibold border flex items-center justify-between shadow-lg ${styles}`;
  banner.innerHTML = `<span>${msg}</span><button onclick="this.parentElement.classList.add('hidden')" class="ml-3 opacity-70 hover:opacity-100">✕</button>`;
  banner.classList.remove("hidden");
  setTimeout(() => banner.classList.add("hidden"), 6000);
}

// Push Notifications Helper
async function sendLocalPushNotification(title, body, tab = "signals") {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon: "./icon.svg",
        badge: "./icon.svg",
        vibrate: [200, 100, 200],
        data: { tab },
      });
      return;
    }
  } catch {
    // Fallback to standard Notification
  }
  new Notification(title, { body, icon: "./icon.svg" });
}

window.requestPushNotificationPermission = async () => {
  if (!("Notification" in window)) {
    showToast("Tu navegador actual no soporta notificaciones Web Push.", "rose");
    return;
  }
  const perm = await Notification.requestPermission();
  updatePushButtonUI();
  if (perm === "granted") {
    showToast("🔔 ¡Notificaciones Push activadas! Recibirás alertas de compra/venta.", "emerald");
    await sendLocalPushNotification(
      "Zesty Quant AI · Push Activo",
      "Te avisaremos aquí y en @Telegram cada vez que el Triple Canal 20D + RSI detecte una señal."
    );
  } else {
    showToast("Permiso de notificaciones no concedido.", "rose");
  }
};

function updatePushButtonUI() {
  const lbl = document.getElementById("push-perm-label");
  if (!lbl || !("Notification" in window)) return;
  if (Notification.permission === "granted") {
    lbl.textContent = "Push Activo";
  } else {
    lbl.textContent = "Activar Push";
  }
}

// Desktop App Installer / Downloader
window.installOrDownloadDesktopApp = async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === "accepted") {
      deferredInstallPrompt = null;
      showToast("✅ App instalada en tu computador.", "emerald");
      return;
    }
  }
  // Generate a native Windows Desktop Launcher (.bat) so the user can download and open it anytime
  const batContent = [
    "@echo off",
    "title Zesty Quant AI - Desktop Launcher",
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
  a.download = "Zesty_Quant_AI_Escritorio.bat";
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast("💻 Se descargó el ejecutable 'Zesty_Quant_AI_Escritorio.bat' (y ya tienes el acceso directo en tu Escritorio).", "emerald");
};

// Call Supabase Edge Function
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

// Section Navigation
window.switchSection = (secName) => {
  currentSection = secName;
  const allSecs = ["dashboard", "explore", "options", "radar", "signals", "chat", "news", "orders", "leverage", "settings"];
  allSecs.forEach((s) => {
    const el = document.getElementById(`sec-${s}`);
    if (el) el.classList.toggle("hidden", s !== secName);
  });

  // Update desktop sidebar active styles (Exact Zesty border-l-5 border-zesty-purple-500)
  document.querySelectorAll(".sidebar-link").forEach((link) => {
    const active = link.getAttribute("data-nav") === secName;
    link.className = active
      ? "sidebar-link flex items-center justify-between px-4 py-2.5 text-sm font-semibold transition-colors border-l-5 border-zesty-purple-500 bg-zesty-purple-50 dark:bg-zesty-purple-950/30 text-zesty-purple-700 dark:text-purple-200"
      : "sidebar-link flex items-center justify-between px-4 py-2.5 text-sm font-medium transition-colors border-l-5 border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60";
  });

  // Update mobile bottom nav
  document.querySelectorAll(".mob-nav-btn").forEach((btn) => {
    const active = btn.getAttribute("data-nav") === secName;
    btn.classList.toggle("text-zesty-purple-500", active);
    btn.classList.toggle("text-slate-400", !active);
  });

  // Close mobile sidebar drawer if open
  document.getElementById("app-sidebar")?.classList.add("hidden");
  document.getElementById("sidebar-backdrop")?.classList.add("hidden");

  if (secName === "explore" && marketCatalog.length === 0) {
    loadExploreCatalog();
  }
  if (secName === "options" && optionsChainData.contracts.length === 0) {
    window.loadOptionsChain("NVDA");
  }
  if (secName === "news") {
    window.loadMarketNews();
  }
  if (secName === "chat") {
    const box = document.getElementById("chat-messages-box");
    if (box) box.scrollTop = box.scrollHeight;
  }
};

// Apply Dynamic UI Config (Controlled by Chatbot or Settings)
function applyDynamicUiConfig() {
  if (!uiConfig) return;

  // Toggle News in Sidebar
  const newsLi = document.getElementById("sidebar-news-item");
  if (newsLi) {
    newsLi.classList.toggle("hidden", !uiConfig.show_news_section);
  }

  // Toggle Dashboard Cards
  const chartCard = document.getElementById("card-portfolio-chart");
  if (chartCard) chartCard.classList.toggle("hidden", uiConfig.show_portfolio_chart === false);

  const bpCard = document.getElementById("card-buying-power");
  if (bpCard) bpCard.classList.toggle("hidden", uiConfig.show_buying_power === false);

  const posCard = document.getElementById("card-positions");
  if (posCard) posCard.classList.toggle("hidden", uiConfig.show_positions === false);

  // Render Custom Sections created from Chat
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
        <li>
          <a href="#dashboard" onclick="window.switchSection('dashboard'); return false;" class="flex items-center px-4 py-2 text-xs font-medium text-zesty-purple-500 hover:bg-zesty-purple-500/10">
            <span>✨ ${c.title}</span>
          </a>
        </li>`
        )
        .join("");
    }

    let html = "";
    if (uiConfig.show_news_section) {
      html += `
      <div class="p-4 sm:p-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between">
        <div>
          <div class="text-sm font-bold text-emerald-500 flex items-center gap-2">
            <span>📰 Sección de Noticias en Vivo Activa</span>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Agregada desde el Asistente IA. Consulta los titulares en tiempo real de Alpaca.</p>
        </div>
        <button onclick="window.switchSection('news')" class="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs">
          Abrir Noticias
        </button>
      </div>`;
    }

    html += customSections
      .map(
        (c) => `
      <div class="p-4 sm:p-6 rounded-xl border border-zesty-purple-500/40 bg-zesty-purple-50/70 dark:bg-slate-900/60 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-zesty-purple-500/20 text-zesty-purple-400">Módulo Creado por IA</span>
            <h3 class="text-base font-bold mt-1">${c.title}</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">${c.subtitle || ""}</p>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          ${(c.items || [])
            .map(
              (it) => `
            <div class="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <div class="text-xs text-slate-400">${it.label || ""}</div>
              <div class="text-sm font-bold mt-0.5">${it.value || ""}</div>
              ${it.badge ? `<span class="text-[10px] text-zesty-purple-400">${it.badge}</span>` : ""}
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

// Render Portfolio & Zesty SVG Chart
function renderPortfolio() {
  const acc = portfolioState.account || {};
  const equity = Number(acc.equity || 100000.69);
  const lastEquity = Number(acc.last_equity || equity);
  const dayDiff = equity - lastEquity;
  const dayPct = lastEquity > 0 ? (dayDiff / lastEquity) * 100 : 0;

  document.getElementById("portfolio-currency-label").textContent =
    displayCurrency === "CLP"
      ? `Saldo total en 🇨🇱 Pesos Chilenos (TC ~$${USD_TO_CLP})`
      : "Saldo total en 🇺🇸 USD (Cuenta Alpaca PA3XXQ6PL)";

  document.getElementById("portfolio-equity").textContent = fmtMoney(equity);
  const dayEl = document.getElementById("portfolio-day-change");
  const isUp = dayDiff >= 0;
  dayEl.className = `flex items-center text-sm font-semibold mt-1 ${
    isUp ? "text-zesty-green-500" : "text-zesty-red-500"
  }`;
  dayEl.innerHTML = `${isUp ? "▲ +" : "▼ "}${fmtMoney(dayDiff)} (${isUp ? "+" : ""}${dayPct.toFixed(
    2
  )}%) <span class="pl-1.5 text-slate-500 dark:text-slate-400 font-normal">Hoy</span>`;

  document.getElementById("portfolio-cash").textContent = fmtMoney(acc.cash);
  document.getElementById("portfolio-bp").textContent = fmtMoney(acc.buying_power);
  document.getElementById("portfolio-opt-bp").textContent = fmtMoney(acc.options_buying_power || acc.cash);
  document.getElementById("portfolio-max-pos").textContent = fmtMoney(equity * 0.1);

  // Render SVG Area Chart (#BB91FA)
  const hist = portfolioState.history;
  let pts = hist?.equity?.filter((v) => v && v > 0) || [];
  if (pts.length < 5) {
    pts = [equity * 0.985, equity * 0.991, equity * 0.989, equity * 0.996, equity * 0.998, equity];
  }
  const minV = Math.min(...pts) * 0.998;
  const maxV = Math.max(...pts) * 1.002;
  const range = Math.max(1, maxV - minV);
  const width = 960;
  const height = 240;

  const coords = pts.map((v, idx) => {
    const x = (idx / Math.max(1, pts.length - 1)) * width;
    const y = height - ((v - minV) / range) * (height - 30) - 15;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const lineD = "M" + coords.join(" L");
  const areaD = `${lineD} L${width},${height} L0,${height} Z`;

  document.getElementById("chart-line-path")?.setAttribute("d", lineD);
  document.getElementById("chart-area-path")?.setAttribute("d", areaD);

  // Positions
  const positions = portfolioState.positions || [];
  document.getElementById("positions-count").textContent = `${positions.length} activa(s)`;
  const posContainer = document.getElementById("positions-list");

  if (positions.length === 0) {
    posContainer.innerHTML = `
      <div class="flex flex-col items-center py-10 text-center">
        <div class="mb-3 text-slate-400 dark:text-slate-500">
          <i data-lucide="briefcase" class="w-10 h-10 mx-auto"></i>
        </div>
        <p class="text-sm font-semibold text-slate-600 dark:text-slate-300">No tienes posiciones abiertas aún</p>
        <p class="mt-1 text-xs text-slate-400 max-w-md">
          Tienes señales listas para confirmar en la pestaña <b>Confirmaciones</b> o puedes explorar Acciones, Opciones, Renta Fija y ETFs.
        </p>
        <div class="flex gap-2 mt-4">
          <button onclick="window.switchSection('signals')" class="rounded-xl bg-zesty-purple-500 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-zesty-purple-400">
            Ver Señales para Confirmar
          </button>
          <button onclick="window.switchSection('explore')" class="rounded-xl border border-zesty-purple-500/40 px-4 py-2 text-xs font-bold text-zesty-purple-400">
            Explorar Mercado
          </button>
        </div>
      </div>`;
    if (window.lucide) window.lucide.createIcons();
  } else {
    posContainer.innerHTML = `
      <div class="space-y-2.5">
        ${positions
          .map((p) => {
            const pl = Number(p.unrealized_pl || 0);
            const plPct = Number(p.unrealized_plpc || 0) * 100;
            const mktVal = Number(p.market_value || 0);
            const stopPrice = (Number(p.avg_entry_price || p.current_price) * 0.93).toFixed(2);
            return `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 gap-3">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full border-2 border-zesty-purple-500 bg-zesty-purple-500/10 flex items-center justify-center font-extrabold text-xs text-zesty-purple-500">
                  ${p.symbol.slice(0, 4)}
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-sm">${p.symbol}</span>
                    <span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">${p.qty} unid.</span>
                  </div>
                  <div class="text-xs text-slate-400 mt-0.5">
                    Entrada $${Number(p.avg_entry_price).toFixed(2)} · Actual $${Number(p.current_price).toFixed(2)} · Stop-Loss (-7%): $${stopPrice}
                  </div>
                </div>
              </div>
              <div class="flex items-center justify-between sm:justify-end gap-4">
                <div class="text-right">
                  <div class="font-bold text-sm">${fmtMoney(mktVal)}</div>
                  <div class="text-xs font-bold ${pl >= 0 ? "text-zesty-green-500" : "text-zesty-red-500"}">
                    ${pl >= 0 ? "+" : ""}${fmtMoney(pl)} (${plPct.toFixed(2)}%)
                  </div>
                </div>
                <button
                  onclick="window.proposeQuickTrade('${p.symbol}', 'sell', ${p.qty})"
                  class="px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-500 text-xs font-bold"
                >
                  Vender
                </button>
              </div>
            </div>`;
          })
          .join("")}
      </div>`;
  }

  // Orders List
  const orders = portfolioState.orders || [];
  const ordContainer = document.getElementById("orders-list");
  if (ordContainer) {
    if (orders.length === 0) {
      ordContainer.innerHTML = `<div class="p-6 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">No hay órdenes recientes registradas en Alpaca.</div>`;
    } else {
      ordContainer.innerHTML = orders
        .map((o) => {
          const isBuy = o.side === "buy";
          return `
          <div class="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <div class="flex items-center gap-3">
              <span class="px-2.5 py-1 rounded-lg font-extrabold uppercase ${
                isBuy ? "bg-zesty-green-500/20 text-zesty-green-500" : "bg-zesty-red-500/20 text-zesty-red-500"
              }">${isBuy ? "COMPRA" : "VENTA"}</span>
              <div>
                <div class="font-bold text-sm">${o.symbol} · ${o.qty || o.notional} unid. (${o.type.toUpperCase()})</div>
                <div class="text-slate-400">${new Date(o.created_at).toLocaleString("es-CL")}</div>
              </div>
            </div>
            <span class="px-3 py-1 rounded-full font-bold bg-slate-100 dark:bg-slate-800 uppercase">${o.status}</span>
          </div>`;
        })
        .join("");
    }
  }
}

// Render Zesty Market Explorer ("Explorar")
async function loadExploreCatalog(query = "") {
  const container = document.getElementById("explore-sections-container");
  if (container && marketCatalog.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Cargando cotizaciones en tiempo real desde Alpaca...</div>`;
  }
  try {
    const res = await callEngine("explore_market", { query });
    marketCatalog = res.catalog || [];
    customSearchResults = res.customResults || [];
    renderExploreSections();
  } catch (err) {
    showToast(`Error cargando mercado: ${err.message}`, "rose");
  }
}

function renderAssetRowZesty(item) {
  const isUp = Number(item.changePct || 0) >= 0;
  const borderColor = item.assetClass === "etf" || item.assetClass === "fixed_income" || item.assetClass === "leveraged"
    ? "border-zesty-purple-500"
    : "border-zesty-green-500";
  const cleanSym = item.symbol.replace("/USD", "");
  const logoUrl = `https://assets.parqet.com/logos/symbol/${encodeURIComponent(cleanSym)}?format=png`;

  return `
  <div
    onclick="window.openAssetModal('${item.symbol}')"
    class="cursor-pointer flex justify-between items-center bg-neutral-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200/70 dark:border-slate-800/80 hover:bg-zesty-purple-50/60 dark:hover:bg-slate-800/80 transition-all duration-200"
  >
    <div class="flex items-center gap-3.5">
      <div class="relative inline-block flex-shrink-0">
        <img
          src="${logoUrl}"
          alt="${item.symbol}"
          onerror="this.style.display='none'; this.nextElementSibling.classList.remove('hidden');"
          class="w-9 h-9 rounded-full border-2 ${borderColor} object-cover bg-slate-800"
        />
        <div class="hidden w-9 h-9 rounded-full border-2 ${borderColor} bg-zesty-purple-500/20 flex items-center justify-center font-extrabold text-xs text-zesty-purple-400">
          ${item.symbol.slice(0, 3)}
        </div>
        <span class="absolute -bottom-1 -right-1 text-[11px]" title="Mercado EEUU">🇺🇸</span>
      </div>
      <div>
        <div class="flex items-center gap-2 flex-wrap">
          <p class="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">${item.name}</p>
          ${
            item.leverage
              ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">${item.leverage}</span>`
              : ""
          }
          ${
            item.optionsEnabled
              ? `<span class="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zesty-purple-500/15 text-zesty-purple-400">Opciones</span>`
              : ""
          }
        </div>
        <div class="flex items-center gap-2 mt-1">
          <span class="text-xs text-slate-500 dark:text-slate-400 border px-2.5 py-0.5 rounded-full border-slate-200 dark:border-slate-700 font-semibold">
            ${item.symbol}
          </span>
          <span class="text-xs text-slate-400">${item.subCategory}</span>
        </div>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <div class="text-right">
        <p class="text-[11px] text-slate-500 dark:text-slate-400">Precio actual</p>
        <p class="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">${fmtMoney(item.price)}</p>
        <p class="text-xs font-bold ${isUp ? "text-zesty-green-500" : "text-zesty-red-500"}">
          ${isUp ? "+" : ""}${Number(item.changePct || 0).toFixed(2)}%
        </p>
      </div>
      <i data-lucide="chevron-right" class="w-5 h-5 text-slate-400"></i>
    </div>
  </div>`;
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
    container.innerHTML = `<div class="p-8 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">No se encontraron activos con ese filtro. Presiona "Buscar Alpaca" para consultar cualquier ticker en directo.</div>`;
    return;
  }

  // Group by subCategory just like Zesty ("Más transados", "Computación Cuántica", "ETFs S&P 500", etc.)
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
          <h2 class="text-lg sm:text-xl font-bold">${groupTitle}</h2>
          <span class="text-xs font-medium text-zesty-purple-500">${groupItems.length} instrumento(s)</span>
        </header>
        <div class="flex flex-col gap-2">
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

// Asset Detail & Trading Modal
window.openAssetModal = async (symbol) => {
  const item =
    marketCatalog.find((m) => m.symbol === symbol) ||
    customSearchResults.find((m) => m.symbol === symbol) || {
      symbol,
      name: symbol,
      category: "Acciones EEUU",
      subCategory: "Alpaca Tradable",
      price: 0,
      changePct: 0,
      optionsEnabled: true,
    };
  selectedModalAsset = item;

  document.getElementById("modal-avatar").textContent = item.symbol.slice(0, 4);
  document.getElementById("modal-title").textContent = item.name;
  document.getElementById("modal-symbol-badge").textContent = item.symbol;
  document.getElementById("modal-category").textContent = `${item.category} · ${item.subCategory}`;
  document.getElementById("modal-price").textContent = fmtMoney(item.price);
  const chgEl = document.getElementById("modal-change");
  const isUp = Number(item.changePct || 0) >= 0;
  chgEl.textContent = `${isUp ? "+" : ""}${Number(item.changePct || 0).toFixed(2)}%`;
  chgEl.className = `text-sm font-bold ${isUp ? "text-zesty-green-500" : "text-zesty-red-500"}`;

  document.getElementById("modal-indicators-content").innerHTML =
    "Calculando canales de 20 días (Donchian, Bollinger y Keltner) + RSI(14) en tiempo real...";
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
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <div class="p-2 rounded-lg bg-white dark:bg-slate-800">
            <div class="text-[10px] text-slate-400">Promedio 3 Canales (20D)</div>
            <div class="font-bold text-xs mt-0.5">$${ind.composite_lower} — $${ind.composite_upper}</div>
          </div>
          <div class="p-2 rounded-lg bg-white dark:bg-slate-800">
            <div class="text-[10px] text-slate-400">Media Canal 20D</div>
            <div class="font-bold text-xs text-zesty-purple-400 mt-0.5">$${ind.composite_middle}</div>
          </div>
          <div class="p-2 rounded-lg bg-white dark:bg-slate-800">
            <div class="text-[10px] text-slate-400">RSI (14 Días)</div>
            <div class="font-bold text-xs text-amber-400 mt-0.5">${ind.rsi_14}</div>
          </div>
          <div class="p-2 rounded-lg bg-white dark:bg-slate-800">
            <div class="text-[10px] text-slate-400">Stop-Loss (-7%)</div>
            <div class="font-bold text-xs text-rose-400 mt-0.5">$${sl}</div>
          </div>
        </div>
        <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
          <b>💡 En simple:</b> En las últimas 4 semanas este activo se ha movido entre un piso de <b>$${ind.composite_lower}</b> y un techo de <b>$${ind.composite_upper}</b>. Si compras hoy, tu freno de seguridad (-7%) queda en <b>$${sl}</b>.
        </p>`;
    } else {
      document.getElementById("modal-indicators-content").textContent =
        "Activo listo para operar en Alpaca con regla de Stop-Loss al 7% y máximo 10% del capital.";
    }
  } catch {
    document.getElementById("modal-indicators-content").textContent =
      "Listo para operar en Alpaca.";
  }
};

window.closeAssetModal = () => {
  document.getElementById("asset-modal").classList.add("hidden");
};

// Options Chain Explorer (Alpaca Level 3)
window.loadOptionsChain = async (underlying) => {
  const sym = (underlying || "NVDA").trim().toUpperCase();
  const listEl = document.getElementById("options-chain-list");
  const bannerEl = document.getElementById("options-underlying-banner");
  if (listEl) {
    listEl.innerHTML = `<div class="p-8 text-center text-xs text-slate-400">Consultando contratos de opciones activos para <b>${sym}</b> en Alpaca...</div>`;
  }
  try {
    const res = await callEngine("get_options_chain", { symbol: sym });
    optionsChainData = res;
    if (bannerEl) {
      bannerEl.textContent = `Subyacente: ${res.underlying} · Precio Spot: US $${res.underlyingPrice} · ${res.contracts.length} contratos activos encontrados en Alpaca`;
    }
    renderOptionsChain();
  } catch (err) {
    if (listEl) {
      listEl.innerHTML = `<div class="p-6 rounded-xl border border-rose-500/30 text-center text-xs text-rose-400">Error cargando opciones de ${sym}: ${err.message}</div>`;
    }
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
    listEl.innerHTML = `<div class="p-6 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">No hay contratos para este filtro.</div>`;
    return;
  }

  const spot = optionsChainData.underlyingPrice || 100;

  listEl.innerHTML = contracts
    .map((c) => {
      const isCall = c.type === "call";
      const totalContractUSD = (Number(c.price || 1.5) * 100).toFixed(0);
      const itm = isCall ? spot >= c.strike_price : spot <= c.strike_price;
      const simpleExp = isCall
        ? `💡 En simple (Call): Pagas ~$${totalContractUSD} USD por 1 contrato (100 acciones). Ganas si ${optionsChainData.underlying} sube por encima de $${(c.strike_price + Number(c.price)).toFixed(2)} antes del ${c.expiration_date}.`
        : `💡 En simple (Put): Pagas ~$${totalContractUSD} USD como seguro bajista. Ganas si ${optionsChainData.underlying} cae por debajo de $${(c.strike_price - Number(c.price)).toFixed(2)} antes del ${c.expiration_date}.`;

      return `
      <div class="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="space-y-1 flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
              isCall ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
            }">${isCall ? "CALL (Alcista)" : "PUT (Bajista)"}</span>
            <span class="font-extrabold text-sm">Strike $${c.strike_price}</span>
            <span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">Vence: ${c.expiration_date}</span>
            <span class="text-[10px] px-2 py-0.5 rounded-full ${
              itm ? "bg-zesty-purple-500/20 text-zesty-purple-400 font-bold" : "bg-slate-800 text-slate-400"
            }">${itm ? "In-The-Money (ITM)" : "Out-Of-The-Money (OTM)"}</span>
          </div>
          <div class="text-xs text-slate-400 font-mono">${c.symbol} · Open Interest: ${c.open_interest}</div>
          <div class="text-xs text-slate-600 dark:text-slate-300 bg-zesty-purple-50/50 dark:bg-slate-800/60 p-2 rounded-lg mt-1">
            ${simpleExp}
          </div>
        </div>

        <div class="flex items-center justify-between sm:justify-end gap-4">
          <div class="text-right">
            <div class="text-xs text-slate-400">Prima / Costo x100</div>
            <div class="font-extrabold text-sm">$${c.price} <span class="text-xs text-zesty-purple-400">($${totalContractUSD}/contrato)</span></div>
            <div class="text-[10px] text-slate-400">Bid $${c.bid} · Ask $${c.ask}</div>
          </div>
          <button
            onclick="window.proposeOptionTrade('${c.symbol}', ${c.price})"
            class="px-3.5 py-2 rounded-xl bg-zesty-purple-500 hover:bg-zesty-purple-400 text-white text-xs font-bold whitespace-nowrap shadow"
          >
            Practicar Orden
          </button>
        </div>
      </div>`;
    })
    .join("");
}

window.proposeOptionTrade = async (optionSymbol, price) => {
  try {
    showToast(`Creando propuesta para contrato de opción ${optionSymbol}...`, "purple");
    await callEngine("create_proposal", {
      symbol: optionSymbol,
      side: "buy",
      price,
      qty: 1,
      is_option: true,
      reason: `Estrategia con Opciones Nivel 3 (${optionSymbol})`,
    });
    await loadDatabaseData();
    window.switchSection("signals");
    showToast(`✅ Propuesta de Opción ${optionSymbol} lista para confirmar en App o @Telegram`, "emerald");
  } catch (err) {
    showToast(`Error creando propuesta de opción: ${err.message}`, "rose");
  }
};

// Render Signals & Confirmations (With Dual Explanation: Simple + Technical)
function renderSignals() {
  const pending = signalsData.filter((s) => s.status === "PENDING_CONFIRMATION");
  const history = signalsData.filter((s) => s.status !== "PENDING_CONFIRMATION");

  // Update badges
  const sbBadge = document.getElementById("sidebar-signals-badge");
  const mobBadge = document.getElementById("mob-signals-badge");
  [sbBadge, mobBadge].forEach((b) => {
    if (b) {
      b.textContent = String(pending.length);
      b.classList.toggle("hidden", pending.length === 0);
    }
  });

  // Dashboard Pending Banner
  const dashBanner = document.getElementById("dashboard-pending-banner");
  if (dashBanner) {
    if (pending.length > 0) {
      dashBanner.classList.remove("hidden");
      dashBanner.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div class="text-sm font-bold text-zesty-purple-600 dark:text-purple-300">
              ⚡ Tienes ${pending.length} sugerencia(s) de inversión esperando tu confirmación
            </div>
            <div class="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              ${pending.map((p) => `<b>${p.side === "buy" ? "COMPRA" : "VENTA"} ${p.symbol}</b> (${fmtMoney(p.suggested_notional)})`).join(" · ")}
            </div>
          </div>
          <button
            onclick="window.switchSection('signals')"
            class="px-4 py-2 rounded-xl bg-zesty-purple-500 hover:bg-zesty-purple-400 text-white text-xs font-bold w-fit shadow"
          >
            Ver Explicación en Simple y Confirmar
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
        <div class="p-8 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
          No hay señales pendientes de confirmación en este momento.<br/>
          Presiona <b>Escanear Triple Canal</b> o explora cualquier activo u opción para generar una propuesta.
        </div>`;
    } else {
      pendingEl.innerHTML = pending
        .map((s) => {
          const isBuy = s.side === "buy";
          const ind = s.indicators || {};
          const simpleExp =
            ind.simple_explanation ||
            `En simple: El precio de ${s.symbol} ($${s.current_price}) está en una zona atractiva de las últimas 4 semanas. Invertirías $${s.suggested_notional} (${s.portfolio_pct || 10}% de tu capital) con un freno automático de seguridad si cae un 7% ($${s.stop_loss_price}), buscando ganar hacia $${s.take_profit_price}.`;

          return `
          <div class="p-5 rounded-2xl bg-white dark:bg-slate-900 border-2 ${
            isBuy ? "border-emerald-500/40" : "border-rose-500/40"
          } shadow-md space-y-4">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div class="flex items-center gap-2">
                  <span class="px-3 py-1 rounded-lg text-xs font-extrabold uppercase ${
                    isBuy ? "bg-emerald-500 text-slate-950" : "bg-rose-500 text-white"
                  }">${isBuy ? "🟢 SUGERENCIA DE COMPRA" : "🔴 SUGERENCIA DE VENTA"}</span>
                  <span class="text-lg font-extrabold">${s.symbol}</span>
                  <span class="text-sm font-semibold text-slate-500">@ US $${Number(s.current_price).toFixed(2)}</span>
                </div>
                <p class="text-xs font-semibold text-zesty-purple-500 mt-1">${s.trigger_reason}</p>
              </div>
              <span class="text-xs px-3 py-1 rounded-full bg-zesty-purple-500/15 text-zesty-purple-400 font-semibold">
                📲 Sincronizado con @Telegram
              </span>
            </div>

            <!-- PLAIN LANGUAGE EXPLANATION BOX (For non-technical users) -->
            <div class="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
              <div class="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <span>💡 Explicación en simple (Sin tecnicismos)</span>
              </div>
              <p class="text-xs sm:text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
                ${simpleExp}
              </p>
            </div>

            <!-- Sizing & Risk Metrics -->
            <div class="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-xs">
              <div>
                <div class="text-slate-400">Monto Sugerido (${s.portfolio_pct || 10}% cap)</div>
                <div class="font-extrabold text-sm mt-0.5">${fmtMoney(s.suggested_notional)} (${s.suggested_qty} unid)</div>
              </div>
              <div>
                <div class="text-slate-400">Stop-Loss Automático (-7%)</div>
                <div class="font-extrabold text-sm text-rose-500 mt-0.5">US $${Number(s.stop_loss_price || 0).toFixed(2)}</div>
              </div>
              <div>
                <div class="text-slate-400">Meta de Ganancia (Target)</div>
                <div class="font-extrabold text-sm text-emerald-500 mt-0.5">US $${Number(s.take_profit_price || 0).toFixed(2)}</div>
              </div>
            </div>

            <!-- Technical Rationale (Triple Channel 20D + RSI) -->
            <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
              <div class="font-bold text-slate-500">📐 Respaldo Técnico Cuantitativo (Triple Canal 20D + RSI):</div>
              <div class="text-slate-600 dark:text-slate-300 italic">"${s.ai_rationale || ""}"</div>
              <div class="text-[11px] text-slate-400 pt-1">
                Canal Compuesto 20D: Inf $${ind.composite_lower ?? "-"} | Media $${ind.composite_middle ?? "-"} | Sup $${ind.composite_upper ?? "-"} · RSI(14): ${ind.rsi_14 ?? "-"}
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="grid grid-cols-2 gap-3 pt-1">
              <button
                onclick="window.confirmSignal('${s.id}')"
                class="py-3.5 rounded-xl bg-zesty-purple-500 hover:bg-zesty-purple-400 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-zesty-purple-500/25 transition"
              >
                ✅ Confirmar y Ejecutar en Alpaca
              </button>
              <button
                onclick="window.rejectSignal('${s.id}')"
                class="py-3.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-rose-500/20 text-rose-500 font-bold text-xs sm:text-sm transition"
              >
                ❌ Rechazar Sugerencia
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
      historyEl.innerHTML = `<div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">Sin historial de señales resueltas aún.</div>`;
    } else {
      historyEl.innerHTML = history
        .slice(0, 15)
        .map((s) => {
          const isExec = s.status === "CONFIRMED_EXECUTED";
          return `
          <div class="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <div>
              <div class="font-bold">
                ${s.side === "buy" ? "🟢 COMPRA" : "🔴 VENTA"} ${s.symbol} · ${s.suggested_qty} unid (${fmtMoney(s.suggested_notional)})
              </div>
              <div class="text-slate-400 mt-0.5">${s.trigger_reason} · Confirmado vía ${(s.confirmed_via || "app").toUpperCase()}</div>
            </div>
            <span class="px-2.5 py-1 rounded-full font-bold ${
              isExec ? "bg-emerald-500/20 text-emerald-500" : "bg-slate-200 dark:bg-slate-800 text-slate-400"
            }">${isExec ? "EJECUTADA EN ALPACA" : s.status}</span>
          </div>`;
        })
        .join("");
    }
  }
}

// Render 20D Triple Channel Radar
function renderWatchlist() {
  const container = document.getElementById("watchlist-cards");
  if (!container) return;

  container.innerHTML = watchlistData
    .map((w) => {
      const price = Number(w.last_price || 0);
      const chg = Number(w.change_pct || 0);
      const compLow = Number(w.composite_lower || price * 0.95);
      const compHigh = Number(w.composite_upper || price * 1.05);
      const span = Math.max(0.01, compHigh - compLow);
      const pctPos = Math.min(100, Math.max(0, ((price - compLow) / span) * 100));

      return `
      <div class="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-extrabold text-base">${w.symbol}</span>
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-zesty-purple-500/15 text-zesty-purple-400 font-semibold">${w.category}</span>
            </div>
            <div class="text-xs text-slate-400">${w.name}</div>
          </div>
          <div class="text-right">
            <div class="font-extrabold text-base">${price ? fmtMoney(price) : "—"}</div>
            <div class="text-xs font-bold ${chg >= 0 ? "text-zesty-green-500" : "text-zesty-red-500"}">
              ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%
            </div>
          </div>
        </div>

        <div>
          <div class="flex justify-between text-[11px] text-slate-400 mb-1">
            <span>Piso 20D: $${w.composite_lower ?? "-"}</span>
            <span class="text-zesty-purple-400 font-bold">Media: $${w.composite_middle ?? "-"}</span>
            <span>Techo 20D: $${w.composite_upper ?? "-"}</span>
          </div>
          <div class="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div class="h-full rounded-full bg-gradient-to-r from-emerald-500 via-zesty-purple-500 to-rose-500" style="width: ${pctPos.toFixed(0)}%;"></div>
          </div>
        </div>

        <div class="grid grid-cols-4 gap-1.5 text-[10px] text-center bg-slate-100 dark:bg-slate-800/70 p-2 rounded-lg">
          <div><div class="text-slate-400">Donchian</div><div class="font-bold mt-0.5">${w.donchian_lower ?? "-"}-${w.donchian_upper ?? "-"}</div></div>
          <div><div class="text-slate-400">Bollinger</div><div class="font-bold mt-0.5">${w.bollinger_lower ?? "-"}-${w.bollinger_upper ?? "-"}</div></div>
          <div><div class="text-slate-400">Keltner</div><div class="font-bold mt-0.5">${w.keltner_lower ?? "-"}-${w.keltner_upper ?? "-"}</div></div>
          <div><div class="text-slate-400">RSI (14)</div><div class="font-extrabold text-amber-500 mt-0.5">${w.rsi_14 ?? "-"}</div></div>
        </div>

        <div class="flex items-center justify-between pt-1">
          <span class="text-[11px] text-slate-400">Stop-Loss (-7%): $${price ? (price * 0.93).toFixed(2) : "-"}</span>
          <button
            onclick="window.proposeQuickTrade('${w.symbol}', 'buy')"
            class="px-3.5 py-1.5 rounded-xl bg-zesty-purple-500 hover:bg-zesty-purple-400 text-white text-xs font-bold"
          >
            Proponer Compra
          </button>
        </div>
      </div>`;
    })
    .join("");
}

// Render News Section
window.loadMarketNews = async () => {
  const container = document.getElementById("news-list-container");
  if (!container) return;
  container.innerHTML = `<div class="p-6 text-xs text-slate-400">Cargando noticias en tiempo real desde Alpaca Market News...</div>`;
  try {
    const res = await callEngine("get_news");
    const newsList = res.news || [];
    if (newsList.length === 0) {
      container.innerHTML = `<div class="p-6 text-xs text-slate-400">No hay noticias disponibles en este momento.</div>`;
      return;
    }
    container.innerHTML = newsList
      .map(
        (n) => `
      <a href="${n.url}" target="_blank" rel="noopener noreferrer" class="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-zesty-purple-500 transition flex flex-col justify-between gap-2">
        <div>
          <div class="flex items-center gap-1.5 flex-wrap mb-1.5">
            <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-zesty-purple-500/15 text-zesty-purple-400">${n.source}</span>
            ${(n.symbols || [])
              .slice(0, 4)
              .map((s) => `<span class="text-[10px] px-2 py-0.5 rounded-full border border-slate-300 dark:border-slate-700 font-semibold">${s}</span>`)
              .join("")}
          </div>
          <h3 class="font-bold text-sm leading-snug">${n.headline}</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">${n.summary || ""}</p>
        </div>
        <div class="text-[10px] text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex justify-between">
          <span>${new Date(n.created_at).toLocaleString("es-CL")}</span>
          <span class="text-zesty-purple-400 font-semibold">Leer nota →</span>
        </div>
      </a>`
      )
      .join("");
  } catch (err) {
    container.innerHTML = `<div class="p-4 text-xs text-rose-400">Error cargando noticias: ${err.message}</div>`;
  }
};

// Render Chat & Speak AI Response if TTS is enabled
function renderChat() {
  const box = document.getElementById("chat-messages-box");
  if (!box) return;
  if (chatData.length === 0) {
    box.innerHTML = `
      <div class="p-6 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
        Háblale por micrófono 🎙️ o escribe a tu asistente <b>Zesty Quant AI</b>.<br/>
        Puedes pedirle <b>operar en Alpaca</b> o <b>modificar la aplicación en vivo</b> (ej. "agrega una sección de noticias").
      </div>`;
    return;
  }

  box.innerHTML = chatData
    .map((m) => {
      const isUser = m.sender === "user";
      const isSys = m.sender === "system";
      const viaBadge =
        m.channel === "telegram"
          ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">@Telegram</span>`
          : `<span class="text-[9px] px-1.5 py-0.5 rounded bg-zesty-purple-500/20 text-zesty-purple-400">Zesty App</span>`;

      if (isSys) {
        return `<div class="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs text-center font-medium">${m.message}</div>`;
      }

      return `
      <div class="flex flex-col ${isUser ? "items-end" : "items-start"}">
        <div class="flex items-center gap-1.5 mb-1 px-1">
          <span class="text-[10px] font-bold text-slate-400">${isUser ? "Diego" : "Zesty Quant AI"}</span>
          ${viaBadge}
        </div>
        <div class="max-w-[85%] p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-zesty-purple-500 text-white font-medium rounded-br-sm shadow"
            : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-bl-sm shadow-sm"
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
  } catch {
    // ignore
  }
}

// Voice Capture (Web Speech API + MediaRecorder Multimodal Fallback)
async function toggleVoiceCapture() {
  const micBtn = document.getElementById("mic-btn");
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
      micBtn?.classList.add("mic-recording", "bg-rose-500", "text-white");
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
        micBtn?.classList.remove("mic-recording", "bg-rose-500", "text-white");
        banner?.classList.add("hidden");
        const finalVal = input?.value.trim();
        if (finalVal) {
          sendChatMessage(finalVal);
        }
      };

      speechRecognizer.onerror = () => {
        isRecordingVoice = false;
        micBtn?.classList.remove("mic-recording", "bg-rose-500", "text-white");
        banner?.classList.add("hidden");
      };

      speechRecognizer.start();
      return;
    } catch {
      // Fallback to MediaRecorder below
    }
  }

  // Fallback: Raw Microphone Audio Recording sent to Gemini 4 Hydrogen
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
          showToast("🎙️ Procesando tu voz con Gemini AI...", "purple");
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
    micBtn?.classList.add("mic-recording", "bg-rose-500", "text-white");
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
  document.getElementById("mic-btn")?.classList.remove("mic-recording", "bg-rose-500", "text-white");
  document.getElementById("voice-status-banner")?.classList.add("hidden");
};

// Database & Portfolio Loaders
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

  // Trigger Push Notification if a brand-new pending signal arrived
  for (const s of signalsData) {
    if (s.status === "PENDING_CONFIRMATION" && prevPendingIds.size > 0 && !prevPendingIds.has(s.id)) {
      sendLocalPushNotification(
        `${s.side === "buy" ? "🟢 Compra" : "🔴 Venta"} sugerida: ${s.symbol} @ $${s.current_price}`,
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
  } catch (err) {
    console.warn("Alpaca fetch warning:", err.message);
    renderPortfolio();
  }
}

// Global Actions
window.runScanNow = async () => {
  try {
    showToast("🔍 Escaneando Triple Canal 20D (Donchian + Bollinger + Keltner) + RSI(14)...", "purple");
    const res = await callEngine("scan_market", { force_proposal: false });
    await loadDatabaseData();
    showToast(
      `✅ Escaneo completado (${res.scanned} activos). Nuevas señales enviadas a @Telegram: ${res.newSignals?.length || 0}`,
      "emerald"
    );
  } catch (err) {
    showToast(`Error al escanear: ${err.message}`, "rose");
  }
};

window.confirmSignal = async (signalId) => {
  try {
    showToast("Ejecutando orden confirmada en tu cuenta Alpaca PA3XXQ6PL...", "purple");
    await callEngine("confirm_signal", { signal_id: signalId });
    showToast("✅ ¡Orden ejecutada en Alpaca y confirmada en @Telegram!", "emerald");
    await Promise.all([loadDatabaseData(), loadAlpacaPortfolio()]);
  } catch (err) {
    showToast(`Error al ejecutar en Alpaca: ${err.message}`, "rose");
  }
};

window.rejectSignal = async (signalId) => {
  try {
    await callEngine("reject_signal", { signal_id: signalId });
    showToast("Sugerencia rechazada.", "purple");
    await loadDatabaseData();
  } catch (err) {
    showToast(`Error: ${err.message}`, "rose");
  }
};

window.proposeQuickTrade = async (symbol, side, qty, useMargin = false) => {
  try {
    window.closeAssetModal();
    showToast(`Generando análisis en simple + técnico para ${symbol} y enviando a @Telegram...`, "purple");
    await callEngine("create_proposal", { symbol, side, qty, use_margin: useMargin });
    await loadDatabaseData();
    window.switchSection("signals");
    showToast(`✅ Sugerencia para ${symbol} lista para tu confirmación`, "emerald");
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
    showToast("🤖 Zesty Quant AI procesando...", "purple");
    const res = await callEngine("chat", { message: text });
    await loadDatabaseData();
    if (res.reply) speakTextIfEnabled(res.reply);
    if (res.uiConfig) {
      uiConfig = res.uiConfig;
      applyDynamicUiConfig();
      showToast("✨ ¡Interfaz de la app actualizada desde el Chat!", "emerald");
    }
    if (res.navigateTo) {
      window.switchSection(res.navigateTo);
    }
  } catch (err) {
    showToast(`Error en chat: ${err.message}`, "rose");
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

// DOM Initialization
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

  // Theme Toggle (Light / Dark)
  const savedTheme = localStorage.getItem("zesty_theme") || "dark";
  document.documentElement.classList.toggle("dark", savedTheme === "dark");

  document.getElementById("theme-toggle-btn")?.addEventListener("click", () => {
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("zesty_theme", isDark ? "dark" : "light");
  });

  // Mobile Menu Drawer Toggle
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

  // Navbar Push & Desktop Install Buttons
  document.getElementById("push-perm-btn")?.addEventListener("click", window.requestPushNotificationPermission);
  document.getElementById("desktop-install-btn")?.addEventListener("click", window.installOrDownloadDesktopApp);

  // Sidebar & Bottom Nav Links
  document.querySelectorAll(".sidebar-link, .mob-nav-btn").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const target = el.getAttribute("data-nav");
      if (target) window.switchSection(target);
    });
  });

  // Currency Toggle (USD vs CLP)
  const usdBtn = document.getElementById("curr-usd-btn");
  const clpBtn = document.getElementById("curr-clp-btn");
  const updateCurrencyBtns = () => {
    const isUsd = displayCurrency === "USD";
    if (usdBtn && clpBtn) {
      usdBtn.className = isUsd
        ? "flex-1 rounded-lg px-5 py-2 text-sm font-semibold transition-colors sm:flex-none bg-white text-zesty-purple-600 shadow-sm dark:bg-slate-700 dark:text-zesty-purple-300"
        : "flex-1 rounded-lg px-5 py-2 text-sm font-medium transition-colors sm:flex-none text-slate-600 dark:text-slate-400";
      clpBtn.className = !isUsd
        ? "flex-1 rounded-lg px-5 py-2 text-sm font-semibold transition-colors sm:flex-none bg-white text-zesty-purple-600 shadow-sm dark:bg-slate-700 dark:text-zesty-purple-300"
        : "flex-1 rounded-lg px-5 py-2 text-sm font-medium transition-colors sm:flex-none text-slate-600 dark:text-slate-400";
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

  // Portfolio Chart Period Buttons
  document.querySelectorAll(".period-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = btn.getAttribute("data-period") || "1M";
      document.querySelectorAll(".period-btn").forEach((b) => {
        const active = b.getAttribute("data-period") === p;
        b.className = active
          ? "period-btn rounded-xl px-3.5 py-1.5 text-xs font-semibold bg-zesty-purple-500 text-white shadow-xs"
          : "period-btn rounded-xl px-3.5 py-1.5 text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200";
      });
      loadAlpacaPortfolio(p);
    });
  });

  // Explore Search & Pills
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
          ? "explore-pill inline-flex items-center rounded-full px-4 py-2 text-xs sm:text-sm font-semibold transition-all border border-zesty-purple-500 bg-zesty-purple-500 text-white"
          : "explore-pill inline-flex items-center rounded-full px-4 py-2 text-xs sm:text-sm font-medium transition-all border border-zesty-purple-300 bg-zesty-purple-200/70 text-slate-700 dark:border-zesty-purple-800 dark:bg-zesty-purple-900/20 dark:text-slate-300";
      });
      renderExploreSections();
    });
  });

  // Modal Propose & Options Buttons
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

  // Signals Manual Proposal Form
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

  // Add Watchlist Symbol
  document.getElementById("add-watchlist-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const sym = document.getElementById("add-symbol-input").value.trim().toUpperCase();
    const cat = document.getElementById("add-category-input").value;
    if (!sym) return;
    const { error } = await supabase.from("watchlist").upsert({
      symbol: sym,
      name: `${sym} Asset`,
      category: cat,
      enabled: true,
    });
    if (error) showToast(`Error: ${error.message}`, "rose");
    else {
      document.getElementById("add-symbol-input").value = "";
      showToast(`${sym} añadido al Radar. Escaneando canales 20D...`, "emerald");
      await window.runScanNow();
    }
  });

  // Chat Form, Voice Mic & TTS Toggle
  document.getElementById("mic-btn")?.addEventListener("click", toggleVoiceCapture);
  document.getElementById("tts-toggle-btn")?.addEventListener("click", () => {
    ttsEnabled = !ttsEnabled;
    const lbl = document.getElementById("tts-status-label");
    if (lbl) lbl.textContent = ttsEnabled ? "Voz IA: ON 🔊" : "Voz IA: OFF";
  });

  document.getElementById("chat-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const val = document.getElementById("chat-input")?.value.trim();
    if (val) sendChatMessage(val);
  });

  document.querySelectorAll(".chat-chip").forEach((chip) => {
    chip.addEventListener("click", () => sendChatMessage(chip.textContent.replace(/^[➕💡🗑️🔍]\s*/, "").trim()));
  });

  // Settings Forms
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
    else showToast("✅ Parámetros guardados en Supabase", "emerald");
  });

  document.getElementById("test-telegram-btn")?.addEventListener("click", async () => {
    try {
      await callEngine("test_telegram");
      showToast("📲 Mensaje enviado a @dfbe00_inversiones2_bot", "emerald");
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
      showToast("✅ Contraseña actualizada", "emerald");
    }
  });

  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.reload();
  });

  // Check Session
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session && session.user?.email?.toLowerCase() === OWNER_EMAIL) {
    initAuthenticatedApp();
  }

  // Login Form
  document.getElementById("login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim().toLowerCase();
    const password = document.getElementById("login-password").value;
    const errEl = document.getElementById("login-error");
    const btn = document.getElementById("login-btn");
    errEl.classList.add("hidden");

    if (email !== OWNER_EMAIL) {
      errEl.textContent = "⛔ Acceso restringido exclusivamente a dfbe00@gmail.com.";
      errEl.classList.remove("hidden");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Ingresando...";
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    btn.textContent = "Ingresar a Zesty Quant";

    if (error) {
      errEl.textContent = `Error: ${error.message}`;
      errEl.classList.remove("hidden");
      return;
    }
    if (data.session) initAuthenticatedApp();
  });
});
