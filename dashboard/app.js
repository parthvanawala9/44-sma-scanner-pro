// पूरा App.js नीचे है — सीधे copy करके dashboard/app.js में paste करो।

// ============================================================
// 44 SMA SCANNER PRO
// DASHBOARD + PORTFOLIO
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

        const signalResponse = await fetch("./data/signals.json?" + timestamp, {
            cache: "no-store"
        });

        if (!signalResponse.ok) {
            throw new Error("signals.json could not be loaded");
        }

        const signalData = await signalResponse.json();

        if (!signalData || typeof signalData !== "object") {
            throw new Error("signals.json contains invalid data");
        }

        signals = signalData;

        try {
            const historyResponse = await fetch("./data/history.json?" + timestamp, {
                cache: "no-store"
            });

            if (historyResponse.ok) {
                const historyData = await historyResponse.json();
                history = Array.isArray(historyData) ? historyData : [];
            } else {
                history = [];
            }
        } catch (historyError) {
            console.error("History data error:", historyError);
            history = [];
        }

        try {
            const portfolioResponse = await fetch("./data/portfolio.json?" + timestamp, {
                cache: "no-store"
            });

            if (portfolioResponse.ok) {
                const portfolioData = await portfolioResponse.json();

                if (
                    portfolioData &&
                    typeof portfolioData === "object" &&
                    !Array.isArray(portfolioData)
                ) {
                    portfolio = portfolioData;
                } else {
                    console.error("portfolio.json contains invalid object data");
                    portfolio = createEmptyPortfolio();
                }
            } else {
                console.error(
                    "portfolio.json HTTP error:",
                    portfolioResponse.status
                );
                portfolio = createEmptyPortfolio();
            }
        } catch (portfolioError) {
            console.error("Portfolio data error:", portfolioError);
            portfolio = createEmptyPortfolio();
        }

        try {
            normalizePortfolio();
        } catch (normalizeError) {
            console.error(
                "Portfolio normalization error:",
                normalizeError
            );
            portfolio = createEmptyPortfolio();
        }

        updateLastScan();

        try {
            render();
        } catch (renderError) {
            console.error("Dashboard render error:", renderError);
            portfolio = createEmptyPortfolio();

            try {
                render();
            } catch (secondRenderError) {
                console.error(
                    "Second dashboard render error:",
                    secondRenderError
                );
                throw secondRenderError;
            }
        }

        console.log("44 SMA data loaded successfully");
        console.log("Signals:", signals);
        console.log("History:", history);
        console.log("Portfolio:", portfolio);
    } catch (error) {
        console.error("Dashboard data error:", error);
        renderError("Unable to load dashboard data.");
    } finally {
        isLoadingData = false;

        const button = findRefreshButton();

        if (button) {
            button.disabled = false;
            button.dataset.loading = "false";
            button.textContent = originalRefreshText || "↻ Refresh";
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
    if (!portfolio || typeof portfolio !== "object") {
        portfolio = createEmptyPortfolio();
    }

    if (!Array.isArray(portfolio.openPositions)) {
        portfolio.openPositions = [];
    }

    if (!Array.isArray(portfolio.closedTrades)) {
        portfolio.closedTrades = [];
    }

    if (!Number.isFinite(Number(portfolio.allocationPerStock))) {
        portfolio.allocationPerStock = 5000;
    }

    portfolio.realizedPnL = Number(portfolio.realizedPnL) || 0;
    portfolio.unrealizedPnL = Number(portfolio.unrealizedPnL) || 0;
    portfolio.totalInvested = Number(portfolio.totalInvested) || 0;
    portfolio.totalCurrentValue = Number(portfolio.totalCurrentValue) || 0;
    portfolio.totalPnL = Number(portfolio.totalPnL) || 0;
    portfolio.totalPnLPercent = Number(portfolio.totalPnLPercent) || 0;

    portfolio.openPositionsCount =
        portfolio.openPositions.length;

    portfolio.totalTrades =
        Number(portfolio.totalTrades) ||
        portfolio.closedTrades.length;

    portfolio.winningTrades =
        Number(portfolio.winningTrades) ||
        portfolio.closedTrades.filter(
            trade => Number(trade.pnl) > 0
        ).length;

    portfolio.losingTrades =
        Number(portfolio.losingTrades) ||
        portfolio.closedTrades.filter(
            trade => Number(trade.pnl) < 0
        ).length;
}

function findRefreshButton() {
    return (
        document.querySelector(
            '[data-action="refresh"]'
        ) ||
        document.querySelector(
            "#refreshButton"
        ) ||
        document.querySelector(
            ".refresh-btn"
        ) ||
        Array.from(
            document.querySelectorAll("button")
        ).find(
            button =>
                /refresh/i.test(
                    button.textContent || ""
                )
        )
    );
}

function updateLastScan() {
    const element =
        document.getElementById("lastScan");

    if (!element) return;

    const value =
        signals.scannedAt ||
        signals.scanDate ||
        signals.date ||
        null;

    if (!value) {
        element.textContent = "Last scan: —";
        return;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        element.textContent =
            "Last scan: " +
            String(value);

        return;
    }

    element.textContent =
        "Last scan: " +
        date.toLocaleString(
            "en-IN",
            {
                dateStyle: "medium",
                timeStyle: "short"
            }
        );
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
    document
        .querySelectorAll(
            "[data-tab]"
        )
        .forEach(
            element => {
                const tab =
                    element.dataset.tab;

                element.classList.toggle(
                    "active",
                    tab === currentTab
                );
            }
        );
}

function renderCurrentView() {
    document
        .querySelectorAll(
            "[data-page]"
        )
        .forEach(
            page => {
                const pageName =
                    page.dataset.page;

                page.style.display =
                    pageName === currentTab
                        ? ""
                        : "none";
            }
        );
}

function getBuySignals() {
    if (
        signals &&
        Array.isArray(
            signals.buy
        )
    ) {
        return signals.buy;
    }

    if (
        signals &&
        Array.isArray(
            signals.buys
        )
    ) {
        return signals.buys;
    }

    return [];
}

function getSellSignals() {
    if (
        signals &&
        Array.isArray(
            signals.sell
        )
    ) {
        return signals.sell;
    }

    if (
        signals &&
        Array.isArray(
            signals.sells
        )
    ) {
        return signals.sells;
    }

    return [];
}

function renderDashboard() {
    const buySignals =
        getBuySignals();

    const sellSignals =
        getSellSignals();

    const scanned =
        Number(
            signals.scanned
        ) ||
        Number(
            signals.universeCount
        ) ||
        0;

    const skipped =
        Number(
            signals.skipped
        ) ||
        0;

    const buyCount =
        buySignals.length;

    const sellCount =
        sellSignals.length;

    setText(
        [
            "buyCount",
            "totalBuys",
            "dashboardBuyCount"
        ],
        buyCount
    );

    setText(
        [
            "sellCount",
            "totalSells",
            "dashboardSellCount"
        ],
        sellCount
    );

    setText(
        [
            "scannedCount",
            "totalScanned",
            "dashboardScannedCount"
        ],
        scanned
    );

    setText(
        [
            "skippedCount",
            "totalSkipped",
            "dashboardSkippedCount"
        ],
        skipped
    );

    setText(
        [
            "universeCount",
            "dashboardUniverseCount"
        ],
        Number(
            signals.universeCount
        ) ||
        scanned
    );

    renderSignalSummary(
        buySignals,
        sellSignals
    );
}

function setText(
    ids,
    value
) {
    ids.forEach(
        id => {
            const element =
                document.getElementById(
                    id
                );

            if (element) {
                element.textContent =
                    String(value);
            }
        }
    );
}

function renderSignalSummary(
    buySignals,
    sellSignals
) {
    const container =
        document.getElementById(
            "signalSummary"
        );

    if (!container) return;

    container.innerHTML = `
        <div class="summary-card">
            <div class="summary-label">BUY</div>
            <div class="summary-value green">${buySignals.length}</div>
        </div>
        <div class="summary-card">
            <div class="summary-label">SELL</div>
            <div class="summary-value red">${sellSignals.length}</div>
        </div>
    `;
}

function renderSignals() {
    renderBuyTable();
    renderSellTable();
}

function renderBuyTable() {
    const container =
        document.getElementById(
            "buyTableBody"
        ) ||
        document.getElementById(
            "buySignalsBody"
        );

    if (!container) return;

    const rows =
        getBuySignals();

    if (!rows.length) {
        container.innerHTML = `
            <tr>
                <td colspan="10" class="empty-state">
                    No BUY signals today
                </td>
            </tr>
        `;

        return;
    }

    container.innerHTML =
        rows
            .map(
                item =>
                    signalRow(
                        item,
                        "BUY"
                    )
            )
            .join("");
}

function renderSellTable() {
    const container =
        document.getElementById(
            "sellTableBody"
        ) ||
        document.getElementById(
            "sellSignalsBody"
        );

    if (!container) return;

    const rows =
        getSellSignals();

    if (!rows.length) {
        container.innerHTML = `
            <tr>
                <td colspan="10" class="empty-state">
                    No SELL signals today
                </td>
            </tr>
        `;

        return;
    }

    container.innerHTML =
        rows
            .map(
                item =>
                    signalRow(
                        item,
                        "SELL"
                    )
            )
            .join("");
}

function signalRow(
    item,
    type
) {
    const symbol =
        item.symbol ||
        item.ticker ||
        item.name ||
        "—";

    const close =
        Number(
            item.close ??
            item.closePrice ??
            item.price
        );

    const open =
        Number(
            item.open
        );

    const sma44 =
        Number(
            item.sma44 ??
            item.SMA44
        );

    const sma100 =
        Number(
            item.sma100 ??
            item.SMA100
        );

    const sma200 =
        Number(
            item.sma200 ??
            item.SMA200
        );

    const distance =
        Number(
            item.distanceFrom44 ??
            item.buyDistanceFrom44
        );

    const rowData =
        encodeURIComponent(
            JSON.stringify(
                item
            )
        );

    return `
        <tr>
            <td>
                <strong>${escapeHtml(symbol)}</strong>
            </td>
            <td>₹${money(close)}</td>
            <td>₹${money(sma44)}</td>
            <td>₹${money(sma100)}</td>
            <td>₹${money(sma200)}</td>
            <td>${Number.isFinite(distance) ? distance.toFixed(2) + "%" : "—"}</td>
            <td>${Number.isFinite(open) && Number.isFinite(close) ? (close > open ? "🟢 Green" : "🔴 Red") : "—"}</td>
            <td>
                <span class="signal-badge ${type === "BUY" ? "buy" : "sell"}">
                    ${type}
                </span>
            </td>
            <td>
                <button
                    class="view-chart-btn"
                    onclick="openStockChartFromEncoded('${rowData}')"
                >
                    Chart
                </button>
            </td>
        </tr>
    `;
}

function renderPortfolio() {
    renderPortfolioStrategy();
    renderPortfolioSummary();
    renderOpenPositions();
    renderClosedTrades();
}

function renderPortfolioStrategy() {
    const container =
        document.getElementById(
            "portfolioExitStrategy"
        );

    if (!container) return;

    container.innerHTML = `
        <div class="portfolio-strategy-title">
            🎯 Portfolio Exit Strategy
        </div>

        <div class="portfolio-strategy-grid">

            <div class="portfolio-strategy-item">
                <strong>🛑 Basic Stop Loss</strong>
                <span>-5%</span>
                <small>
                    Buy Price से 5% नीचे Close होने पर SELL
                </small>
            </div>

            <div class="portfolio-strategy-item">
                <strong>🎯 Target</strong>
                <span>+20%</span>
                <small>
                    Buy Price से 20% ऊपर Close होने पर SELL
                </small>
            </div>

            <div class="portfolio-strategy-item">
                <strong>📉 Trailing Stop Loss</strong>
                <span>Close &lt; 44 SMA</span>
                <small>
                    Daily Close 44 SMA के नीचे होने पर SELL
                </small>
            </div>

        </div>

        <div class="portfolio-strategy-note">
            जो condition पहले trigger होगी, उसी पर पूरा position EXIT होगा.
        </div>
    `;
}

function renderPortfolioSummary() {
    const openPositions =
        Array.isArray(
            portfolio.openPositions
        )
            ? portfolio.openPositions
            : [];

    let invested = 0;
    let currentValue = 0;
    let unrealized = 0;

    openPositions.forEach(
        position => {
            const quantity =
                Number(
                    position.quantity ??
                    position.qty
                ) || 0;

            const buyPrice =
                Number(
                    position.buyPrice
                ) || 0;

            const currentPrice =
                Number(
                    position.currentPrice ??
                    position.current ??
                    position.close ??
                    position.buyPrice
                ) || 0;

            invested +=
                quantity *
                buyPrice;

            currentValue +=
                quantity *
                currentPrice;

            unrealized +=
                quantity *
                (
                    currentPrice -
                    buyPrice
                );
        }
    );

    const realized =
        Number(
            portfolio.realizedPnL
        ) || 0;

    const totalPnL =
        realized +
        unrealized;

    const totalInvested =
        Number(
            portfolio.totalInvested
        ) ||
        invested;

    const totalCurrentValue =
        Number(
            portfolio.totalCurrentValue
        ) ||
        currentValue;

    const pnlPercent =
        totalInvested
            ? (
                totalPnL /
                totalInvested
            ) *
            100
            : 0;

    setText(
        [
            "portfolioInvested",
            "totalInvested"
        ],
        "₹" +
            money(
                totalInvested
            )
    );

    setText(
        [
            "portfolioCurrentValue",
            "totalCurrentValue"
        ],
        "₹" +
            money(
                totalCurrentValue
            )
    );

    setText(
        [
            "portfolioPnL",
            "totalPortfolioPnL"
        ],
        "₹" +
            money(
                totalPnL
            )
    );

    setText(
        [
            "portfolioReturn",
            "totalPortfolioReturn"
        ],
        percentage(
            pnlPercent
        )
    );

    setText(
        [
            "openPositionsCount",
            "portfolioOpenCount"
        ],
        openPositions.length
    );

    setText(
        [
            "closedTradesCount",
            "portfolioClosedCount"
        ],
        Array.isArray(
            portfolio.closedTrades
        )
            ? portfolio.closedTrades.length
            : 0
    );
}

function renderOpenPositions() {
    const container =
        document.getElementById(
            "portfolioTableBody"
        ) ||
        document.getElementById(
            "openPositionsBody"
        );

    if (!container) return;

    let rows =
        Array.isArray(
            portfolio.openPositions
        )
            ? [
                ...portfolio.openPositions
            ]
            : [];

    rows.sort(
        (
            a,
            b
        ) => {

            const dateA =
                new Date(
                    a.buyDate ||
                    a.entryDate ||
                    0
                ).getTime();

            const dateB =
                new Date(
                    b.buyDate ||
                    b.entryDate ||
                    0
                ).getTime();

            return (
                dateB -
                dateA
            );

        }
    );

    if (!rows.length) {
        container.innerHTML = `
            <tr>
                <td colspan="13" class="empty-state">
                    No open positions
                </td>
            </tr>
        `;

        return;
    }

    container.innerHTML =
        rows
            .map(
                position =>
                    portfolioRow(
                        position
                    )
            )
            .join("");
}

function portfolioRow(
    position
) {
    const symbol =
        position.symbol ||
        position.ticker ||
        "—";

    const quantity =
        Number(
            position.quantity ??
            position.qty
        ) || 0;

    const buyPrice =
        Number(
            position.buyPrice
        ) || 0;

    const currentPrice =
        Number(
            position.currentPrice ??
            position.current ??
            position.close ??
            buyPrice
        ) || 0;

    const currentSMA44 =
        Number(
            position.currentSMA44 ??
            position.sma44
        );

    const stopLossPrice =
        Number(
            position.stopLossPrice
        );

    const targetPrice =
        Number(
            position.targetPrice
        );

    const invested =
        quantity *
        buyPrice;

    const value =
        quantity *
        currentPrice;

    const pnl =
        value -
        invested;

    const returnPercent =
        buyPrice
            ? (
                (
                    currentPrice -
                    buyPrice
                ) /
                buyPrice
            ) *
            100
            : 0;

    const buyDate =
        position.buyDate ||
        position.entryDate ||
        "—";

    const exitStatus =
        position.exitStatus ||
        "HOLD";

    let statusClass =
        "hold";

    if (
        /STOP LOSS/i.test(
            exitStatus
        )
    ) {
        statusClass =
            "red";
    } else if (
        /TARGET/i.test(
            exitStatus
        )
    ) {
        statusClass =
            "green";
    } else if (
        /44 SMA/i.test(
            exitStatus
        )
    ) {
        statusClass =
            "orange";
    }

    return `
        <tr>
            <td>
                <strong>${escapeHtml(symbol)}</strong>
            </td>

            <td>
                ${quantity}
            </td>

            <td>
                ₹${money(buyPrice)}
            </td>

            <td>
                ₹${money(currentPrice)}
            </td>

            <td>
                ₹${money(invested)}
            </td>

            <td>
                ₹${money(value)}
            </td>

            <td class="${pnlClass(pnl)}">
                ₹${money(pnl)}
            </td>

            <td class="${pnlClass(returnPercent)}">
                ${percentage(returnPercent)}
            </td>

            <td>
                ${
                    Number.isFinite(
                        currentSMA44
                    )
                        ? "₹" +
                          money(
                              currentSMA44
                          )
                        : "—"
                }
            </td>

            <td>
                ${
                    Number.isFinite(
                        stopLossPrice
                    )
                        ? "₹" +
                          money(
                              stopLossPrice
                          )
                        : "—"
                }
            </td>

            <td>
                ${
                    Number.isFinite(
                        targetPrice
                    )
                        ? "₹" +
                          money(
                              targetPrice
                          )
                        : "—"
                }
            </td>

            <td class="${statusClass}">
                <strong>
                    ${escapeHtml(exitStatus)}
                </strong>
            </td>

            <td>
                ${escapeHtml(formatDate(buyDate))}
            </td>
        </tr>
    `;
}

function renderClosedTrades() {
    const container =
        document.getElementById(
            "closedTradesBody"
        ) ||
        document.getElementById(
            "closedTradeTableBody"
        );

    if (!container) return;

    let rows =
        Array.isArray(
            portfolio.closedTrades
        )
            ? [
                ...portfolio.closedTrades
            ]
            : [];

    rows.sort(
        (
            a,
            b
        ) => {

            const dateA =
                new Date(
                    a.sellDate ||
                    a.exitDate ||
                    0
                ).getTime();

            const dateB =
                new Date(
                    b.sellDate ||
                    b.exitDate ||
                    0
                ).getTime();

            return (
                dateB -
                dateA
            );

        }
    );

    if (!rows.length) {
        container.innerHTML = `
            <tr>
                <td colspan="10" class="empty-state">
                    No closed trades
                </td>
            </tr>
        `;

        return;
    }

    container.innerHTML =
        rows
            .map(
                trade =>
                    closedTradeRow(
                        trade
                    )
            )
            .join("");
}

function closedTradeRow(
    trade
) {
    const symbol =
        trade.symbol ||
        trade.ticker ||
        "—";

    const quantity =
        Number(
            trade.quantity ??
            trade.qty
        ) || 0;

    const buyPrice =
        Number(
            trade.buyPrice
        ) || 0;

    const sellPrice =
        Number(
            trade.sellPrice ??
            trade.exitPrice
        ) || 0;

    const invested =
        quantity *
        buyPrice;

    const proceeds =
        quantity *
        sellPrice;

    const pnl =
        Number(
            trade.pnl
        );

    const calculatedPnL =
        Number.isFinite(
            pnl
        )
            ? pnl
            : proceeds -
              invested;

    const returnPercent =
        invested
            ? (
                calculatedPnL /
                invested
            ) *
            100
            : 0;

    const buyDate =
        trade.buyDate ||
        trade.entryDate ||
        "—";

    const sellDate =
        trade.sellDate ||
        trade.exitDate ||
        "—";

    const result =
        trade.exitReason ||
        trade.result ||
        (
            calculatedPnL >= 0
                ? "WIN"
                : "LOSS"
        );

    return `
        <tr>
            <td>
                <strong>${escapeHtml(symbol)}</strong>
            </td>

            <td>
                ${quantity}
            </td>

            <td>
                ₹${money(buyPrice)}
            </td>

            <td>
                ₹${money(sellPrice)}
            </td>

            <td>
                ₹${money(invested)}
            </td>

            <td>
                ₹${money(proceeds)}
            </td>

            <td class="${pnlClass(calculatedPnL)}">
                ₹${money(calculatedPnL)}
            </td>

            <td class="${pnlClass(returnPercent)}">
                ${percentage(returnPercent)}
            </td>

            <td>
                ${escapeHtml(formatDate(buyDate))}
            </td>

            <td>
                <strong class="${pnlClass(calculatedPnL)}">
                    ${escapeHtml(result)}
                </strong>
                <br>
                <small>
                    ${escapeHtml(formatDate(sellDate))}
                </small>
            </td>
        </tr>
    `;
}

function formatDate(
    value
) {
    if (!value) return "—";

    const date =
        new Date(
            value
        );

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return String(value);
    }

    return date.toLocaleDateString(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    );
}

function renderHistory() {
    const container =
        document.getElementById(
            "historyTableBody"
        ) ||
        document.getElementById(
            "historyBody"
        );

    if (!container) return;

    const rows =
        Array.isArray(
            history
        )
            ? history
            : [];

    if (!rows.length) {
        container.innerHTML = `
            <tr>
                <td colspan="10" class="empty-state">
                    No scan history available
                </td>
            </tr>
        `;

        return;
    }

    container.innerHTML =
        rows
            .slice()
            .reverse()
            .map(
                item =>
                    historyRow(
                        item
                    )
            )
            .join("");
}

function historyRow(
    item
) {
    const symbol =
        item.symbol ||
        item.ticker ||
        "—";

    const signal =
        String(
            item.signal ||
            item.action ||
            ""
        ).toUpperCase();

    const close =
        Number(
            item.close
        );

    const sma44 =
        Number(
            item.sma44 ??
            item.SMA44
        );

    const sma100 =
        Number(
            item.sma100 ??
            item.SMA100
        );

    const sma200 =
        Number(
            item.sma200 ??
            item.SMA200
        );

    const date =
        item.date ||
        item.scannedAt ||
        "—";

    return `
        <tr>
            <td>${escapeHtml(formatDate(date))}</td>
            <td><strong>${escapeHtml(symbol)}</strong></td>
            <td>
                <span class="signal-badge ${
                    signal === "BUY"
                        ? "buy"
                        : signal === "SELL"
                            ? "sell"
                            : ""
                }">
                    ${escapeHtml(signal || "—")}
                </span>
            </td>
            <td>₹${money(close)}</td>
            <td>₹${money(sma44)}</td>
            <td>₹${money(sma100)}</td>
            <td>₹${money(sma200)}</td>
        </tr>
    `;
}

function renderError(
    message
) {
    const containers = [
        document.getElementById(
            "errorMessage"
        ),
        document.getElementById(
            "dashboardError"
        )
    ].filter(Boolean);

    if (!containers.length) {
        console.error(
            message
        );

        return;
    }

    containers.forEach(
        container => {
            container.textContent =
                message;

            container.style.display =
                "";
        }
    );
}

function setupNavigation() {
    document.addEventListener(
        "click",
        event => {

            const target =
                event.target.closest(
                    "[data-tab]"
                );

            if (!target) return;

            const tab =
                target.dataset.tab;

            if (!tab) return;

            currentTab =
                tab;

            renderNavigation();
            renderCurrentView();

            window.scrollTo(
                {
                    top: 0,
                    behavior: "smooth"
                }
            );

        }
    );
}

function setupRefresh() {
    document.addEventListener(
        "click",
        event => {

            const target =
                event.target.closest(
                    '[data-action="refresh"]'
                );

            if (!target) return;

            loadData({
                manual: true
            });

        }
    );
}

function setupPortfolioSorting() {
    document.addEventListener(
        "click",
        event => {

            const target =
                event.target.closest(
                    "[data-portfolio-sort]"
                );

            if (!target) return;

            portfolioSort =
                target.dataset.portfolioSort ||
                portfolioSort;

            renderOpenPositions();

        }
    );
}

function setupClosedTradeSorting() {
    document.addEventListener(
        "click",
        event => {

            const target =
                event.target.closest(
                    "[data-closed-sort]"
                );

            if (!target) return;

            closedTradeSort =
                target.dataset.closedSort ||
                closedTradeSort;

            renderClosedTrades();

        }
    );
}

function getChartRowsFromItem(
    item
) {
    if (!item) return [];

    if (
        Array.isArray(
            item.chart
        )
    ) {
        return item.chart;
    }

    if (
        item.chart &&
        Array.isArray(
            item.chart.data
        )
    ) {
        return item.chart.data;
    }

    if (
        Array.isArray(
            item.chartData
        )
    ) {
        return item.chartData;
    }

    if (
        item.chartData &&
        Array.isArray(
            item.chartData.data
        )
    ) {
        return item.chartData.data;
    }

    if (
        Array.isArray(
            item.data
        )
    ) {
        return item.data;
    }

    return [];
}

async function openStockChart(
    symbol
) {
    if (!symbol) return;

    const modal =
        document.getElementById(
            "stockChartModal"
        );

    if (!modal) return;

    const title =
        document.getElementById(
            "stockChartTitle"
        );

    if (title) {
        title.textContent =
            symbol +
            " — 44 SMA Chart";
    }

    modal.style.display =
        "flex";

    document.body.style.overflow =
        "hidden";

    const loading =
        document.getElementById(
            "stockChartLoading"
        );

    if (loading) {
        loading.style.display =
            "";
    }

    try {
        const timestamp =
            Date.now();

        const response =
            await fetch(
                "./data/charts/" +
                encodeURIComponent(
                    symbol
                ) +
                ".json?" +
                timestamp,
                {
                    cache: "no-store"
                }
            );

        if (!response.ok) {
            throw new Error(
                "Chart data unavailable"
            );
        }

        const data =
            await response.json();

        const rows =
            getChartRowsFromItem(
                data
            );

        currentChartRows =
            rows;

        if (loading) {
            loading.style.display =
                "none";
        }

        if (!rows.length) {
            showChartMessage(
                "No chart data available."
            );

            return;
        }

        hideChartMessage();

        requestAnimationFrame(
            () => {
                drawStockChart(
                    rows
                );
            }
        );

    } catch (error) {
        console.error(
            "Chart error:",
            error
        );

        if (loading) {
            loading.style.display =
                "none";
        }

        showChartMessage(
            "Chart data unavailable."
        );
    }
}

function openStockChartFromEncoded(
    encoded
) {
    try {
        const item =
            JSON.parse(
                decodeURIComponent(
                    encoded
                )
            );

        const symbol =
            item.symbol ||
            item.ticker ||
            item.name;

        if (!symbol) return;

        const embeddedRows =
            getChartRowsFromItem(
                item
            );

        if (
            embeddedRows.length
        ) {
            const modal =
                document.getElementById(
                    "stockChartModal"
                );

            if (!modal) return;

            const title =
                document.getElementById(
                    "stockChartTitle"
                );

            if (title) {
                title.textContent =
                    symbol +
                    " — 44 SMA Chart";
            }

            modal.style.display =
                "flex";

            document.body.style.overflow =
                "hidden";

            currentChartRows =
                embeddedRows;

            hideChartMessage();

            requestAnimationFrame(
                () => {
                    drawStockChart(
                        embeddedRows
                    );
                }
            );

            return;
        }

        openStockChart(
            symbol
        );

    } catch (error) {
        console.error(
            "Invalid chart data:",
            error
        );
    }
}

function showChartMessage(
    message
) {
    const element =
        document.getElementById(
            "stockChartMessage"
        );

    if (!element) return;

    element.textContent =
        message;

    element.style.display =
        "";
}

function hideChartMessage() {
    const element =
        document.getElementById(
            "stockChartMessage"
        );

    if (!element) return;

    element.style.display =
        "none";
}

function closeChart() {
    const modal =
        document.getElementById(
            "stockChartModal"
        );

    if (modal) {
        modal.style.display =
            "none";
    }

    document.body.style.overflow =
        "";

    currentChartRows =
        null;
}

function drawStockChart(
    rows
) {
    const canvas =
        document.getElementById(
            "stockChartCanvas"
        );

    if (
        !canvas ||
        !rows ||
        !rows.length
    ) {
        return;
    }

    const rect =
        canvas.getBoundingClientRect();

    const dpr =
        window.devicePixelRatio ||
        1;

    const width =
        Math.max(
            300,
            rect.width
        );

    const height =
        Math.max(
            350,
            rect.height
        );

    canvas.width =
        width * dpr;

    canvas.height =
        height * dpr;

    const ctx =
        canvas.getContext(
            "2d"
        );

    ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
    );

    ctx.fillStyle =
        "#0b111b";

    ctx.fillRect(
        0,
        0,
        width,
        height
    );

    const left = 62;
    const right = 20;
    const top = 20;
    const bottom = 42;

    const chartWidth =
        width -
        left -
        right;

    const chartHeight =
        height -
        top -
        bottom;

    const prices = [];

    rows.forEach(
        row => {

            [
                row.high,
                row.low,
                row.sma44,
                row.sma100,
                row.sma200
            ].forEach(
                value => {

                    if (
                        Number.isFinite(
                            Number(value)
                        )
                    ) {
                        prices.push(
                            Number(value)
                        );
                    }

                }
            );

        }
    );

    if (!prices.length) {
        return;
    }

    let minPrice =
        Math.min(
            ...prices
        );

    let maxPrice =
        Math.max(
            ...prices
        );

    let padding =
        (
            maxPrice -
            minPrice
        ) *
        0.08;

    if (!padding) {
        padding =
            maxPrice *
            0.02;
    }

    minPrice -=
        padding;

    maxPrice +=
        padding;

    const priceRange =
        maxPrice -
        minPrice;

    function priceY(
        price
    ) {
        return (
            top +
            (
                (
                    maxPrice -
                    price
                ) /
                priceRange
            ) *
            chartHeight
        );
    }

    const step =
        chartWidth /
        rows.length;

    function xPosition(
        index
    ) {
        return (
            left +
            (
                index +
                0.5
            ) *
            step
        );
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle =
        "#182536";

    const gridLines = 6;

    for (
        let i = 0;
        i <= gridLines;
        i++
    ) {
        const y =
            top +
            (
                i /
                gridLines
            ) *
            chartHeight;

        ctx.beginPath();

        ctx.moveTo(
            left,
            y
        );

        ctx.lineTo(
            width -
            right,
            y
        );

        ctx.stroke();

        const price =
            maxPrice -
            (
                i /
                gridLines
            ) *
            priceRange;

        ctx.fillStyle =
            "#7d8fa8";

        ctx.font =
            "11px Arial";

        ctx.textAlign =
            "right";

        ctx.fillText(
            "₹" +
            price.toFixed(0),
            left - 8,
            y + 4
        );
    }

    const candleWidth =
        Math.max(
            2,
            Math.min(
                12,
                step *
                0.65
            )
        );

    rows.forEach(
        (
            row,
            index
        ) => {

            const open =
                Number(
                    row.open
                );

            const high =
                Number(
                    row.high
                );

            const low =
                Number(
                    row.low
                );

            const close =
                Number(
                    row.close
                );

            if (
                ![
                    open,
                    high,
                    low,
                    close
                ].every(
                    Number.isFinite
                )
            ) {
                return;
            }

            const x =
                xPosition(
                    index
                );

            const yHigh =
                priceY(
                    high
                );

            const yLow =
                priceY(
                    low
                );

            const yOpen =
                priceY(
                    open
                );

            const yClose =
                priceY(
                    close
                );

            const bullish =
                close >=
                open;

            ctx.strokeStyle =
                bullish
                    ? "#36d98b"
                    : "#ff5d6c";

            ctx.fillStyle =
                bullish
                    ? "#36d98b"
                    : "#ff5d6c";

            ctx.beginPath();

            ctx.moveTo(
                x,
                yHigh
            );

            ctx.lineTo(
                x,
                yLow
            );

            ctx.stroke();

            const bodyTop =
                Math.min(
                    yOpen,
                    yClose
                );

            const bodyBottom =
                Math.max(
                    yOpen,
                    yClose
                );

            const bodyHeight =
                Math.max(
                    1,
                    bodyBottom -
                    bodyTop
                );

            ctx.fillRect(
                x -
                candleWidth /
                2,
                bodyTop,
                candleWidth,
                bodyHeight
            );
        }
    );

    drawLine(
        ctx,
        rows,
        "sma44",
        "#f0b90b",
        priceY,
        xPosition
    );

    drawLine(
        ctx,
        rows,
        "sma100",
        "#5aa9ff",
        priceY,
        xPosition
    );

    drawLine(
        ctx,
        rows,
        "sma200",
        "#d88cff",
        priceY,
        xPosition
    );

    ctx.fillStyle =
        "#7d8fa8";

    ctx.font =
        "10px Arial";

    ctx.textAlign =
        "center";

    const labelCount =
        Math.min(
            7,
            rows.length
        );

    for (
        let i = 0;
        i < labelCount;
        i++
    ) {
        const index =
            Math.floor(
                (
                    i /
                    Math.max(
                        1,
                        labelCount -
                        1
                    )
                ) *
                (
                    rows.length -
                    1
                )
            );

        const row =
            rows[index];

        const x =
            xPosition(
                index
            );

        const date =
            String(
                row.date ||
                ""
            );

        ctx.fillText(
            date.slice(5),
            x,
            height -
            15
        );
    }

    ctx.strokeStyle =
        "#26364d";

    ctx.strokeRect(
        left,
        top,
        chartWidth,
        chartHeight
    );
}

function drawLine(
    ctx,
    rows,
    key,
    lineColor,
    priceY,
    xPosition
) {
    ctx.strokeStyle =
        lineColor;

    ctx.lineWidth =
        1.5;

    ctx.beginPath();

    let started =
        false;

    rows.forEach(
        (
            row,
            index
        ) => {

            const value =
                Number(
                    row[key]
                );

            if (
                !Number.isFinite(
                    value
                )
            ) {
                return;
            }

            const x =
                xPosition(
                    index
                );

            const y =
                priceY(
                    value
                );

            if (!started) {
                ctx.moveTo(
                    x,
                    y
                );

                started =
                    true;
            } else {
                ctx.lineTo(
                    x,
                    y
                );
            }
        }
    );

    if (started) {
        ctx.stroke();
    }
}

document.addEventListener(
    "keydown",
    event => {
        if (
            event.key ===
            "Escape"
        ) {
            closeChart();
        }
    }
);

window.addEventListener(
    "resize",
    () => {

        const modal =
            document.getElementById(
                "stockChartModal"
            );

        if (
            modal &&
            modal.style.display ===
                "flex" &&
            currentChartRows
        ) {
            drawStockChart(
                currentChartRows
            );
        }

    }
);

setupNavigation();
setupRefresh();
setupPortfolioSorting();
setupClosedTradeSorting();

loadData();
