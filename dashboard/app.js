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
// BASIC HELPERS
// ============================================================

const $ = (selector) => document.querySelector(selector);


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
// LOAD SCANNER DATA
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


        signals =
            await signalResponse.json();


        if (historyResponse.ok) {

            history =
                await historyResponse.json();

        } else {

            history = [];
        }


        console.log(
            "Scanner:",
            signals
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
// TABLE
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

    const items =
        type === "buy"
            ? signals.buy
            : signals.sell;


    return `

        <div class="panel">

            <div class="panel-header">

                <h2 class="panel-title">

                    ${
                        type === "buy"
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


    const pageTitle =
        $("#pageTitle");


    if (currentTab === "dashboard") {

        if (pageTitle) {
            pageTitle.textContent =
                "Dashboard";
        }

        content.innerHTML =
            dashboardView();
    }


    if (currentTab === "buy") {

        if (pageTitle) {
            pageTitle.textContent =
                "BUY";
        }

        content.innerHTML =
            signalPage("buy");
    }


    if (currentTab === "sell") {

        if (pageTitle) {
            pageTitle.textContent =
                "SELL";
        }

        content.innerHTML =
            signalPage("sell");
    }


    if (currentTab === "history") {

        if (pageTitle) {
            pageTitle.textContent =
                "History";
        }

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
// LOAD CHART DATA
// ============================================================

async function loadChartData(symbol) {

    const response =
        await fetch(
            `./data/charts/${encodeURIComponent(symbol)}.json?${Date.now()}`,
            {
                cache: "no-store"
            }
        );


    if (!response.ok) {

        throw new Error(
            `Chart data unavailable for ${symbol}`
        );
    }


    return await response.json();
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


    modal.style.cssText = `
        position:fixed;
        inset:0;
        z-index:99999;
        background:rgba(0,0,0,.82);
        display:none;
        align-items:center;
        justify-content:center;
        padding:16px;
        box-sizing:border-box;
    `;


    modal.innerHTML = `

        <div
            style="
                width:min(1250px,100%);
                height:min(850px,96vh);
                background:#0b111b;
                border:1px solid #26364d;
                border-radius:16px;
                overflow:hidden;
                display:flex;
                flex-direction:column;
                box-shadow:0 25px 80px rgba(0,0,0,.65);
            "
        >

            <div
                style="
                    min-height:64px;
                    display:flex;
                    align-items:center;
                    justify-content:space-between;
                    padding:0 18px;
                    border-bottom:1px solid #26364d;
                    background:#0e1724;
                "
            >

                <div>

                    <div
                        id="chartStockTitle"
                        style="
                            color:#fff;
                            font-size:20px;
                            font-weight:700;
                        "
                    >
                        Stock Chart
                    </div>


                    <div
                        id="chartStockSubtitle"
                        style="
                            color:#91a4bd;
                            font-size:12px;
                            margin-top:3px;
                        "
                    >
                    </div>

                </div>


                <button
                    id="chartCloseButton"
                    type="button"
                    style="
                        border:0;
                        background:#1b2737;
                        color:#fff;
                        width:40px;
                        height:40px;
                        border-radius:10px;
                        font-size:24px;
                        cursor:pointer;
                    "
                >
                    ×
                </button>

            </div>


            <div
                id="chartStats"
                style="
                    min-height:52px;
                    display:flex;
                    align-items:center;
                    gap:22px;
                    padding:8px 18px;
                    box-sizing:border-box;
                    border-bottom:1px solid #1c2a3d;
                    background:#0b111b;
                    color:#91a4bd;
                    font-size:13px;
                    flex-wrap:wrap;
                "
            >
            </div>


            <div
                style="
                    flex:1;
                    min-height:0;
                    position:relative;
                    background:#0b111b;
                "
            >

                <canvas
                    id="stockChartCanvas"
                    style="
                        width:100%;
                        height:100%;
                        display:block;
                    "
                >
                </canvas>


                <div
                    id="chartLoading"
                    style="
                        position:absolute;
                        inset:0;
                        display:none;
                        align-items:center;
                        justify-content:center;
                        color:#91a4bd;
                        background:rgba(11,17,27,.9);
                        font-size:14px;
                    "
                >
                    Loading chart...
                </div>

            </div>


            <div
                style="
                    min-height:48px;
                    display:flex;
                    align-items:center;
                    gap:18px;
                    padding:0 18px;
                    border-top:1px solid #26364d;
                    background:#0e1724;
                    color:#9badc5;
                    font-size:12px;
                "
            >

                <span>
                    <b style="color:#f0b90b">●</b>
                    44 SMA
                </span>

                <span>
                    <b style="color:#5aa9ff">●</b>
                    100 SMA
                </span>

                <span>
                    <b style="color:#d88cff">●</b>
                    200 SMA
                </span>

                <span>
                    🟢 Bullish candle
                </span>

                <span>
                    🔴 Bearish candle
                </span>

            </div>

        </div>
    `;


    document.body.appendChild(
        modal
    );


    document
        .getElementById(
            "chartCloseButton"
        )
        .addEventListener(
            "click",
            closeChart
        );


    modal.addEventListener(
        "click",
        event => {

            if (
                event.target === modal
            ) {

                closeChart();
            }
        }
    );


    window.addEventListener(
        "resize",
        () => {

            if (
                modal.style.display ===
                "flex"
            ) {

                if (
                    window.currentChartRows
                ) {

                    drawStockChart(
                        window.currentChartRows
                    );
                }
            }
        }
    );


    return modal;
}


// ============================================================
// OPEN CHART
// ============================================================

async function openStockChart(item) {

    const modal =
        createChartModal();


    const title =
        document.getElementById(
            "chartStockTitle"
        );


    const subtitle =
        document.getElementById(
            "chartStockSubtitle"
        );


    const stats =
        document.getElementById(
            "chartStats"
        );


    const loading =
        document.getElementById(
            "chartLoading"
        );


    title.textContent =
        `${item.symbol} — ${item.signal}`;


    subtitle.textContent =
        "Daily candlestick chart";


    stats.innerHTML = `

        <span>
            Close:
            <strong style="color:#fff">
                ₹${money(item.Close)}
            </strong>
        </span>

        <span>
            44 SMA:
            <strong style="color:#f0b90b">
                ₹${money(item.sma44)}
            </strong>
        </span>

        <span>
            100 SMA:
            <strong style="color:#5aa9ff">
                ₹${money(item.sma100)}
            </strong>
        </span>

        <span>
            200 SMA:
            <strong style="color:#d88cff">
                ₹${money(item.sma200)}
            </strong>
        </span>

        <span>
            Date:
            <strong style="color:#fff">
                ${escapeHtml(item.date || "—")}
            </strong>
        </span>

    `;


    modal.style.display =
        "flex";


    document.body.style.overflow =
        "hidden";


    loading.style.display =
        "flex";


    try {

        const chart =
            await loadChartData(
                item.symbol
            );


        const rows =
            chart.data || [];


        if (!rows.length) {

            throw new Error(
                "No chart data available"
            );
        }


        // Keep approximately last 6 months.
        const visibleRows =
            rows.slice(
                Math.max(
                    0,
                    rows.length - 130
                )
            );


        window.currentChartRows =
            visibleRows;


        loading.style.display =
            "none";


        drawStockChart(
            visibleRows
        );


    } catch (error) {

        console.error(
            error
        );


        loading.textContent =
            "Chart data is not available for this stock yet.";


        loading.style.display =
            "flex";
    }
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


    document.body.style.overflow =
        "";


    window.currentChartRows =
        null;
}


// ============================================================
// DRAW CHART
// ============================================================

function drawStockChart(rows) {

    const canvas =
        document.getElementById(
            "stockChartCanvas"
        );


    if (!canvas || !rows.length) {
        return;
    }


    const rect =
        canvas.getBoundingClientRect();


    const dpr =
        window.devicePixelRatio || 1;


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


    // ========================================================
    // BACKGROUND
    // ========================================================

    ctx.fillStyle =
        "#0b111b";

    ctx.fillRect(
        0,
        0,
        width,
        height
    );


    // ========================================================
    // CHART AREA
    // ========================================================

    const left =
        62;

    const right =
        20;

    const top =
        20;

    const bottom =
        42;


    const chartWidth =
        width -
        left -
        right;


    const chartHeight =
        height -
        top -
        bottom;


    // ========================================================
    // FIND PRICE RANGE
    // ========================================================

    const prices = [];


    rows.forEach(
        row => {

            if (
                Number.isFinite(
                    Number(row.high)
                )
            ) {

                prices.push(
                    Number(row.high)
                );
            }


            if (
                Number.isFinite(
                    Number(row.low)
                )
            ) {

                prices.push(
                    Number(row.low)
                );
            }


            [
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


    const padding =
        (maxPrice - minPrice) *
        0.08;


    minPrice -=
        padding;


    maxPrice +=
        padding;


    const priceRange =
        maxPrice -
        minPrice;


    // ========================================================
    // PRICE -> Y
    // ========================================================

    function priceY(price) {

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


    // ========================================================
    // X
    // ========================================================

    const step =
        chartWidth /
        rows.length;


    function xPosition(index) {

        return (
            left +
            (
                index +
                0.5
            ) *
            step
        );
    }


    // ========================================================
    // GRID
    // ========================================================

    ctx.lineWidth =
        1;


    ctx.strokeStyle =
        "#182536";


    const gridLines =
        6;


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
            width - right,
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


    // ========================================================
    // CANDLESTICKS
    // ========================================================

    const candleWidth =
        Math.max(
            2,
            Math.min(
                12,
                step * 0.65
            )
        );


    rows.forEach(
        (row, index) => {

            const open =
                Number(row.open);

            const high =
                Number(row.high);

            const low =
                Number(row.low);

            const close =
                Number(row.close);


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
                priceY(high);


            const yLow =
                priceY(low);


            const yOpen =
                priceY(open);


            const yClose =
                priceY(close);


            const bullish =
                close >= open;


            ctx.strokeStyle =
                bullish
                    ? "#36d98b"
                    : "#ff5d6c";


            ctx.fillStyle =
                bullish
                    ? "#36d98b"
                    : "#ff5d6c";


            // Wick

            ctx.lineWidth =
                1;


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


            // Body

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
                candleWidth / 2,

                bodyTop,

                candleWidth,

                bodyHeight
            );

        }
    );


    // ========================================================
    // SMA LINES
    // ========================================================

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


    // ========================================================
    // DATE LABELS
    // ========================================================

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
                        labelCount - 1
                    )
                ) *
                (
                    rows.length - 1
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
                row.date || ""
            );


        ctx.fillText(
            date.slice(5),
            x,
            height - 15
        );
    }


    // ========================================================
    // BORDER
    // ========================================================

    ctx.strokeStyle =
        "#26364d";

    ctx.lineWidth =
        1;

    ctx.strokeRect(
        left,
        top,
        chartWidth,
        chartHeight
    );
}


// ============================================================
// DRAW SMA
// ============================================================

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
        (row, index) => {

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

                started = true;

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


// ============================================================
// KEYBOARD ESC
// ============================================================

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
                            item => {

                                item.classList
                                    .remove(
                                        "active"
                                    );
                            }
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
