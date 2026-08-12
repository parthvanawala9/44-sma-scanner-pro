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

let currentTab = "dashboard";


// ============================================================
// HELPERS
// ============================================================

const $ = (selector) => {
    return document.querySelector(selector);
};


function money(value) {

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "—";
    }

    return number.toLocaleString("en-IN", {
        maximumFractionDigits: 2
    });
}


function percentage(value) {

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "—";
    }

    const sign = number >= 0 ? "+" : "";

    return `${sign}${number.toFixed(2)}%`;
}


function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// ============================================================
// LOAD DATA
// ============================================================

async function loadData() {

    try {

        const signalResponse = await fetch(
            "./data/signals.json?" + Date.now(),
            {
                cache: "no-store"
            }
        );

        const historyResponse = await fetch(
            "./data/history.json?" + Date.now(),
            {
                cache: "no-store"
            }
        );


        if (!signalResponse.ok) {

            throw new Error(
                "signals.json could not be loaded"
            );
        }


        signals = await signalResponse.json();


        if (historyResponse.ok) {

            history = await historyResponse.json();

        } else {

            history = [];
        }


        console.log(
            "44 SMA scanner data:",
            signals
        );

        console.log(
            "44 SMA history:",
            history
        );


    } catch (error) {

        console.error(
            "Dashboard data error:",
            error
        );

        signals = {
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

        history = [];
    }


    updateLastScan();

    render();
}


// ============================================================
// LAST SCAN
// ============================================================

function updateLastScan() {

    const element =
        $("#lastScan");


    if (!element) {
        return;
    }


    if (!signals.scannedAt) {

        element.textContent =
            "Last scan: Not scanned yet";

        return;
    }


    const date =
        new Date(
            signals.scannedAt
        );


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


// ============================================================
// SIGNAL BADGE
// ============================================================

function signalBadge(signal) {

    if (signal === "BUY") {

        return `
            <span class="signal-badge signal-buy">
                BUY
            </span>
        `;
    }


    if (signal === "SELL") {

        return `
            <span class="signal-badge signal-sell">
                SELL
            </span>
        `;
    }


    return "";
}


// ============================================================
// STOCK ROW
// ============================================================

function stockRow(item) {

    const distance =
        Number(
            item.distanceFrom44
        );


    return `

        <tr>

            <td>

                <button
                    type="button"
                    class="stock-button"
                    data-symbol="${escapeHtml(item.symbol)}"
                >
                    ${escapeHtml(item.symbol)}
                </button>

            </td>


            <td>
                ${signalBadge(item.signal)}
            </td>


            <td>
                ₹${money(item.Close)}
            </td>


            <td>
                ₹${money(item.sma44)}
            </td>


            <td class="${
                distance >= 0
                    ? "green"
                    : "red"
            }">

                ${percentage(distance)}

            </td>


            <td>
                ₹${money(item.sma100)}
            </td>


            <td>
                ₹${money(item.sma200)}
            </td>


            <td class="muted">
                ${escapeHtml(item.date || "—")}
            </td>

        </tr>
    `;
}


// ============================================================
// STOCK TABLE
// ============================================================

function stockTable(items) {

    if (
        !items ||
        items.length === 0
    ) {

        return `
            <div class="empty">
                No qualifying stocks found.
            </div>
        `;
    }


    return `

        <div class="table-wrap">

            <table class="table">

                <thead>

                    <tr>

                        <th>Stock</th>

                        <th>Signal</th>

                        <th>Close</th>

                        <th>44 SMA</th>

                        <th>Vs 44</th>

                        <th>100 SMA</th>

                        <th>200 SMA</th>

                        <th>Date</th>

                    </tr>

                </thead>


                <tbody>

                    ${items
                        .map(stockRow)
                        .join("")}

                </tbody>

            </table>

        </div>
    `;
}


// ============================================================
// DASHBOARD
// ============================================================

function dashboardView() {

    return `

        <div class="kpi-grid">


            <div class="kpi">

                <div class="kpi-label">
                    BUY TRIGGERS
                </div>

                <div class="kpi-value green">
                    ${signals.buy.length}
                </div>

                <div class="kpi-sub">
                    44 SMA support
                </div>

            </div>


            <div class="kpi">

                <div class="kpi-label">
                    SELL TRIGGERS
                </div>

                <div class="kpi-value red">
                    ${signals.sell.length}
                </div>

                <div class="kpi-sub">
                    44 SMA breakdown
                </div>

            </div>


            <div class="kpi">

                <div class="kpi-label">
                    STOCKS SCANNED
                </div>

                <div class="kpi-value">
                    ${signals.scanned || 0}
                </div>

                <div class="kpi-sub">
                    ${signals.universeCount || 0}
                    stocks in NIFTY 500
                </div>

            </div>


            <div class="kpi">

                <div class="kpi-label">
                    HISTORY
                </div>

                <div class="kpi-value">
                    ${history.length}
                </div>

                <div class="kpi-sub">
                    Recorded signals
                </div>

            </div>

        </div>



        <div class="two-column">


            <div class="panel">

                <div class="panel-header">

                    <h2 class="panel-title">
                        🟢 BUY
                    </h2>

                    <span class="panel-count">
                        ${signals.buy.length}
                        stocks
                    </span>

                </div>


                ${stockTable(
                    signals.buy
                )}

            </div>



            <div class="panel">

                <div class="panel-header">

                    <h2 class="panel-title">
                        🔴 SELL
                    </h2>

                    <span class="panel-count">
                        ${signals.sell.length}
                        stocks
                    </span>

                </div>


                ${stockTable(
                    signals.sell
                )}

            </div>

        </div>



        <div class="panel">

            <div class="panel-header">

                <h2 class="panel-title">
                    44 SMA Strategy
                </h2>

            </div>


            <div class="conditions">

                <div class="condition ok">
                    ✓ 44 SMA greater than
                    44 SMA 10 days before
                </div>


                <div class="condition ok">
                    ✓ Stock Low touches
                    44 SMA
                </div>


                <div class="condition ok">
                    ✓ Stock Close is above
                    44 SMA
                </div>


                <div class="condition ok">
                    ✓ 44 SMA is above
                    100 SMA
                </div>


                <div class="condition ok">
                    ✓ 100 SMA is above
                    200 SMA
                </div>


                <div class="condition no">
                    SELL = High touches
                    44 SMA + Close below
                    44 SMA
                </div>

            </div>

        </div>
    `;
}


// ============================================================
// BUY / SELL PAGE
// ============================================================

function signalPage(type) {

    const isBuy =
        type === "buy";


    const items =
        isBuy
            ? signals.buy
            : signals.sell;


    return `

        <div class="panel">

            <div class="panel-header">

                <h2 class="panel-title">

                    ${
                        isBuy
                            ? "🟢 BUY TRIGGERS"
                            : "🔴 SELL TRIGGERS"
                    }

                </h2>


                <span class="panel-count">
                    ${items.length}
                    stocks
                </span>

            </div>


            <div class="toolbar">

                <input
                    id="stockSearch"
                    class="search"
                    type="search"
                    placeholder="Search stock..."
                    autocomplete="off"
                >

            </div>


            <div id="signalTable">

                ${stockTable(items)}

            </div>

        </div>
    `;
}


// ============================================================
// HISTORY
// ============================================================

function historyPage() {

    return `

        <div class="panel">

            <div class="panel-header">

                <h2 class="panel-title">
                    Signal History
                </h2>


                <span class="panel-count">
                    ${history.length}
                    records
                </span>

            </div>


            <div class="toolbar">

                <input
                    id="historySearch"
                    class="search"
                    type="search"
                    placeholder="Search stock..."
                    autocomplete="off"
                >

            </div>


            <div id="historyTable">

                ${stockTable(history)}

            </div>

        </div>
    `;
}


// ============================================================
// RENDER
// ============================================================

function render() {

    const content =
        $("#content");


    if (!content) {
        return;
    }


    let title =
        "Dashboard";


    if (currentTab === "buy") {
        title = "BUY";
    }


    if (currentTab === "sell") {
        title = "SELL";
    }


    if (currentTab === "history") {
        title = "History";
    }


    const pageTitle =
        $("#pageTitle");


    if (pageTitle) {

        pageTitle.textContent =
            title;
    }


    if (
        currentTab ===
        "dashboard"
    ) {

        content.innerHTML =
            dashboardView();
    }


    if (
        currentTab ===
        "buy"
    ) {

        content.innerHTML =
            signalPage("buy");
    }


    if (
        currentTab ===
        "sell"
    ) {

        content.innerHTML =
            signalPage("sell");
    }


    if (
        currentTab ===
        "history"
    ) {

        content.innerHTML =
            historyPage();
    }


    setupSearch();

    setupStockButtons();
}


// ============================================================
// SEARCH
// ============================================================

function setupSearch() {

    const search =
        $("#stockSearch");


    if (search) {

        search.addEventListener(
            "input",
            () => {

                const query =
                    search.value
                        .trim()
                        .toUpperCase();


                const items =
                    currentTab === "buy"
                        ? signals.buy
                        : signals.sell;


                const filtered =
                    items.filter(
                        item =>
                            String(
                                item.symbol
                            )
                            .toUpperCase()
                            .includes(query)
                    );


                const table =
                    $("#signalTable");


                if (table) {

                    table.innerHTML =
                        stockTable(
                            filtered
                        );
                }


                setupStockButtons();
            }
        );
    }


    const historySearch =
        $("#historySearch");


    if (historySearch) {

        historySearch.addEventListener(
            "input",
            () => {

                const query =
                    historySearch.value
                        .trim()
                        .toUpperCase();


                const filtered =
                    history.filter(
                        item =>
                            String(
                                item.symbol
                            )
                            .toUpperCase()
                            .includes(query)
                    );


                const table =
                    $("#historyTable");


                if (table) {

                    table.innerHTML =
                        stockTable(
                            filtered
                        );
                }


                setupStockButtons();
            }
        );
    }
}


// ============================================================
// STOCK BUTTONS
// ============================================================

function setupStockButtons() {

    document
        .querySelectorAll(
            ".stock-button"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const symbol =
                            button.dataset.symbol;


                        const item =
                            findStock(
                                symbol
                            );


                        if (item) {

                            openStockChart(
                                item
                            );
                        }
                    }
                );

            }
        );
}


// ============================================================
// FIND STOCK
// ============================================================

function findStock(symbol) {

    const all = [

        ...signals.buy,

        ...signals.sell,

        ...history

    ];


    return all.find(
        item =>
            item.symbol === symbol
    );
}


// ============================================================
// CREATE CHART MODAL
// ============================================================

function createChartModal() {

    let modal =
        document.getElementById(
            "stockChartModal"
        );


    if (modal) {
        return modal;
    }


    modal =
        document.createElement(
            "div"
        );


    modal.id =
        "stockChartModal";


    modal.style.position =
        "fixed";

    modal.style.inset =
        "0";

    modal.style.zIndex =
        "99999";

    modal.style.background =
        "rgba(0,0,0,0.78)";

    modal.style.display =
        "none";

    modal.style.alignItems =
        "center";

    modal.style.justifyContent =
        "center";

    modal.style.padding =
        "20px";

    modal.style.boxSizing =
        "border-box";


    modal.innerHTML = `

        <div
            id="chartModalBox"
            style="
                width: min(1200px, 100%);
                height: min(850px, 95vh);
                background: #0b111b;
                border: 1px solid #26364d;
                border-radius: 16px;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                box-shadow: 0 25px 80px rgba(0,0,0,.6);
            "
        >

            <div
                style="
                    min-height: 64px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 18px;
                    border-bottom: 1px solid #26364d;
                    background: #0e1724;
                    box-sizing: border-box;
                "
            >

                <div
                    id="chartStockTitle"
                    style="
                        color: white;
                        font-size: 20px;
                        font-weight: 700;
                    "
                >
                    Stock Chart
                </div>


                <button
                    id="chartCloseButton"
                    type="button"
                    style="
                        border: 0;
                        background: #1b2737;
                        color: white;
                        width: 40px;
                        height: 40px;
                        border-radius: 10px;
                        font-size: 22px;
                        cursor: pointer;
                    "
                >
                    ×
                </button>

            </div>


            <div
                id="chartInfo"
                style="
                    padding: 12px 18px;
                    color: #8fa3bd;
                    font-size: 13px;
                    border-bottom: 1px solid #1c2a3d;
                    background: #0b111b;
                "
            >
            </div>


            <div
                id="chartFrameContainer"
                style="
                    flex: 1;
                    min-height: 500px;
                    background: #0b111b;
                "
            >
            </div>

        </div>
    `;


    document.body.appendChild(
        modal
    );


    const closeButton =
        document.getElementById(
            "chartCloseButton"
        );


    closeButton.addEventListener(
        "click",
        closeChart
    );


    modal.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                modal
            ) {

                closeChart();
            }
        }
    );


    return modal;
}


// ============================================================
// OPEN STOCK CHART
// ============================================================

function openStockChart(item) {

    const modal =
        createChartModal();


    const title =
        document.getElementById(
            "chartStockTitle"
        );


    const info =
        document.getElementById(
            "chartInfo"
        );


    const container =
        document.getElementById(
            "chartFrameContainer"
        );


    const symbol =
        String(
            item.symbol || ""
        )
        .trim()
        .toUpperCase();


    title.textContent =
        `${symbol} — ${item.signal || "STOCK"}`;


    info.innerHTML = `

        Close:
        <strong style="color:white">
            ₹${money(item.Close)}
        </strong>

        &nbsp;&nbsp; |

        &nbsp;&nbsp;

        44 SMA:
        <strong style="color:white">
            ₹${money(item.sma44)}
        </strong>

        &nbsp;&nbsp; |

        &nbsp;&nbsp;

        100 SMA:
        <strong style="color:white">
            ₹${money(item.sma100)}
        </strong>

        &nbsp;&nbsp; |

        &nbsp;&nbsp;

        200 SMA:
        <strong style="color:white">
            ₹${money(item.sma200)}
        </strong>

    `;


    container.innerHTML = "";


    // ========================================================
    // TRADINGVIEW CHART
    // ========================================================

    const iframe =
        document.createElement(
            "iframe"
        );


    const tradingViewSymbol =
        encodeURIComponent(
            `NSE:${symbol}`
        );


    iframe.src =
        "https://www.tradingview.com/widgetembed/" +
        "?symbol=" +
        tradingViewSymbol +
        "&interval=D" +
        "&range=6M" +
        "&theme=dark" +
        "&style=1" +
        "&locale=en" +
        "&timezone=Asia%2FKolkata" +
        "&hide_top_toolbar=0" +
        "&hide_side_toolbar=0" +
        "&hide_legend=0" +
        "&allow_symbol_change=0" +
        "&save_image=0" +
        "&withdateranges=1" +
        "&details=1" +
        "&calendar=0";


    iframe.title =
        `${symbol} stock chart`;


    iframe.style.width =
        "100%";


    iframe.style.height =
        "100%";


    iframe.style.minHeight =
        "500px";


    iframe.style.border =
        "0";


    iframe.style.display =
        "block";


    iframe.setAttribute(
        "allowfullscreen",
        ""
    );


    iframe.setAttribute(
        "loading",
        "eager"
    );


    container.appendChild(
        iframe
    );


    modal.style.display =
        "flex";


    document.body.style.overflow =
        "hidden";
}


// ============================================================
// CLOSE CHART
// ============================================================

function closeChart() {

    const modal =
        document.getElementById(
            "stockChartModal"
        );


    if (modal) {

        modal.style.display =
            "none";
    }


    const container =
        document.getElementById(
            "chartFrameContainer"
        );


    if (container) {

        container.innerHTML =
            "";
    }


    document.body.style.overflow =
        "";
}


// ============================================================
// CONDITIONS
// ============================================================

function formatConditionName(name) {

    const names = {

        "44 SMA rising":
            "44 SMA is greater than 44 SMA 10 trading days ago",

        "Low touches 44 SMA":
            "Stock Low is at or below 44 SMA",

        "Close above 44 SMA":
            "Stock Close is above 44 SMA",

        "44 SMA above 100 SMA":
            "44 SMA is above 100 SMA",

        "100 SMA above 200 SMA":
            "100 SMA is above 200 SMA",

        "High touches 44 SMA":
            "Stock High is at or above 44 SMA",

        "Close below 44 SMA":
            "Stock Close is below 44 SMA"
    };


    return (
        names[name] ||
        name
    );
}


// ============================================================
// NAVIGATION
// ============================================================

document
    .querySelectorAll(
        ".nav-item"
    )
    .forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    currentTab =
                        button.dataset.tab;


                    document
                        .querySelectorAll(
                            ".nav-item"
                        )
                        .forEach(
                            item =>
                                item.classList
                                    .remove(
                                        "active"
                                    )
                        );


                    button.classList.add(
                        "active"
                    );


                    render();
                }
            );

        }
    );


// ============================================================
// REFRESH
// ============================================================

const refreshButton =
    $("#refreshButton");


if (refreshButton) {

    refreshButton.addEventListener(
        "click",
        loadData
    );
}


// ============================================================
// START
// ============================================================

loadData();
