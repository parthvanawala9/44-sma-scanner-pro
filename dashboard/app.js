// ============================================================
// 44 SMA SCANNER PRO
// DASHBOARD + PORTFOLIO (Fixed Logic)
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
    totalPnLPercent: 0,
    openPositionsCount: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0
};

let currentTab = "dashboard";
let currentChartRows = null;
let portfolioSort = "buyDateDesc";
let closedTradeSort = "sellDateDesc";
let isLoadingData = false;

const $ = selector => document.querySelector(selector);

function money(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return number.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function percentage(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    const sign = number >= 0 ? "+" : "";
    return sign + number.toFixed(2) + "%";
}

function pnlClass(value) {
    const number = Number(value);
    if (number > 0) return "green";
    if (number < 0) return "red";
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

async function loadData(options = {}) {
    if (isLoadingData) return;
    isLoadingData = true;

    const refreshButton = findRefreshButton();
    const originalRefreshText = refreshButton ? refreshButton.textContent : null;

    if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.dataset.loading = "true";
        refreshButton.textContent = "↻ Loading...";
        refreshButton.style.opacity = "0.7";
        refreshButton.style.cursor = "wait";
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
                const historyData = await historyResponse.json();
                history = Array.isArray(historyData) ? historyData : [];
            }
        } catch (e) {
            history = [];
        }

        try {
            const portfolioResponse = await fetch("./data/portfolio.json?" + timestamp, { cache: "no-store" });
            if (portfolioResponse.ok) {
                const portfolioData = await portfolioResponse.json();
                if (portfolioData && typeof portfolioData === "object" && !Array.isArray(portfolioData)) {
                    portfolio = portfolioData;
                } else {
                    portfolio = createEmptyPortfolio();
                }
            }
        } catch (e) {
            portfolio = createEmptyPortfolio();
        }

        normalizePortfolio();
        updateLastScan();
        render();

    } catch (error) {
        console.error("Dashboard data error:", error);
        renderError("Unable to load dashboard data.");
    } finally {
        isLoadingData = false;
        const button = findRefreshButton();
        if (button) {
            button.disabled = false;
            button.dataset.loading = "false";
            button.textContent = originalRefreshText || "↻ Refresh Data";
            button.style.opacity = "";
            button.style.cursor = "";
        }
    }
}

function createEmptyPortfolio() {
    return {
        allocationPerStock: 5000,
        openPositions: [],
        closedTrades: [],
        pendingOrders: [],
        realizedPnL: 0,
        unrealizedPnL: 0,
        totalInvested: 0,
        totalCurrentValue: 0,
        totalPnL: 0,
        totalPnLPercent: 0,
        openPositionsCount: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0
    };
}

function normalizePortfolio() {
    if (!portfolio || typeof portfolio !== "object") portfolio = createEmptyPortfolio();
    if (!Array.isArray(portfolio.openPositions)) portfolio.openPositions = [];
    if (!Array.isArray(portfolio.closedTrades)) portfolio.closedTrades = [];
}

function findRefreshButton() {
    return document.querySelector('[data-action="refresh"]') || document.querySelector("#refreshButton");
}

function updateLastScan() {
    const element = document.getElementById("lastScan");
    if (!element) return;
    const value = signals.scannedAt || signals.scanDate || signals.date || null;
    if (!value) {
        element.textContent = "Last scan: —";
        return;
    }
    const date = new Date(value);
    element.textContent = Number.isNaN(date.getTime()) ? "Last scan: " + String(value) : "Last scan: " + date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function render() {
    renderNavigation();
    renderDashboard();
    renderSignals();
    renderPortfolio();
    renderHistory();
    renderCurrentView();
}

function renderNavigation() {
    document.querySelectorAll("[data-tab]").forEach(element => {
        element.classList.toggle("active", element.dataset.tab === currentTab);
    });
    const pageTitle = document.getElementById("pageTitle");
    if (pageTitle) {
        pageTitle.textContent = currentTab.charAt(0).toUpperCase() + currentTab.slice(1);
    }
}

function renderCurrentView() {
    document.querySelectorAll("[data-page]").forEach(page => {
        page.style.display = page.dataset.page === currentTab ? "" : "none";
    });
}

function getBuySignals() { return Array.isArray(signals.buy) ? signals.buy : (Array.isArray(signals.buys) ? signals.buys : []); }
function getSellSignals() { return Array.isArray(signals.sell) ? signals.sell : (Array.isArray(signals.sells) ? signals.sells : []); }

function renderDashboard() {
    const buySignals = getBuySignals();
    const sellSignals = getSellSignals();
    renderSignalSummary(buySignals, sellSignals);
}

function renderSignalSummary(buySignals, sellSignals) {
    const container = document.getElementById("signalSummary");
    if (!container) return;
    container.innerHTML = `
        <div class="summary-card">
            <div class="summary-label">BUY SIGNALS</div>
            <div class="summary-value green">${buySignals.length}</div>
        </div>
        <div class="summary-card">
            <div class="summary-label">SELL SIGNALS</div>
            <div class="summary-value red">${sellSignals.length}</div>
        </div>
    `;
}

function renderSignals() {
    renderBuyTable();
    renderSellTable();
}

function renderBuyTable() {
    const container = document.getElementById("buyTableBody");
    if (!container) return;
    const rows = getBuySignals();
    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="9" class="empty-state">No BUY signals today</td></tr>`;
        return;
    }
    container.innerHTML = rows.map(item => signalRow(item, "BUY")).join("");
}

function renderSellTable() {
    const container = document.getElementById("sellTableBody");
    if (!container) return;
    const rows = getSellSignals();
    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="9" class="empty-state">No SELL signals today</td></tr>`;
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
            <td><strong>${escapeHtml(symbol)}</strong></td>
            <td>₹${money(close)}</td>
            <td>₹${money(sma44)}</td>
            <td>₹${money(sma100)}</td>
            <td>₹${money(sma200)}</td>
            <td>${Number.isFinite(distance) ? distance.toFixed(2) + "%" : "—"}</td>
            <td>${Number.isFinite(open) && Number.isFinite(close) ? (close > open ? "🟢 Green" : "🔴 Red") : "—"}</td>
            <td><span class="signal-badge ${type === "BUY" ? "buy" : "sell"}">${type}</span></td>
            <td><button class="view-chart-btn" onclick="openStockChartFromEncoded('${rowData}')">Chart</button></td>
        </tr>
    `;
}

function renderPortfolio() {
    renderPortfolioStrategy();
    renderOpenPositions();
    renderClosedTrades();
}

function renderPortfolioStrategy() {
    const container = document.getElementById("portfolioExitStrategy");
    if (!container) return;
    container.innerHTML = `
        <div class="portfolio-strategy-title">🎯 Portfolio Exit Strategy</div>
        <div class="portfolio-strategy-grid">
            <div class="portfolio-strategy-item"><strong>🛑 Basic SL:</strong> -5%</div>
            <div class="portfolio-strategy-item"><strong>🎯 Target:</strong> +20%</div>
            <div class="portfolio-strategy-item"><strong>📉 Trailing SL:</strong> Close < 44 SMA</div>
        </div>
    `;
}

function renderOpenPositions() {
    const container = document.getElementById("portfolioTableBody");
    if (!container) return;
    const rows = Array.isArray(portfolio.openPositions) ? portfolio.openPositions : [];
    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="13" class="empty-state">No open positions</td></tr>`;
        return;
    }
    container.innerHTML = rows.map(pos => `
        <tr>
            <td><strong>${escapeHtml(pos.symbol || "—")}</strong></td>
            <td>${pos.quantity || 0}</td>
            <td>₹${money(pos.buyPrice)}</td>
            <td>₹${money(pos.currentPrice || pos.buyPrice)}</td>
            <td>₹${money((pos.quantity || 0) * (pos.buyPrice || 0))}</td>
            <td>₹${money((pos.quantity || 0) * (pos.currentPrice || pos.buyPrice || 0))}</td>
            <td class="${pnlClass((pos.currentPrice - pos.buyPrice) * pos.quantity)}">₹${money((pos.currentPrice - pos.buyPrice) * pos.quantity)}</td>
            <td>${percentage(((pos.currentPrice - pos.buyPrice) / pos.buyPrice) * 100)}</td>
            <td>₹${money(pos.currentSMA44)}</td>
            <td>₹${money(pos.stopLossPrice)}</td>
            <td>₹${money(pos.targetPrice)}</td>
            <td>${escapeHtml(pos.exitStatus || "HOLD")}</td>
            <td>${formatDate(pos.buyDate)}</td>
        </tr>
    `).join("");
}

function renderClosedTrades() {
    const container = document.getElementById("closedTradesBody");
    if (!container) return;
    const rows = Array.isArray(portfolio.closedTrades) ? portfolio.closedTrades : [];
    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="10" class="empty-state">No closed trades</td></tr>`;
        return;
    }
    container.innerHTML = rows.map(t => `
        <tr>
            <td><strong>${escapeHtml(t.symbol || "—")}</strong></td>
            <td>${t.quantity || 0}</td>
            <td>₹${money(t.buyPrice)}</td>
            <td>₹${money(t.sellPrice)}</td>
            <td>₹${money(t.quantity * t.buyPrice)}</td>
            <td>₹${money(t.quantity * t.sellPrice)}</td>
            <td class="${pnlClass(t.pnl)}">₹${money(t.pnl)}</td>
            <td>${percentage((t.pnl / (t.quantity * t.buyPrice)) * 100)}</td>
            <td>${formatDate(t.buyDate)}</td>
            <td>${escapeHtml(t.result || "CLOSED")}</td>
        </tr>
    `).join("");
}

function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function renderHistory() {
    const container = document.getElementById("historyTableBody");
    if (!container) return;
    const rows = Array.isArray(history) ? history : [];
    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="7" class="empty-state">No scan history available</td></tr>`;
        return;
    }
    container.innerHTML = rows.slice().reverse().map(item => `
        <tr>
            <td>${formatDate(item.date)}</td>
            <td><strong>${escapeHtml(item.symbol || "—")}</strong></td>
            <td><span class="signal-badge ${item.signal === "BUY" ? "buy" : "sell"}">${escapeHtml(item.signal || "—")}</span></td>
            <td>₹${money(item.close)}</td>
            <td>₹${money(item.sma44)}</td>
            <td>₹${money(item.sma100)}</td>
            <td>₹${money(item.sma200)}</td>
        </tr>
    `).join("");
}

function renderError(message) {
    console.error(message);
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
            loadData({ manual: true });
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

// Auto Load on page ready
document.addEventListener("DOMContentLoaded", () => {
    setupNavigation();
    setupRefresh();
    loadData();
});
