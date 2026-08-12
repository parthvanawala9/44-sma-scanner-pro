let signals = {
    buy: [],
    sell: [],
    scanned: 0,
    scannedAt: null,
    buyCount: 0,
    sellCount: 0
};

let history = [];

let currentTab = "dashboard";

const $ = (selector) =>
    document.querySelector(selector);


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


async function loadData() {

    try {

        const signalResponse = await fetch(
            "../data/signals.json?" + Date.now()
        );

        const historyResponse = await fetch(
            "../data/history.json?" + Date.now()
        );

        if (!signalResponse.ok) {
            throw new Error("Signals file unavailable");
        }

        signals = await signalResponse.json();

        if (historyResponse.ok) {
            history = await historyResponse.json();
        } else {
            history = [];
        }

    } catch (error) {

        console.error(error);

        signals = {
            buy: [],
            sell: [],
            scanned: 0,
            scannedAt: null,
            buyCount: 0,
            sellCount: 0
        };

        history = [];
    }

    updateLastScan();
    render();
}


function updateLastScan() {

    const element = $("#lastScan");

    if (!signals.scannedAt) {
        element.textContent = "Last scan: Not scanned yet";
        return;
    }

    const date = new Date(signals.scannedAt);

    element.textContent =
        "Last scan: " +
        date.toLocaleString("en-IN", {
            dateStyle: "medium",
            timeStyle: "short"
        });
}


function signalBadge(signal) {

    if (signal === "BUY") {
        return `<span class="signal-badge signal-buy">BUY</span>`;
    }

    if (signal === "SELL") {
        return `<span class="signal-badge signal-sell">SELL</span>`;
    }

    return "";
}


function stockRow(item) {

    const distance = Number(item.distanceFrom44);

    return `
        <tr>

            <td>
                <button
                    class="stock-button"
                    onclick='openStock(${JSON.stringify(item).replace(/'/g, "&#39;")})'
                >
                    ${item.symbol}
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

            <td class="${distance >= 0 ? "green" : "red"}">
                ${percentage(distance)}
            </td>

            <td>
                ₹${money(item.sma100)}
            </td>

            <td>
                ₹${money(item.sma200)}
            </td>

            <td class="muted">
                ${item.date || "—"}
            </td>

        </tr>
    `;
}


function stockTable(items) {

    if (!items || items.length === 0) {

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

                    ${items.map(stockRow).join("")}

                </tbody>

            </table>

        </div>
    `;
}


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
                    NSE universe
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
                    Total recorded signals
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
                        ${signals.buy.length} stocks
                    </span>

                </div>

                ${stockTable(signals.buy.slice(0, 10))}

            </div>


            <div class="panel">

                <div class="panel-header">

                    <h2 class="panel-title">
                        🔴 SELL
                    </h2>

                    <span class="panel-count">
                        ${signals.sell.length} stocks
                    </span>

                </div>

                ${stockTable(signals.sell.slice(0, 10))}

            </div>

        </div>


        <div class="panel">

            <div class="panel-header">

                <h2 class="panel-title">
                    Strategy
                </h2>

            </div>

            <div class="conditions">

                <div class="condition ok">
                    ✓ 44 SMA rising versus 10 days ago
                </div>

                <div class="condition ok">
                    ✓ Low touches 44 SMA
                </div>

                <div class="condition ok">
                    ✓ Close above 44 SMA
                </div>

                <div class="condition ok">
                    ✓ 44 SMA above 100 SMA
                </div>

                <div class="condition ok">
                    ✓ 100 SMA above 200 SMA
                </div>

                <div class="condition no">
                    SELL: High touches 44 SMA + Close below 44 SMA
                </div>

            </div>

        </div>
    `;
}


function signalPage(type) {

    const isBuy = type === "buy";

    const items = isBuy
        ? signals.buy
        : signals.sell;

    return `

        <div class="panel">

            <div class="panel-header">

                <h2 class="panel-title">
                    ${isBuy ? "🟢 BUY TRIGGERS" : "🔴 SELL TRIGGERS"}
                </h2>

                <span class="panel-count">
                    ${items.length} stocks
                </span>

            </div>


            <div class="toolbar">

                <input
                    id="stockSearch"
                    class="search"
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


function historyPage() {

    return `

        <div class="panel">

            <div class="panel-header">

                <h2 class="panel-title">
                    Signal History
                </h2>

                <span class="panel-count">
                    ${history.length} records
                </span>

            </div>


            <div class="toolbar">

                <input
                    id="historySearch"
                    class="search"
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


function render() {

    const content = $("#content");

    let title = "Dashboard";

    if (currentTab === "buy") {
        title = "BUY";
    }

    if (currentTab === "sell") {
        title = "SELL";
    }

    if (currentTab === "history") {
        title = "History";
    }

    $("#pageTitle").textContent = title;


    if (currentTab === "dashboard") {
        content.innerHTML = dashboardView();
    }

    if (currentTab === "buy") {
        content.innerHTML = signalPage("buy");
    }

    if (currentTab === "sell") {
        content.innerHTML = signalPage("sell");
    }

    if (currentTab === "history") {
        content.innerHTML = historyPage();
    }


    setupSearch();
}


function setupSearch() {

    const search = $("#stockSearch");

    if (search) {

        search.addEventListener("input", () => {

            const query =
                search.value.trim().toUpperCase();

            const items =
                currentTab === "buy"
                    ? signals.buy
                    : signals.sell;

            const filtered = items.filter(item =>
                item.symbol.includes(query)
            );

            $("#signalTable").innerHTML =
                stockTable(filtered);
        });
    }


    const historySearch = $("#historySearch");

    if (historySearch) {

        historySearch.addEventListener("input", () => {

            const query =
                historySearch.value.trim().toUpperCase();

            const filtered = history.filter(item =>
                item.symbol.includes(query)
            );

            $("#historyTable").innerHTML =
                stockTable(filtered);
        });
    }
}


function openStock(item) {

    const modal = $("#stockModal");
    const content = $("#modalContent");

    const checks =
        item.signal === "BUY"
            ? item.buyChecks
            : item.sellChecks;


    const conditions = Object.entries(checks)
        .map(([name, passed]) => {

            return `
                <div class="condition ${passed ? "ok" : "no"}">
                    <strong>
                        ${passed ? "✓" : "✕"}
                    </strong>
                    ${formatConditionName(name)}
                </div>
            `;
        })
        .join("");


    content.innerHTML = `

        <div class="stock-heading">

            <h2>
                ${item.symbol}
            </h2>

            ${signalBadge(item.signal)}

        </div>


        <div class="chart-container">

            <iframe
                src="https://www.tradingview.com/widgetembed/?symbol=NSE%3A${encodeURIComponent(item.symbol)}&interval=D&theme=dark&style=1&locale=en&hide_top_toolbar=0&hide_legend=0&allow_symbol_change=0"
                loading="lazy"
            ></iframe>

        </div>


        <div class="metrics-grid">

            <div class="metric">

                <div class="metric-label">
                    Close
                </div>

                <div class="metric-value">
                    ₹${money(item.Close)}
                </div>

            </div>


            <div class="metric">

                <div class="metric-label">
                    44 SMA
                </div>

                <div class="metric-value">
                    ₹${money(item.sma44)}
                </div>

            </div>


            <div class="metric">

                <div class="metric-label">
                    100 SMA
                </div>

                <div class="metric-value">
                    ₹${money(item.sma100)}
                </div>

            </div>


            <div class="metric">

                <div class="metric-label">
                    200 SMA
                </div>

                <div class="metric-value">
                    ₹${money(item.sma200)}
                </div>

            </div>

        </div>


        <h3 class="conditions-title">
            ${item.signal} signal conditions
        </h3>


        <div class="conditions">
            ${conditions}
        </div>


        <div class="metrics-grid">

            <div class="metric">

                <div class="metric-label">
                    Today's High
                </div>

                <div class="metric-value">
                    ₹${money(item.High)}
                </div>

            </div>


            <div class="metric">

                <div class="metric-label">
                    Today's Low
                </div>

                <div class="metric-value">
                    ₹${money(item.Low)}
                </div>

            </div>


            <div class="metric">

                <div class="metric-label">
                    44 SMA / 10D Ago
                </div>

                <div class="metric-value">
                    ₹${money(item.sma44_10d)}
                </div>

            </div>


            <div class="metric">

                <div class="metric-label">
                    Signal Date
                </div>

                <div class="metric-value">
                    ${item.date || "—"}
                </div>

            </div>

        </div>

    `;

    modal.classList.remove("hidden");
}


function formatConditionName(name) {

    const names = {

        sma44Rising10d:
            "44 SMA is higher than 10 trading days ago",

        lowTouches44:
            "Stock Low touched 44 SMA",

        closeAbove44:
            "Stock Close is above 44 SMA",

        sma44Above100:
            "44 SMA is above 100 SMA",

        sma100Above200:
            "100 SMA is above 200 SMA",

        highTouches44:
            "Stock High touched 44 SMA",

        closeBelow44:
            "Stock Close is below 44 SMA"
    };

    return names[name] || name;
}


function closeModal() {
    $("#stockModal").classList.add("hidden");
}


document
    .querySelectorAll(".nav-item")
    .forEach(button => {

        button.addEventListener("click", () => {

            currentTab = button.dataset.tab;

            document
                .querySelectorAll(".nav-item")
                .forEach(item =>
                    item.classList.remove("active")
                );

            button.classList.add("active");

            render();
        });

    });


$("#refreshButton").addEventListener(
    "click",
    loadData
);


$("#closeModal").addEventListener(
    "click",
    closeModal
);


document
    .querySelector(".modal-overlay")
    .addEventListener(
        "click",
        closeModal
    );


loadData();
