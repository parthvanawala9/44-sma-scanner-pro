// ============================================================
// 44 SMA SCANNER PRO — TERMINAL LOGIC
// ============================================================

let signals = {
    buy: [],
    sell: [],
    scanned: 0,
    skipped: 0,
    scannedAt: null,
    buyCount: 0,
    sellCount: 0,
    universe: "NIFTY 500",
    universeCount: 0
};

let history = [];
let portfolio = {
    allocationPerStock: 5000,
    openPositions: [],
    closedTrades: [],
    realizedPnL: 0,
    unrealizedPnL: 0,
    totalInvested: 0,
    totalCurrentValue: 0,
    totalPnL: 0,
    totalPnLPercent: 0
};

let currentTab = "dashboard";
let isLoadingData = false;

function money(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return "₹" + number.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function percentage(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    const sign = number >= 0 ? "+" : "";
    return sign + number.toFixed(2) + "%";
}

function pnlClass(value) {
    const number = Number(value);
    if (number > 0) return "text-green";
    if (number < 0) return "text-red";
    return "";
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function loadData() {
    if (isLoadingData) return;
    isLoadingData = true;

    const refreshButton = document.querySelector('[data-action="refresh"]');
    if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.classList.add("loading");
    }

    try {
        const timestamp = Date.now();

        const signalResponse = await fetch("./data/signals.json?" + timestamp, { cache: "no-store" });
        if (signalResponse.ok) {
            const signalData = await signalResponse.json();
            if (signalData && typeof signalData === "object") {
                signals = signalData;
            }
        }

        try {
            const historyResponse = await fetch("./data/history.json?" + timestamp, { cache: "no-store" });
            if (historyResponse.ok) {
                history = await historyResponse.json();
            }
        } catch (e) { history = []; }

        try {
            const portfolioResponse = await fetch("./data/portfolio.json?" + timestamp, { cache: "no-store" });
            if (portfolioResponse.ok) {
                portfolio = await portfolioResponse.json();
            }
        } catch (e) { portfolio = createEmptyPortfolio(); }

        updateLastScan();
        render();

    } catch (error) {
        console.error("Dashboard error:", error);
    } finally {
        isLoadingData = false;
        if (refreshButton) {
            refreshButton.disabled = false;
            refreshButton.classList.remove("loading");
        }
    }
}

function createEmptyPortfolio() {
    return { allocationPerStock: 5000, openPositions: [], closedTrades: [] };
}

function updateLastScan() {
    const element = document.getElementById("lastScan");
    if (!element) return;
    const value = signals.scannedAt || signals.scanDate || signals.date;
    if (!value) {
        element.textContent = "Last scan: —";
        return;
    }
    const date = new Date(value);
    element.textContent = Number.isNaN(date.getTime()) 
        ? "Last scan: " + String(value) 
        : "Last scan: " + date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function render() {
    renderNavigation();
    renderMetrics();
    renderTables();
    renderCurrentView();
}

function renderNavigation() {
    document.querySelectorAll("[data-tab]").forEach(element => {
        element.classList.toggle("active", element.dataset.tab === currentTab);
    });
    const pageTitle = document.getElementById("pageTitle");
    if (pageTitle) {
        const titleMap = {
            dashboard: "Dashboard Overview",
            buy: "BUY Signals",
            sell: "SELL Signals",
            portfolio: "Portfolio Manager",
            history: "Scan History"
        };
        pageTitle.textContent = titleMap[currentTab] || "Dashboard";
    }
}

function renderCurrentView() {
    document.querySelectorAll("[data-page]").forEach(page => {
        page.style.display = page.dataset.page === currentTab ? "block" : "none";
    });
}

function getBuySignals() { return Array.isArray(signals.buy) ? signals.buy : []; }
function getSellSignals() { return Array.isArray(signals.sell) ? signals.sell : []; }

function renderMetrics() {
    const buySignals = getBuySignals();
    const sellSignals = getSellSignals();
    const scanned = Number(signals.scanned || signals.universeCount || 0);

    const buyElem = document.getElementById("dashBuyCount");
    const sellElem = document.getElementById("dashSellCount");
    const scanElem = document.getElementById("dashScannedCount");

    if (buyElem) buyElem.textContent = buySignals.length;
    if (sellElem) sellElem.textContent = sellSignals.length;
    if (scanElem) scanElem.textContent = scanned;

    const summaryContainer = document.getElementById("signalSummary");
    if (summaryContainer) {
        summaryContainer.innerHTML = `
            <div class="summary-pill buy">
                <span>BUY OPPORTUNITIES</span>
                <strong>${buySignals.length} Stocks</strong>
            </div>
            <div class="summary-pill sell">
                <span>SELL / EXIT TRIGGERS</span>
                <strong>${sellSignals.length} Stocks</strong>
            </div>
        `;
    }
}

function renderTables() {
    renderBuyTable();
    renderSellTable();
    renderPortfolioTable();
    renderClosedTable();
    renderHistoryTable();
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
    const rowData = encodeURIComponent(JSON.stringify(item));

    return `
        <tr>
            <td><strong class="symbol-code">${escapeHtml(symbol)}</strong></td>
            <td>${money(close)}</td>
            <td>${money(sma44)}</td>
            <td>${money(sma100)}</td>
            <td>${money(sma200)}</td>
            <td>${Number.isFinite(distance) ? distance.toFixed(2) + "%" : "—"}</td>
            <td>${Number.isFinite(open) && Number.isFinite(close) ? (close >= open ? '🟢 Green' : '🔴 Red') : '—'}</td>
            <td><span class="badge ${type === "BUY" ? "badge-green" : "badge-red"}">${type}</span></td>
            <td><button class="btn btn-sm" onclick="openStockChartFromEncoded('${rowData}')">Chart</button></td>
        </tr>
    `;
}

function renderPortfolioTable() {
    const container = document.getElementById("portfolioTableBody");
    if (!container) return;
    const rows = Array.isArray(portfolio.openPositions) ? portfolio.openPositions : [];
    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="13" class="empty-state">No active open positions</td></tr>`;
        return;
    }
    container.innerHTML = rows.map(pos => {
        const qty = pos.quantity || 0;
        const buyP = pos.buyPrice || 0;
        const currP = pos.currentPrice || buyP;
        const invested = qty * buyP;
        const currVal = qty * currP;
        const pnl = currVal - invested;
        const pnlPct = buyP ? ((currP - buyP) / buyP) * 100 : 0;

        return `
            <tr>
                <td><strong class="symbol-code">${escapeHtml(pos.symbol || "—")}</strong></td>
                <td>${qty}</td>
                <td>${money(buyP)}</td>
                <td>${money(currP)}</td>
                <td>${money(invested)}</td>
                <td>${money(currVal)}</td>
                <td class="${pnlClass(pnl)}">${money(pnl)}</td>
                <td class="${pnlClass(pnlPct)}">${percentage(pnlPct)}</td>
                <td>${money(pos.currentSMA44)}</td>
                <td>${money(pos.stopLossPrice)}</td>
                <td>${money(pos.targetPrice)}</td>
                <td><span class="badge badge-outline">${escapeHtml(pos.exitStatus || "HOLD")}</span></td>
                <td>${formatDate(pos.buyDate)}</td>
            </tr>
        `;
    }).join("");
}

function renderClosedTable() {
    const container = document.getElementById("closedTradesBody");
    if (!container) return;
    const rows = Array.isArray(portfolio.closedTrades) ? portfolio.closedTrades : [];
    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="10" class="empty-state">No closed trades recorded</td></tr>`;
        return;
    }
    container.innerHTML = rows.map(t => {
        const qty = t.quantity || 0;
        const buyP = t.buyPrice || 0;
        const sellP = t.sellPrice || 0;
        const invested = qty * buyP;
        const proceeds = qty * sellP;
        const pnl = t.pnl ?? (proceeds - invested);
        const retPct = invested ? (pnl / invested) * 100 : 0;

        return `
            <tr>
                <td><strong class="symbol-code">${escapeHtml(t.symbol || "—")}</strong></td>
                <td>${qty}</td>
                <td>${money(buyP)}</td>
                <td>${money(sellP)}</td>
                <td>${money(invested)}</td>
                <td>${money(proceeds)}</td>
                <td class="${pnlClass(pnl)}">${money(pnl)}</td>
                <td class="${pnlClass(retPct)}">${percentage(retPct)}</td>
                <td>${formatDate(t.buyDate)}</td>
                <td><span class="badge ${pnl >= 0 ? "badge-green" : "badge-red"}">${escapeHtml(t.result || (pnl >= 0 ? "WIN" : "LOSS"))}</span></td>
            </tr>
        `;
    }).join("");
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
            <td><strong class="symbol-code">${escapeHtml(item.symbol || "—")}</strong></td>
            <td><span class="badge ${item.signal === "BUY" ? "badge-green" : "badge-red"}">${escapeHtml(item.signal || "—")}</span></td>
            <td>${money(item.close)}</td>
            <td>${money(item.sma44)}</td>
            <td>${money(item.sma100)}</td>
            <td>${money(item.sma200)}</td>
        </tr>
    `).join("");
}

function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function setupNavigation() {
    document.addEventListener("click", event => {
        const target = event.target.closest("[data-tab]");
        if (!target) return;
        currentTab = target.dataset.tab;
        renderNavigation();
        renderCurrentView();
    });
}

function setupRefresh() {
    document.addEventListener("click", event => {
        if (event.target.closest('[data-action="refresh"]')) {
            loadData();
        }
    });
}

function openStockChartFromEncoded(encoded) {
    try {
        const item = JSON.parse(decodeURIComponent(encoded));
        const modal = document.getElementById("stockChartModal");
        if (modal) modal.style.display = "flex";
    } catch (e) {
        console.error(e);
    }
}

function closeChart() {
    const modal = document.getElementById("stockChartModal");
    if (modal) modal.style.display = "none";
}

document.addEventListener("DOMContentLoaded", () => {
    setupNavigation();
    setupRefresh();
    loadData();
});
