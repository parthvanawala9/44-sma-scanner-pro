// ============================================================
// 44 SMA SCANNER PRO - SCRIPT
// ============================================================

let signals = { buy: [], sell: [], scanned: 0, scannedAt: null };
let history = [];
let portfolio = { openPositions: [], closedTrades: [] };
let currentTab = "dashboard";
let isLoadingData = false;

function money(val) {
    const num = Number(val);
    if (!Number.isFinite(num)) return "—";
    return "₹" + num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function percentage(val) {
    const num = Number(val);
    if (!Number.isFinite(num)) return "—";
    return (num >= 0 ? "+" : "") + num.toFixed(2) + "%";
}

function escapeHtml(val) {
    return String(val ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function loadData() {
    if (isLoadingData) return;
    isLoadingData = true;

    try {
        const ts = Date.now();
        const signalRes = await fetch("./data/signals.json?" + ts, { cache: "no-store" });
        if (signalRes.ok) signals = await signalRes.json();

        try {
            const histRes = await fetch("./data/history.json?" + ts, { cache: "no-store" });
            if (histRes.ok) history = await histRes.json();
        } catch (e) { history = []; }

        try {
            const portRes = await fetch("./data/portfolio.json?" + ts, { cache: "no-store" });
            if (portRes.ok) portfolio = await portRes.json();
        } catch (e) { portfolio = { openPositions: [], closedTrades: [] }; }

        updateLastScan();
        render();

    } catch (err) {
        console.error("Data Load Error:", err);
    } finally {
        isLoadingData = false;
    }
}

function updateLastScan() {
    const elem = document.getElementById("lastScan");
    if (!elem) return;
    const val = signals.scannedAt || signals.scanDate || signals.date;
    if (!val) { elem.textContent = "Last scan: —"; return; }
    const dt = new Date(val);
    elem.textContent = Number.isNaN(dt.getTime()) ? "Last scan: " + val : "Last scan: " + dt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function render() {
    renderNavigation();
    renderDashboardView();
    renderBuyTable();
    renderSellTable();
    renderPortfolioTable();
    renderClosedTable();
    renderHistoryTable();
    renderCurrentPage();
}

function renderNavigation() {
    document.querySelectorAll("[data-tab]").forEach(el => {
        el.classList.toggle("active", el.dataset.tab === currentTab);
    });
    const titleElem = document.getElementById("pageTitle");
    if (titleElem) {
        const titleMap = {
            dashboard: "Dashboard Intelligence",
            buy: "BUY Signals Today",
            sell: "SELL Signals Today",
            portfolio: "Portfolio Monitor",
            history: "Historical Scan Logs"
        };
        titleElem.textContent = titleMap[currentTab] || "Dashboard";
    }
}

function renderCurrentPage() {
    document.querySelectorAll("[data-page]").forEach(page => {
        page.style.display = page.dataset.page === currentTab ? "block" : "none";
    });
}

function getBuySignals() { return Array.isArray(signals.buy) ? signals.buy : []; }
function getSellSignals() { return Array.isArray(signals.sell) ? signals.sell : []; }

function renderDashboardView() {
    const buys = getBuySignals();
    const sells = getSellSignals();
    const scanned = Number(signals.scanned || signals.universeCount || 0);

    const bElem = document.getElementById("dashBuyCount");
    const sElem = document.getElementById("dashSellCount");
    const scElem = document.getElementById("dashScannedCount");

    if (bElem) bElem.textContent = buys.length;
    if (sElem) sElem.textContent = sells.length;
    if (scElem) scElem.textContent = scanned;

    const summaryWrapper = document.getElementById("signalSummary");
    if (summaryWrapper) {
        summaryWrapper.innerHTML = `
            <div style="flex:1; padding:18px; background:rgba(16,185,129,0.1); border-radius:12px; border:1px solid #10b981;">
                <span style="color:#10b981; font-weight:800; font-size:11px;">BUY BREAKOUTS</span>
                <p style="font-size:24px; font-weight:800; margin-top:4px;">${buys.length} Stocks</p>
            </div>
            <div style="flex:1; padding:18px; background:rgba(239,68,68,0.1); border-radius:12px; border:1px solid #ef4444;">
                <span style="color:#ef4444; font-weight:800; font-size:11px;">SELL TRIGGERS</span>
                <p style="font-size:24px; font-weight:800; margin-top:4px;">${sells.length} Stocks</p>
            </div>
        `;
    }
}

function renderBuyTable() {
    const container = document.getElementById("buyTableBody");
    if (!container) return;
    const rows = getBuySignals();
    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="9" class="empty-state">No BUY signals generated today</td></tr>`;
        return;
    }
    container.innerHTML = rows.map(item => signalRow(item, "BUY")).join("");
}

function renderSellTable() {
    const container = document.getElementById("sellTableBody");
    if (!container) return;
    const rows = getSellSignals();
    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="9" class="empty-state">No SELL signals generated today</td></tr>`;
        return;
    }
    container.innerHTML = rows.map(item => signalRow(item, "SELL")).join("");
}

function signalRow(item, type) {
    const symbol = item.symbol || item.ticker || "—";
    const close = Number(item.close ?? item.price);
    const open = Number(item.open);
    const sma44 = Number(item.sma44 ?? item.SMA44);
    const sma100 = Number(item.sma100 ?? item.SMA100);
    const sma200 = Number(item.sma200 ?? item.SMA200);
    const distance = Number(item.distanceFrom44 ?? item.buyDistanceFrom44);

    return `
        <tr>
            <td><strong>${escapeHtml(symbol)}</strong></td>
            <td>${money(close)}</td>
            <td>${money(sma44)}</td>
            <td>${money(sma100)}</td>
            <td>${money(sma200)}</td>
            <td>${Number.isFinite(distance) ? distance.toFixed(2) + "%" : "—"}</td>
            <td>${Number.isFinite(open) && Number.isFinite(close) ? (close >= open ? '🟢 Green' : '🔴 Red') : '—'}</td>
            <td><span class="badge ${type === "BUY" ? "badge-green" : "badge-red"}">${type}</span></td>
            <td><button class="btn-chart" onclick="openStockChart('${escapeHtml(symbol)}')">Chart</button></td>
        </tr>
    `;
}

function openStockChart(symbol) {
    const modal = document.getElementById("stockChartModal");
    const title = document.getElementById("stockChartTitle");
    if (title) title.textContent = symbol + " — 44 SMA Chart";
    if (modal) modal.style.display = "flex";
}

function closeChart() {
    const modal = document.getElementById("stockChartModal");
    if (modal) modal.style.display = "none";
}

function renderPortfolioTable() {
    const container = document.getElementById("portfolioTableBody");
    if (!container) return;
    const rows = Array.isArray(portfolio.openPositions) ? portfolio.openPositions : [];
    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="13" class="empty-state">No active open positions</td></tr>`;
        return;
    }
    container.innerHTML = rows.map(pos => `
        <tr>
            <td><strong>${escapeHtml(pos.symbol || "—")}</strong></td>
            <td>${pos.quantity || 0}</td>
            <td>${money(pos.buyPrice)}</td>
            <td>${money(pos.currentPrice || pos.buyPrice)}</td>
            <td>${money((pos.quantity || 0) * (pos.buyPrice || 0))}</td>
            <td>${money((pos.quantity || 0) * (pos.currentPrice || pos.buyPrice || 0))}</td>
            <td class="${(pos.currentPrice - pos.buyPrice) >= 0 ? 'text-green' : 'text-red'}">${money((pos.currentPrice - pos.buyPrice) * pos.quantity)}</td>
            <td class="${(pos.currentPrice - pos.buyPrice) >= 0 ? 'text-green' : 'text-red'}">${percentage(((pos.currentPrice - pos.buyPrice) / pos.buyPrice) * 100)}</td>
            <td>${money(pos.currentSMA44)}</td>
            <td>${money(pos.stopLossPrice)}</td>
            <td>${money(pos.targetPrice)}</td>
            <td><span class="badge">${escapeHtml(pos.exitStatus || "HOLD")}</span></td>
            <td>${formatDate(pos.buyDate)}</td>
        </tr>
    `).join("");
}

function renderClosedTable() {
    const container = document.getElementById("closedTradesBody");
    if (!container) return;
    const rows = Array.isArray(portfolio.closedTrades) ? portfolio.closedTrades : [];
    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="10" class="empty-state">No closed trades recorded</td></tr>`;
        return;
    }
    container.innerHTML = rows.map(t => `
        <tr>
            <td><strong>${escapeHtml(t.symbol || "—")}</strong></td>
            <td>${t.quantity || 0}</td>
            <td>${money(t.buyPrice)}</td>
            <td>${money(t.sellPrice)}</td>
            <td>${money(t.quantity * t.buyPrice)}</td>
            <td>${money(t.quantity * t.sellPrice)}</td>
            <td class="${t.pnl >= 0 ? 'text-green' : 'text-red'}">${money(t.pnl)}</td>
            <td>${percentage((t.pnl / (t.quantity * t.buyPrice)) * 100)}</td>
            <td>${formatDate(t.buyDate)}</td>
            <td><span class="badge ${t.pnl >= 0 ? 'badge-green' : 'badge-red'}">${escapeHtml(t.result || "CLOSED")}</span></td>
        </tr>
    `).join("");
}

function renderHistoryTable() {
    const container = document.getElementById("historyTableBody");
    if (!container) return;
    const rows = Array.isArray(history) ? history : [];
    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="7" class="empty-state">No scan history logs</td></tr>`;
        return;
    }
    container.innerHTML = rows.slice().reverse().map(item => `
        <tr>
            <td>${formatDate(item.date)}</td>
            <td><strong>${escapeHtml(item.symbol || "—")}</strong></td>
            <td><span class="badge ${item.signal === "BUY" ? "badge-green" : "badge-red"}">${escapeHtml(item.signal || "—")}</span></td>
            <td>${money(item.close)}</td>
            <td>${money(item.sma44)}</td>
            <td>${money(item.sma100)}</td>
            <td>${money(item.sma200)}</td>
        </tr>
    `).join("");
}

function formatDate(val) {
    if (!val) return "—";
    const dt = new Date(val);
    return Number.isNaN(dt.getTime()) ? String(val) : dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

document.addEventListener("DOMContentLoaded", () => {
    document.addEventListener("click", e => {
        const nav = e.target.closest("[data-tab]");
        if (nav) {
            currentTab = nav.dataset.tab;
            renderNavigation();
            renderCurrentPage();
        }

        if (e.target.closest('[data-action="refresh"]')) {
            loadData();
        }
    });

    loadData();
});
