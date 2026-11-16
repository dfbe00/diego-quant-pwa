import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public Supabase Configuration (Protected by Row Level Security for dfbe00@gmail.com)
const SUPABASE_URL = "https://ytzvufrmenpqjelkbthm.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0enZ1ZnJtZW5wcWplbGtidGhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1ODY3MzYsImV4cCI6MjExMDE2MjczNn0.BknsVFktOD0Ei4wTQgjEuR4f8xrjlZbtornw7wt_gkc";

const OWNER_EMAIL = "dfbe00@gmail.com";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentSession = null;
let watchlistData = [];
let signalsData = [];
let chatData = [];
let selectedCategory = "ALL";
let portfolioState = {
  account: { equity: 100000.69, cash: 100000.69, buying_power: 200001.38, last_equity: 100000.69, status: "ACTIVE" },
  positions: [],
  orders: [],
};

// Formatters
const fmtUSD = (n) =>
  "$" +
  Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtCompactUSD = (n) =>
  "$" +
  Number(n || 0).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });

function showToast(msg, type = "emerald") {
  const banner = document.getElementById("toast-banner");
  if (!banner) return;
  const styles =
    type === "rose"
      ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
      : type === "amber"
      ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
      : "bg-emerald-500/15 border-emerald-500/30 text-emerald-300";
  banner.className = `mx-4 mt-3 p-3 rounded-xl text-xs font-medium border flex items-center justify-between ${styles}`;
  banner.innerHTML = `<span>${msg}</span><button onclick="this.parentElement.classList.add('hidden')" class="ml-2 text-slate-400">✕</button>`;
  banner.classList.remove("hidden");
  setTimeout(() => banner.classList.add("hidden"), 5500);
}

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

// Navigation
function switchTab(tabName) {
  const tabs = ["portfolio", "signals", "radar", "chat", "settings"];
  tabs.forEach((t) => {
    const el = document.getElementById(`tab-${t}`);
    if (el) el.classList.toggle("hidden", t !== tabName);
  });
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    const active = btn.getAttribute("data-tab") === tabName;
    btn.classList.toggle("text-emerald-400", active);
    btn.classList.toggle("text-slate-400", !active);
  });
  if (tabName === "chat") {
    const box = document.getElementById("chat-messages-box");
    if (box) box.scrollTop = box.scrollHeight;
  }
}

// Render Portfolio (Alpaca Live)
function renderPortfolio() {
  const acc = portfolioState.account || {};
  const equity = Number(acc.equity || 100000.69);
  const lastEquity = Number(acc.last_equity || equity);
  const dayDiff = equity - lastEquity;
  const dayPct = lastEquity > 0 ? (dayDiff / lastEquity) * 100 : 0;

  document.getElementById("portfolio-equity").textContent = fmtUSD(equity);
  const dayEl = document.getElementById("portfolio-day-change");
  dayEl.textContent = `${dayDiff >= 0 ? "+" : ""}${fmtUSD(dayDiff)} (${dayDiff >= 0 ? "+" : ""}${dayPct.toFixed(2)}%) hoy`;
  dayEl.className = `text-xs font-medium mt-1 ${dayDiff >= 0 ? "text-emerald-400" : "text-rose-400"}`;

  document.getElementById("portfolio-cash").textContent = fmtCompactUSD(acc.cash);
  document.getElementById("portfolio-bp").textContent = fmtCompactUSD(acc.buying_power);
  document.getElementById("portfolio-max-pos").textContent = fmtCompactUSD(equity * 0.1);

  const positions = portfolioState.positions || [];
  document.getElementById("positions-count").textContent = `${positions.length} activa(s)`;
  const posContainer = document.getElementById("positions-list");

  if (positions.length === 0) {
    posContainer.innerHTML = `
      <div class="ios-card p-4 text-center text-xs text-slate-400">
        No tienes posiciones abiertas actualmente en Alpaca.<br/>
        <span class="text-slate-500">Revisa la pestaña <b>Señales</b> para confirmar compras generadas por el Triple Canal 20D + RSI.</span>
      </div>`;
  } else {
    posContainer.innerHTML = positions
      .map((p) => {
        const pl = Number(p.unrealized_pl || 0);
        const plPct = Number(p.unrealized_plpc || 0) * 100;
        const mktVal = Number(p.market_value || 0);
        const weightPct = equity > 0 ? (mktVal / equity) * 100 : 0;
        const stopPrice = (Number(p.avg_entry_price || p.current_price) * 0.93).toFixed(2);
        return `
        <div class="ios-card p-3.5">
          <div class="flex items-center justify-between">
            <div>
              <div class="flex items-center gap-2">
                <span class="font-bold text-sm text-white">${p.symbol}</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">${p.qty} acc.</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400">${weightPct.toFixed(1)}% cap</span>
              </div>
              <div class="text-[11px] text-slate-400 mt-0.5">
                Entrada $${Number(p.avg_entry_price).toFixed(2)} · Actual $${Number(p.current_price).toFixed(2)} · SL -7%: $${stopPrice}
              </div>
            </div>
            <div class="text-right">
              <div class="font-bold text-sm text-white">${fmtUSD(mktVal)}</div>
              <div class="text-xs font-semibold ${pl >= 0 ? "text-emerald-400" : "text-rose-400"}">
                ${pl >= 0 ? "+" : ""}${fmtUSD(pl)} (${plPct.toFixed(2)}%)
              </div>
            </div>
          </div>
          <div class="mt-2.5 pt-2.5 border-t border-slate-800/80 flex justify-end">
            <button
              onclick="window.proposeQuickTrade('${p.symbol}', 'sell', ${p.qty})"
              class="px-3 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[11px] font-semibold"
            >
              Proponer Venta
            </button>
          </div>
        </div>`;
      })
      .join("");
  }

  const orders = (portfolioState.orders || []).slice(0, 8);
  const ordContainer = document.getElementById("orders-list");
  if (orders.length === 0) {
    ordContainer.innerHTML = `<div class="ios-card p-3.5 text-center text-xs text-slate-400">Sin órdenes recientes en Alpaca.</div>`;
  } else {
    ordContainer.innerHTML = orders
      .map((o) => {
        const isBuy = o.side === "buy";
        return `
        <div class="ios-card p-3 flex items-center justify-between text-xs">
          <div class="flex items-center gap-2.5">
            <span class="px-2 py-0.5 rounded-md font-bold text-[10px] uppercase ${
              isBuy ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
            }">${isBuy ? "COMPRA" : "VENTA"}</span>
            <div>
              <div class="font-bold text-white">${o.symbol} · ${o.qty || o.notional} acc.</div>
              <div class="text-[10px] text-slate-400">${new Date(o.created_at).toLocaleString("es-CL")}</div>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 uppercase">
            ${o.status}
          </span>
        </div>`;
      })
      .join("");
  }
}

// Render Signals & Confirmations
function renderSignals() {
  const pending = signalsData.filter((s) => s.status === "PENDING_CONFIRMATION");
  const history = signalsData.filter((s) => s.status !== "PENDING_CONFIRMATION");

  // Update badges
  const badge = document.getElementById("nav-signals-badge");
  if (badge) {
    badge.textContent = String(pending.length);
    badge.classList.toggle("hidden", pending.length === 0);
  }

  const homeAlert = document.getElementById("home-pending-alert");
  if (homeAlert) {
    if (pending.length > 0) {
      homeAlert.classList.remove("hidden");
      homeAlert.innerHTML = `
        <div class="flex items-center justify-between">
          <div>
            <div class="text-xs font-bold text-amber-300">⚡ ${pending.length} Señal(es) Pendiente(s) de tu Confirmación</div>
            <div class="text-[11px] text-amber-200/80 mt-0.5">
              ${pending.map((p) => `${p.side === "buy" ? "COMPRA" : "VENTA"} ${p.symbol} ($${p.suggested_notional})`).join(" · ")}
            </div>
          </div>
          <button onclick="window.goToSignalsTab()" class="px-3 py-1.5 rounded-xl bg-amber-400 text-slate-950 font-bold text-xs">
            Revisar
          </button>
        </div>`;
    } else {
      homeAlert.classList.add("hidden");
    }
  }

  const pendingEl = document.getElementById("pending-signals-list");
  if (pending.length === 0) {
    pendingEl.innerHTML = `
      <div class="ios-card p-5 text-center text-xs text-slate-400">
        No hay señales pendientes de confirmación en este momento.<br/>
        <span class="text-slate-500">Usa el botón <b>Escanear</b> arriba para evaluar los 3 canales a 20 días + RSI.</span>
      </div>`;
  } else {
    pendingEl.innerHTML = pending
      .map((s) => {
        const isBuy = s.side === "buy";
        const ind = s.indicators || {};
        return `
        <div class="ios-card p-4 border ${isBuy ? "border-emerald-500/40" : "border-rose-500/40"} space-y-3">
          <div class="flex items-start justify-between">
            <div>
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                  isBuy ? "bg-emerald-500 text-slate-950" : "bg-rose-500 text-white"
                }">${isBuy ? "COMPRA (BUY)" : "VENTA (SELL)"}</span>
                <span class="text-base font-extrabold text-white">${s.symbol}</span>
                <span class="text-xs font-semibold text-slate-300">@ $${Number(s.current_price).toFixed(2)}</span>
              </div>
              <div class="text-[11px] text-emerald-400 font-medium mt-1">${s.trigger_reason}</div>
            </div>
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
              📲 Enviado a @Telegram
            </span>
          </div>

          <!-- Sizing & Strict Risk Grid -->
          <div class="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
            <div>
              <div class="text-[10px] text-slate-400">Inversión (${s.portfolio_pct || 10}% cap)</div>
              <div class="font-bold text-white">${fmtUSD(s.suggested_notional)} (${s.suggested_qty} acc)</div>
            </div>
            <div>
              <div class="text-[10px] text-slate-400">Stop-Loss (-7%)</div>
              <div class="font-bold text-rose-400">$${Number(s.stop_loss_price || 0).toFixed(2)}</div>
            </div>
            <div>
              <div class="text-[10px] text-slate-400">Target Canal Sup.</div>
              <div class="font-bold text-emerald-400">$${Number(s.take_profit_price || 0).toFixed(2)}</div>
            </div>
          </div>

          <!-- 3 Channels + RSI Summary -->
          <div class="text-[11px] text-slate-300 bg-slate-900/50 rounded-xl p-2.5 border border-slate-800/70 space-y-1">
            <div class="flex justify-between">
              <span class="text-slate-400">Promedio 3 Canales (20D):</span>
              <span class="font-semibold">Inf $${ind.composite_lower ?? "-"} · Med $${ind.composite_middle ?? "-"} · Sup $${ind.composite_upper ?? "-"}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-400">Donchian / Bollinger / Keltner:</span>
              <span>D:[${ind.donchian_lower ?? "-"}-${ind.donchian_upper ?? "-"}] · B:[${ind.bollinger_lower ?? "-"}-${ind.bollinger_upper ?? "-"}] · K:[${ind.keltner_lower ?? "-"}-${ind.keltner_upper ?? "-"}]</span>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-400">Confirmación RSI (14D):</span>
              <span class="font-bold text-amber-400">RSI ${ind.rsi_14 ?? "-"}</span>
            </div>
          </div>

          <!-- Gemini Rationale -->
          <div class="text-xs text-slate-300 italic bg-slate-900/40 p-3 rounded-xl border border-slate-800/60">
            🤖 <b>Gemini AI:</b> "${s.ai_rationale || "Señal validada por estrategia Triple Canal 20D + RSI."}"
          </div>

          <!-- Confirmation Buttons -->
          <div class="grid grid-cols-2 gap-2.5 pt-1">
            <button
              onclick="window.confirmSignal('${s.id}')"
              class="py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-extrabold text-xs shadow-lg shadow-emerald-500/20 active:scale-95 transition"
            >
              ✅ Confirmar y Ejecutar
            </button>
            <button
              onclick="window.rejectSignal('${s.id}')"
              class="py-3 rounded-xl bg-slate-800 border border-slate-700 text-rose-400 font-bold text-xs active:scale-95 transition"
            >
              ❌ Rechazar Orden
            </button>
          </div>
        </div>`;
      })
      .join("");
  }

  const historyEl = document.getElementById("history-signals-list");
  if (history.length === 0) {
    historyEl.innerHTML = `<div class="ios-card p-3.5 text-center text-xs text-slate-500">Sin historial de señales resueltas aún.</div>`;
  } else {
    historyEl.innerHTML = history
      .slice(0, 12)
      .map((s) => {
        const isExec = s.status === "CONFIRMED_EXECUTED";
        return `
        <div class="ios-card p-3 flex items-center justify-between text-xs">
          <div>
            <div class="font-bold text-white">
              ${s.side === "buy" ? "🟢 COMPRA" : "🔴 VENTA"} ${s.symbol} · ${s.suggested_qty} acc (${fmtUSD(s.suggested_notional)})
            </div>
            <div class="text-[10px] text-slate-400 mt-0.5">
              ${s.trigger_reason} · Vía ${(s.confirmed_via || "app").toUpperCase()}
            </div>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
            isExec ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-400"
          }">
            ${isExec ? "EJECUTADA" : s.status}
          </span>
        </div>`;
      })
      .join("");
  }
}

// Render Watchlist & 20D Triple Channel Radar
function renderWatchlist() {
  const container = document.getElementById("watchlist-cards");
  const filtered =
    selectedCategory === "ALL"
      ? watchlistData
      : watchlistData.filter((w) => w.category === selectedCategory);

  if (filtered.length === 0) {
    container.innerHTML = `<div class="ios-card p-4 text-center text-xs text-slate-400">No hay activos en esta categoría.</div>`;
    return;
  }

  container.innerHTML = filtered
    .map((w) => {
      const price = Number(w.last_price || 0);
      const chg = Number(w.change_pct || 0);
      const compLow = Number(w.composite_lower || price * 0.95);
      const compMid = Number(w.composite_middle || price);
      const compHigh = Number(w.composite_upper || price * 1.05);
      const span = Math.max(0.01, compHigh - compLow);
      const pctPos = Math.min(100, Math.max(0, ((price - compLow) / span) * 100));

      const stateBadge =
        w.signal_state === "BUY"
          ? `<span class="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">SEÑAL COMPRA</span>`
          : w.signal_state === "SELL"
          ? `<span class="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-400 font-bold text-[10px]">SEÑAL VENTA</span>`
          : `<span class="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-semibold text-[10px]">NEUTRAL / HOLD</span>`;

      return `
      <div class="ios-card p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-extrabold text-base text-white">${w.symbol}</span>
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">${w.category}</span>
              ${stateBadge}
            </div>
            <div class="text-xs text-slate-400 mt-0.5">${w.name}</div>
          </div>
          <div class="text-right">
            <div class="text-base font-extrabold text-white">${price ? fmtUSD(price) : "—"}</div>
            <div class="text-xs font-semibold ${chg >= 0 ? "text-emerald-400" : "text-rose-400"}">
              ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%
            </div>
          </div>
        </div>

        <!-- Visual Gauge of Composite 20D Channel -->
        <div>
          <div class="flex justify-between text-[10px] text-slate-400 mb-1">
            <span>Inf: $${w.composite_lower ?? "-"}</span>
            <span class="text-blue-400 font-semibold">Media 3 Canales: $${w.composite_middle ?? "-"}</span>
            <span>Sup: $${w.composite_upper ?? "-"}</span>
          </div>
          <div class="w-full h-2.5 rounded-full bg-slate-900 border border-slate-800 relative overflow-hidden">
            <div class="absolute inset-y-0 left-1/2 w-0.5 bg-slate-600"></div>
            <div
              class="h-full rounded-full bg-gradient-to-r from-emerald-500 via-blue-500 to-rose-500"
              style="width: ${pctPos.toFixed(0)}%;"
            ></div>
          </div>
        </div>

        <!-- Individual 20D Channels + RSI(14) Grid -->
        <div class="grid grid-cols-4 gap-1.5 text-[10px] text-center bg-slate-900/70 p-2 rounded-xl border border-slate-800/80">
          <div>
            <div class="text-slate-400">Donchian 20D</div>
            <div class="font-semibold text-slate-200 mt-0.5">${w.donchian_lower ?? "-"} - ${w.donchian_upper ?? "-"}</div>
          </div>
          <div>
            <div class="text-slate-400">Bollinger 20D</div>
            <div class="font-semibold text-slate-200 mt-0.5">${w.bollinger_lower ?? "-"} - ${w.bollinger_upper ?? "-"}</div>
          </div>
          <div>
            <div class="text-slate-400">Keltner 20D</div>
            <div class="font-semibold text-slate-200 mt-0.5">${w.keltner_lower ?? "-"} - ${w.keltner_upper ?? "-"}</div>
          </div>
          <div>
            <div class="text-slate-400">RSI (14D)</div>
            <div class="font-extrabold text-amber-400 mt-0.5">${w.rsi_14 ?? "-"}</div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="flex items-center justify-between pt-1">
          <span class="text-[10px] text-slate-500">
            Stop-Loss 7%: $${price ? (price * 0.93).toFixed(2) : "-"} · Cap máx 10%
          </span>
          <div class="flex gap-2">
            <button
              onclick="window.proposeQuickTrade('${w.symbol}', 'buy')"
              class="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold active:scale-95 transition"
            >
              Proponer Compra
            </button>
          </div>
        </div>
      </div>`;
    })
    .join("");
}

// Render Synchronized Chat (PWA <-> Telegram <-> Gemini AI)
function renderChat() {
  const box = document.getElementById("chat-messages-box");
  if (!box) return;
  if (chatData.length === 0) {
    box.innerHTML = `
      <div class="ios-card p-4 text-xs text-slate-400 text-center">
        Escribe una consulta o instrucción a tu asistente <b>Gemini 4 Hydrogen</b>.<br/>
        Toda conversación en <b>@dfbe00_inversiones_bot</b> y aquí está sincronizada en tiempo real.
      </div>`;
    return;
  }

  box.innerHTML = chatData
    .map((m) => {
      const isUser = m.sender === "user";
      const isSys = m.sender === "system";
      const viaBadge =
        m.channel === "telegram"
          ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">@Telegram</span>`
          : `<span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">iPhone PWA</span>`;

      if (isSys) {
        return `
        <div class="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs text-center">
          ${m.message}
        </div>`;
      }

      return `
      <div class="flex flex-col ${isUser ? "items-end" : "items-start"}">
        <div class="flex items-center gap-1.5 mb-1 px-1">
          <span class="text-[10px] font-semibold text-slate-400">${isUser ? "Diego" : "Diego Quant AI"}</span>
          ${viaBadge}
        </div>
        <div class="max-w-[86%] p-3 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-emerald-500 text-slate-950 font-medium rounded-br-sm"
            : "ios-card text-slate-100 rounded-bl-sm"
        }">${m.message}</div>
      </div>`;
    })
    .join("");

  box.scrollTop = box.scrollHeight;
}

// Data Loaders
async function loadDatabaseData() {
  const [{ data: wl }, { data: sigs }, { data: chats }, { data: cfg }] = await Promise.all([
    supabase.from("watchlist").select("*").order("category").order("symbol"),
    supabase.from("trade_signals").select("*").order("created_at", { ascending: false }).limit(25),
    supabase.from("chat_messages").select("*").order("created_at", { ascending: true }).limit(40),
    supabase.from("strategy_config").select("*").eq("id", 1).maybeSingle(),
  ]);

  watchlistData = wl || [];
  signalsData = sigs || [];
  chatData = chats || [];

  if (cfg) {
    document.getElementById("cfg-sl").value = cfg.stop_loss_pct;
    document.getElementById("cfg-max-pos").value = cfg.max_position_pct;
    document.getElementById("cfg-rsi-buy").value = cfg.rsi_oversold;
    document.getElementById("cfg-rsi-sell").value = cfg.rsi_overbought;
  }

  renderSignals();
  renderWatchlist();
  renderChat();
}

async function loadAlpacaPortfolio() {
  try {
    const data = await callEngine("get_portfolio");
    portfolioState = data;
    renderPortfolio();
  } catch (err) {
    console.warn("Alpaca fetch warning:", err.message);
    renderPortfolio();
  }
}

// Global Action Handlers
window.goToSignalsTab = () => switchTab("signals");

window.confirmSignal = async (signalId) => {
  try {
    showToast("Ejecutando orden confirmada en Alpaca...", "amber");
    await callEngine("confirm_signal", { signal_id: signalId });
    showToast("✅ ¡Orden ejecutada en Alpaca y notificada en @Telegram!", "emerald");
    await Promise.all([loadDatabaseData(), loadAlpacaPortfolio()]);
  } catch (err) {
    showToast(`Error al ejecutar: ${err.message}`, "rose");
  }
};

window.rejectSignal = async (signalId) => {
  try {
    await callEngine("reject_signal", { signal_id: signalId });
    showToast("Señal descartada.", "amber");
    await loadDatabaseData();
  } catch (err) {
    showToast(`Error: ${err.message}`, "rose");
  }
};

window.proposeQuickTrade = async (symbol, side, qty) => {
  try {
    showToast(`Analizando ${symbol} con Triple Canal 20D + RSI y enviando a @Telegram...`, "amber");
    await callEngine("create_proposal", { symbol, side, qty });
    await loadDatabaseData();
    switchTab("signals");
    showToast(`✅ Señal de ${side === "buy" ? "COMPRA" : "VENTA"} para ${symbol} lista para confirmar`, "emerald");
  } catch (err) {
    showToast(`Error creando propuesta: ${err.message}`, "rose");
  }
};

function setupRealtime() {
  supabase
    .channel("diego-quant-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "trade_signals" }, () => loadDatabaseData())
    .on("postgres_changes", { event: "*", schema: "public", table: "watchlist" }, () => loadDatabaseData())
    .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => loadDatabaseData())
    .subscribe();
}

async function initAuthenticatedApp(session) {
  currentSession = session;
  document.getElementById("auth-view").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");
  if (window.lucide) window.lucide.createIcons();

  setupRealtime();
  await Promise.all([loadDatabaseData(), loadAlpacaPortfolio()]);
}

// Event Listeners
document.addEventListener("DOMContentLoaded", async () => {
  if (window.lucide) window.lucide.createIcons();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  // Check existing session
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session && session.user?.email?.toLowerCase() === OWNER_EMAIL) {
    initAuthenticatedApp(session);
  }

  // Login Form
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim().toLowerCase();
    const password = document.getElementById("login-password").value;
    const errEl = document.getElementById("login-error");
    const btn = document.getElementById("login-btn");
    errEl.classList.add("hidden");

    if (email !== OWNER_EMAIL) {
      errEl.textContent = "⛔ Acceso denegado: Esta aplicación está bloqueada exclusivamente para dfbe00@gmail.com.";
      errEl.classList.remove("hidden");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Verificando credenciales...";
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    btn.textContent = "Desbloquear Terminal Privada";

    if (error) {
      errEl.textContent = `Error: ${error.message}`;
      errEl.classList.remove("hidden");
      return;
    }
    initAuthenticatedApp(data.session);
  });

  // Bottom Navigation
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.getAttribute("data-tab")));
  });

  // Top Header Scan & Refresh
  const handleScan = async () => {
    try {
      showToast("🔍 Escaneando 16 activos (Donchian 20D + Bollinger 20D + Keltner 20D + RSI)...", "amber");
      const res = await callEngine("scan_market", { force_proposal: false });
      await loadDatabaseData();
      showToast(
        `✅ Escaneo listo (${res.scanned} activos). Nuevas señales enviadas a @Telegram: ${res.newSignals?.length || 0}`,
        "emerald"
      );
    } catch (err) {
      showToast(`Error al escanear: ${err.message}`, "rose");
    }
  };

  document.getElementById("quick-scan-btn").addEventListener("click", handleScan);
  document.getElementById("radar-scan-btn").addEventListener("click", handleScan);
  document.getElementById("refresh-btn").addEventListener("click", async () => {
    showToast("Actualizando portafolio de Alpaca y señales...", "emerald");
    await Promise.all([loadDatabaseData(), loadAlpacaPortfolio()]);
  });

  // Toggle Proposal Form
  document.getElementById("new-proposal-toggle-btn").addEventListener("click", () => {
    document.getElementById("proposal-form").classList.toggle("hidden");
  });

  // Submit Manual/AI Proposal Form
  document.getElementById("proposal-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const symbol = document.getElementById("prop-symbol").value.trim().toUpperCase();
    const side = document.getElementById("prop-side").value;
    const qty = document.getElementById("prop-qty").value;
    await window.proposeQuickTrade(symbol, side, qty ? Number(qty) : undefined);
    document.getElementById("proposal-form").reset();
    document.getElementById("proposal-form").classList.add("hidden");
  });

  // Add Watchlist Symbol
  document.getElementById("add-watchlist-form").addEventListener("submit", async (e) => {
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
    if (error) {
      showToast(`Error: ${error.message}`, "rose");
    } else {
      document.getElementById("add-symbol-input").value = "";
      showToast(`${sym} añadido al radar. Escaneando indicadores...`, "emerald");
      await handleScan();
    }
  });

  // Category Filter Pills
  document.querySelectorAll(".cat-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      selectedCategory = pill.getAttribute("data-cat");
      document.querySelectorAll(".cat-pill").forEach((p) => {
        const active = p.getAttribute("data-cat") === selectedCategory;
        p.className = active
          ? "cat-pill px-3 py-1 rounded-full bg-emerald-500 text-slate-950 font-semibold whitespace-nowrap"
          : "cat-pill px-3 py-1 rounded-full bg-slate-800 text-slate-300 whitespace-nowrap";
      });
      renderWatchlist();
    });
  });

  // Chat Form & Quick Chips
  const sendChatMessage = async (text) => {
    const input = document.getElementById("chat-input");
    const btn = document.getElementById("chat-send-btn");
    input.value = "";
    btn.disabled = true;
    try {
      await callEngine("chat", { message: text });
      await loadDatabaseData();
    } catch (err) {
      showToast(`Error chat: ${err.message}`, "rose");
    } finally {
      btn.disabled = false;
    }
  };

  document.getElementById("chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const val = document.getElementById("chat-input").value.trim();
    if (val) sendChatMessage(val);
  });

  document.querySelectorAll(".chat-chip").forEach((chip) => {
    chip.addEventListener("click", () => sendChatMessage(chip.textContent.trim()));
  });

  // Strategy Config Save
  document.getElementById("strategy-config-form").addEventListener("submit", async (e) => {
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
    else showToast("✅ Parámetros de la estrategia actualizados en Supabase", "emerald");
  });

  // Test Telegram Button
  document.getElementById("test-telegram-btn").addEventListener("click", async () => {
    try {
      await callEngine("test_telegram");
      showToast("📲 Mensaje de prueba enviado a @dfbe00_inversiones_bot", "emerald");
    } catch (err) {
      showToast(`Error Telegram: ${err.message}`, "rose");
    }
  });

  // Change Password Form
  document.getElementById("password-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const newPass = document.getElementById("new-password-input").value;
    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (error) showToast(`Error: ${error.message}`, "rose");
    else {
      document.getElementById("new-password-input").value = "";
      showToast("✅ Contraseña actualizada correctamente", "emerald");
    }
  });

  // Logout
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.reload();
  });
});
