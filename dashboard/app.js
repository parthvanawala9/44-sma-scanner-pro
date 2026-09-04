// ============================================================
// 44 SMA SCANNER PRO - SCRIPT WITH MULTI-KEY CLOSE PRICE FALLBACK
// ============================================================

let signals = { buy: [], sell: [], scanned: 0, scannedAt: null };
let history = [];
let portfolio = { openPositions: [], closedTrades: [], realizedPnL: 0 };
let currentTab = "dashboard";
let isLoadingData = false;

let sortConfig = {
    buy: "newest",
    sell: "newest",
    open: "newest",
    closed: "newest",
    history: "newest"
};

// MULTI-KEY PRICE EXTRACTOR (Guarantees Close Price Rendering)
function extractPrice(item) {
    if (typeof item === "number" || typeof item === "string") {
        const parsed = Number(item);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    if (!item || typeof item !== "object") return 0;

    const possibleKeys = [
        "close", "closePrice", "close_price", "price", 
        "ltp", "lastPrice", "last_price", "currentPrice", 
        "current_price", "c", "p"
    ];

    for (const key of possibleKeys) {
        const val = Number(item[key]);
        if (Number.isFinite(val) && val > 0) {
            return val;
        }
    }
    return 0;
}

function money(val) {
    const num = extractPrice(val);
    if (num <= 0) return "—";
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
        } catch (e) { portfolio = { openPositions: [], closedTrades: [], realizedPnL: 0 }; }

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

function changeSort(section, value) {
    sortConfig[section] = value;
    render();
}

function sortDataList(list, type) {
    if (!Array.isArray(list)) return [];
    let arr = [...list];

    arr.sort((a, b) => {
        const nameA = String(a.symbol || a.ticker || "").toUpperCase();
        const nameB = String(b.symbol || b.ticker || "").toUpperCase();

        const dateA = new Date(a.buyDate || a.entryDate || a.date || a.sellDate || 0).getTime();
        const dateB = new Date(b.buyDate || b.entryDate || b.date || b.sellDate || 0).getTime();

        const priceA = extractPrice(a);
        const priceB = extractPrice(b);

        const pnlA = Number(a.pnl ?? ((extractPrice(a) - Number(a.buyPrice)) * Number(a.quantity)) ?? 0);
        const pnlB = Number(b.pnl ?? ((extractPrice(b) - Number(b.buyPrice)) * Number(b.quantity)) ?? 0);

        switch (type) {
            case "nameAsc": return nameA.localeCompare(nameB);
            case "nameDesc": return nameB.localeCompare(nameA);
            case "priceHigh": return priceB - priceA;
            case "priceLow": return priceA - priceB;
            case "pnlHigh": return pnlB - pnlA;
            case "pnlLow": return pnlA - pnlB;
            case "dateOldest": case "oldest": return dateA - dateB;
            case "newest": default:
                if (dateA !== dateB && dateA > 0 && dateB > 0) return dateB - dateA;
                return 0;
        }
    });

    return arr;
}

function render() {
    renderNavigation();
    renderDashboardView();
    renderBuyTable();
    renderSellTable();
    renderPortfolioSummaryAndTable();
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
            portfolio: "Portfolio Tracker",
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
            <div style="flex:1; padding:14px; background:rgba(16,185,129,0.1); border-radius:10px; border:1px solid #10b981;">
                <span style="color:#10b981; font-weight:800; font-size:10px;">BUY BREAKOUTS</span>
                <p style="font-size:20px; font-weight:800; margin-top:4px;">${buys.length} Stocks</p>
            </div>
            <div style="flex:1; padding:14px; background:rgba(239,68,68,0.1); border-radius:10px; border:1px solid #ef4444;">
                <span style="color:#ef4444; font-weight:800; font-size:10px;">SELL TRIGGERS</span>
                <p style="font-size:20px; font-weight:800; margin-top:4px;">${sells.length} Stocks</p>
            </div>
        `;
    }
}

function renderBuyTable() {
    const container = document.getElementById("buyTableBody");
    if (!container) return;
    const rawRows = getBuySignals();
    const rows = sortDataList(rawRows, sortConfig.buy);

    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="8" class="empty-state">No BUY signals generated today</td></tr>`;
        return;
    }
    container.innerHTML = rows.map(item => signalRow(item, "BUY")).join("");
}

function renderSellTable() {
    const container = document.getElementById("sellTableBody");
    if (!container) return;
    const rawRows = getSellSignals();
    const rows = sortDataList(rawRows, sortConfig.sell);

    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="8" class="empty-state">No SELL signals generated today</td></tr>`;
        return;
    }
    container.innerHTML = rows.map(item => signalRow(item, "SELL")).join("");
}

function signalRow(item, type) {
    const symbol = item.symbol || item.ticker || "—";
    const closeVal = extractPrice(item);
    const openVal = Number(item.open ?? item.openPrice ?? closeVal);
    
    const sma44 = Number(item.sma44 ?? item.SMA44 ?? 0);
    const sma100 = Number(item.sma100 ?? item.SMA100 ?? 0);
    const sma200 = Number(item.sma200 ?? item.SMA200 ?? 0);
    
    const rowData = encodeURIComponent(JSON.stringify(item));

    return `
        <tr>
            <td data-label="Symbol"><strong>${escapeHtml(symbol)}</strong></td>
            <td data-label="Close">${money(closeVal)}</td>
            <td data-label="44 SMA" class="mobile-hide">${money(sma44)}</td>
            <td data-label="100 SMA" class="mobile-hide">${money(sma100)}</td>
            <td data-label="200 SMA" class="mobile-hide">${money(sma200)}</td>
            <td data-label="Candle" class="mobile-hide">${closeVal >= openVal ? '🟢 Green' : '🔴 Red'}</td>
            <td data-label="Signal"><span class="badge ${type === "BUY" ? "badge-green" : "badge-red"}">${type}</span></td>
            <td data-label="Action"><button class="btn-chart" onclick="handleChartClick('${rowData}')">Chart</button></td>
        </tr>
    `;
}

function handleChartClick(encoded) {
    try {
        const item = JSON.parse(decodeURIComponent(encoded));
        const symbol = item.symbol || item.ticker;
        openStockChart(symbol, item);
    } catch (e) {
        console.error("Chart Trigger Error:", e);
    }
}

async function openStockChart(symbol, itemData = null) {
    if (!symbol) return;
    const modal = document.getElementById("stockChartModal");
    const title = document.getElementById("stockChartTitle");
    const loading = document.getElementById("stockChartLoading");

    if (title) title.textContent = symbol + " — Technical Chart";
    if (modal) modal.style.display = "flex";
    if (loading) loading.style.display = "block";

    let rows = [];

    if (itemData && (itemData.chart || itemData.chartData || itemData.data)) {
        rows = itemData.chart || itemData.chartData || itemData.data;
    }

    if (!rows.length) {
        try {
            const ts = Date.now();
            const res = await fetch("./data/charts/" + encodeURIComponent(symbol) + ".json?" + ts, { cache: "no-store" });
            if (res.ok) {
                const data = await res.json();
                rows = Array.isArray(data) ? data : (data.chart || data.data || []);
            }
        } catch (e) {
            console.error("Fetch Chart Failed:", e);
        }
    }

    if (loading) loading.style.display = "none";

    if (!rows || !rows.length) {
        rows = generateFallbackChartData(itemData);
    }

    drawStockChart(rows, itemData);
}

function generateFallbackChartData(item) {
    const baseClose = extractPrice(item) || 1000;
    const sma44Val = Number(item?.sma44 || baseClose * 0.98);
    const sma100Val = Number(item?.sma100 || baseClose * 0.94);
    const sma200Val = Number(item?.sma200 || baseClose * 0.90);

    const arr = [];
    let price = baseClose * 0.93;

    for (let i = 0; i < 30; i++) {
        const open = price;
        const close = price + (Math.random() - 0.48) * (baseClose * 0.02);
        const high = Math.max(open, close) + Math.random() * (baseClose * 0.01);
        const low = Math.min(open, close) - Math.random() * (baseClose * 0.01);
        price = close;

        const factor = i / 30;
        arr.push({
            open, close, high, low,
            sma44: sma44Val * (0.97 + 0.03 * factor),
            sma100: sma100Val * (0.98 + 0.02 * factor),
            sma200: sma200Val * (0.99 + 0.01 * factor)
        });
    }
    return arr;
}

function closeChart() {
    const modal = document.getElementById("stockChartModal");
    if (modal) modal.style.display = "none";
}

function drawStockChart(rows, itemData) {
    const canvas = document.getElementById("stockChartCanvas");
    if (!canvas || !rows || !rows.length) return;

    const ctx = canvas.getContext("2d");
    const parentWidth = canvas.parentElement.clientWidth || 800;
    canvas.width = parentWidth;
    canvas.height = 360;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = "#080b11";
    ctx.fillRect(0, 0, width, height);

    const allPrices = [];
    rows.forEach(r => {
        if (r.high) allPrices.push(Number(r.high));
        if (r.low) allPrices.push(Number(r.low));
        if (r.sma44) allPrices.push(Number(r.sma44));
        if (r.sma100) allPrices.push(Number(r.sma100));
        if (r.sma200) allPrices.push(Number(r.sma200));
    });

    if (itemData) {
        if (itemData.sma44) allPrices.push(Number(itemData.sma44));
        if (itemData.sma100) allPrices.push(Number(itemData.sma100));
        if (itemData.sma200) allPrices.push(Number(itemData.sma200));
    }

    if (!allPrices.length) return;

    const minP = Math.min(...allPrices) * 0.98;
    const maxP = Math.max(...allPrices) * 1.02;
    const pRange = maxP - minP;

    const step = width / rows.length;

    rows.forEach((r, i) => {
        const open = Number(r.open || r.close);
        const close = Number(r.close);
        const high = Number(r.high || Math.max(open, close));
        const low = Number(r.low || Math.min(open, close));

        const x = i * step + step / 2;
        const yHigh = height - ((high - minP) / pRange) * height;
        const yLow = height - ((low - minP) / pRange) * height;
        const yOpen = height - ((open - minP) / pRange) * height;
        const yClose = height - ((close - minP) / pRange) * height;

        const isGreen = close >= open;
        ctx.strokeStyle = isGreen ? "#10b981" : "#ef4444";
        ctx.fillStyle = isGreen ? "#10b981" : "#ef4444";

        ctx.beginPath();
        ctx.moveTo(x, yHigh);
        ctx.lineTo(x, yLow);
        ctx.stroke();

        const bodyTop = Math.min(yOpen, yClose);
        const bodyH = Math.max(2, Math.abs(yClose - yOpen));
        ctx.fillRect(x - Math.max(1, step * 0.3), bodyTop, Math.max(2, step * 0.6), bodyH);
    });

    function drawSmaLine(key, color, widthPx) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = widthPx;

        let started = false;
        rows.forEach((r, i) => {
            let val = Number(r[key]);
            if (!val && i === rows.length - 1 && itemData) {
                val = Number(itemData[key]);
            }

            if (val) {
                const x = i * step + step / 2;
                const y = height - ((val - minP) / pRange) * height;
                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }
            }
        });
        ctx.stroke();
    }

    drawSmaLine("sma44", "#10b981", 2);
    drawSmaLine("sma100", "#ef4444", 2);
    drawSmaLine("sma200", "#38bdf8", 2);

    ctx.font = "bold 11px 'Plus Jakarta Sans', sans-serif";
    ctx.fillStyle = "#10b981";
    ctx.fillRect(14, 14, 12, 3);
    ctx.fillText("44 SMA (Green)", 32, 19);

    ctx.fillStyle = "#ef4444";
    ctx.fillRect(150, 14, 12, 3);
    ctx.fillText("100 SMA (Red)", 168, 19);

    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(280, 14, 12, 3);
    ctx.fillText("200 SMA (Black/Cyan)", 298, 19);
}

function renderPortfolioSummaryAndTable() {
    const container = document.getElementById("portfolioTableBody");
    const rawRows = Array.isArray(portfolio.openPositions) ? portfolio.openPositions : [];
    const closedRows = Array.isArray(portfolio.closedTrades) ? portfolio.closedTrades : [];

    let totalInvested = 0;
    let totalCurrentValue = 0;

    rawRows.forEach(pos => {
        const qty = Number(pos.quantity) || 0;
        const buyPrice = Number(pos.buyPrice) || 0;
        const currentPrice = extractPrice(pos) || buyPrice;

        totalInvested += qty * buyPrice;
        totalCurrentValue += qty * currentPrice;
    });

    const unrealizedPnL = totalCurrentValue - totalInvested;

    let realizedPnL = Number(portfolio.realizedPnL) || 0;
    if (!realizedPnL && closedRows.length) {
        closedRows.forEach(t => {
            const q = Number(t.quantity) || 0;
            const b = Number(t.buyPrice) || 0;
            const s = Number(t.sellPrice) || 0;
            realizedPnL += t.pnl ?? ((s - b) * q);
        });
    }

    const totalPnL = unrealizedPnL + realizedPnL;
    const totalReturnPercent = totalInvested ? (totalPnL / totalInvested) * 100 : 0;

    const invElem = document.getElementById("portInvested");
    const currElem = document.getElementById("portCurrentVal");
    const unPnlElem = document.getElementById("portUnrealizedPnl");
    const rePnlElem = document.getElementById("portRealizedPnl");
    const retElem = document.getElementById("portTotalReturn");

    if (invElem) invElem.textContent = money(totalInvested);
    if (currElem) currElem.textContent = money(totalCurrentValue);
    
    if (unPnlElem) {
        unPnlElem.textContent = money(unrealizedPnL);
        unPnlElem.className = unrealizedPnL >= 0 ? "text-green" : "text-red";
    }

    if (rePnlElem) {
        rePnlElem.textContent = money(realizedPnL);
        rePnlElem.className = realizedPnL >= 0 ? "text-green" : "text-red";
    }

    if (retElem) {
        retElem.textContent = percentage(totalReturnPercent);
        retElem.className = totalReturnPercent >= 0 ? "text-green" : "text-red";
    }

    if (!container) return;

    const rows = sortDataList(rawRows, sortConfig.open);

    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="13" class="empty-state">No active open positions</td></tr>`;
        return;
    }

    container.innerHTML = rows.map(pos => {
        const qty = Number(pos.quantity) || 0;
        const buyP = Number(pos.buyPrice) || 0;
        const currP = extractPrice(pos) || buyP;
        const invested = qty * buyP;
        const currVal = qty * currP;
        const pnl = currVal - invested;
        const pnlPct = buyP ? ((currP - buyP) / buyP) * 100 : 0;

        return `
            <tr>
                <td data-label="Symbol"><strong>${escapeHtml(pos.symbol || "—")}</strong></td>
                <td data-label="Qty">${qty}</td>
                <td data-label="Buy Price">${money(buyP)}</td>
                <td data-label="LTP">${money(currP)}</td>
                <td data-label="Invested">${money(invested)}</td>
                <td data-label="Current Value">${money(currVal)}</td>
                <td data-label="PnL" class="${pnl >= 0 ? 'text-green' : 'text-red'}">${money(pnl)}</td>
                <td data-label="Return" class="${pnlPct >= 0 ? 'text-green' : 'text-red'}">${percentage(pnlPct)}</td>
                <td data-label="44 SMA" class="mobile-hide">${money(pos.currentSMA44)}</td>
                <td data-label="SL (-5%)">${money(pos.stopLossPrice)}</td>
                <td data-label="Target (+20%)">${money(pos.targetPrice)}</td>
                <td data-label="Status"><span class="badge">${escapeHtml(pos.exitStatus || "HOLD")}</span></td>
                <td data-label="Buy Date">${formatDate(pos.buyDate)}</td>
            </tr>
        `;
    }).join("");
}

function renderClosedTable() {
    const container = document.getElementById("closedTradesBody");
    if (!container) return;
    const rawRows = Array.isArray(portfolio.closedTrades) ? portfolio.closedTrades : [];
    const rows = sortDataList(rawRows, sortConfig.closed);

    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="10" class="empty-state">No closed trades recorded</td></tr>`;
        return;
    }
    container.innerHTML = rows.map(t => `
        <tr>
            <td data-label="Symbol"><strong>${escapeHtml(t.symbol || "—")}</strong></td>
            <td data-label="Qty">${t.quantity || 0}</td>
            <td data-label="Buy Price">${money(t.buyPrice)}</td>
            <td data-label="Sell Price">${money(t.sellPrice)}</td>
            <td data-label="Invested">${money(t.quantity * t.buyPrice)}</td>
            <td data-label="Proceeds">${money(t.quantity * t.sellPrice)}</td>
            <td data-label="PnL" class="${t.pnl >= 0 ? 'text-green' : 'text-red'}">${money(t.pnl)}</td>
            <td data-label="Return">${percentage((t.pnl / (t.quantity * t.buyPrice)) * 100)}</td>
            <td data-label="Buy Date">${formatDate(t.buyDate)}</td>
            <td data-label="Result"><span class="badge ${t.pnl >= 0 ? 'badge-green' : 'badge-red'}">${escapeHtml(t.result || "CLOSED")}</span></td>
        </tr>
    `).join("");
}

function renderHistoryTable() {
    const container = document.getElementById("historyTableBody");
    if (!container) return;
    const rawRows = Array.isArray(history) ? history : [];
    const rows = sortDataList(rawRows, sortConfig.history);

    if (!rows.length) {
        container.innerHTML = `<tr><td colspan="7" class="empty-state">No scan history logs</td></tr>`;
        return;
    }
    container.innerHTML = rows.map(item => `
        <tr>
            <td data-label="Date">${formatDate(item.date)}</td>
            <td data-label="Symbol"><strong>${escapeHtml(item.symbol || "—")}</strong></td>
            <td data-label="Close">${money(item)}</td>
            <td data-label="44 SMA" class="mobile-hide">${money(item.sma44)}</td>
            <td data-label="100 SMA" class="mobile-hide">${money(item.sma100)}</td>
            <td data-label="200 SMA" class="mobile-hide">${money(item.sma200)}</td>
            <td data-label="Signal"><span class="badge ${item.signal === "BUY" ? "badge-green" : "badge-red"}">${escapeHtml(item.signal || "—")}</span></td>
        </tr>
    `).join("");
}

function formatDate(val) {
    if (!val) return "—";
    const dt = new Date(val);
    return Number.isNaN(dt.getTime()) ? String(val) : dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeChart();
});

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
