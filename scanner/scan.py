import json
import math
from datetime import datetime, timezone
from pathlib import Path
from io import StringIO

import pandas as pd
import requests
import yfinance as yf


# ============================================================
# SETTINGS
# ============================================================

PORTFOLIO_ALLOCATION = 5000


# ============================================================
# PATHS
# ============================================================

ROOT = Path(__file__).resolve().parents[1]

DATA = ROOT / "data"
CHARTS = DATA / "charts"

DATA.mkdir(exist_ok=True)
CHARTS.mkdir(exist_ok=True)


# ============================================================
# OFFICIAL NSE NIFTY 500
# ============================================================

NIFTY500_URL = (
    "https://archives.nseindia.com/"
    "content/indices/ind_nifty500list.csv"
)


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,"
        "application/xml;q=0.9,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/",
}


# ============================================================
# GET CURRENT NIFTY 500
# ============================================================

def get_nifty500_symbols():

    print("")
    print("=" * 70)
    print("DOWNLOADING CURRENT OFFICIAL NSE NIFTY 500")
    print("=" * 70)

    session = requests.Session()
    session.headers.update(HEADERS)

    try:

        session.get(
            "https://www.nseindia.com/",
            timeout=20
        )

        response = session.get(
            NIFTY500_URL,
            timeout=30
        )

        response.raise_for_status()

        df = pd.read_csv(
            StringIO(response.text)
        )

        print(
            "NSE columns:",
            list(df.columns)
        )

        if "Symbol" not in df.columns:

            raise Exception(
                "NSE CSV does not contain Symbol column"
            )

        symbols = []

        for value in df["Symbol"].dropna():

            symbol = str(
                value
            ).strip().upper()

            symbol = symbol.replace(
                ".NS",
                ""
            )

            symbol = symbol.lstrip("$")
            symbol = symbol.strip()

            if not symbol:
                continue

            if symbol in [
                "SYMBOL",
                "NIFTY500",
                "NIFTY 500"
            ]:
                continue

            if symbol not in symbols:
                symbols.append(symbol)

        if len(symbols) < 450:

            raise Exception(
                f"Only {len(symbols)} NIFTY 500 "
                "symbols were received"
            )

        print("")
        print(
            f"CURRENT NIFTY 500 STOCKS: {len(symbols)}"
        )

        print("")
        print("First 10:")
        print(symbols[:10])

        return symbols

    except Exception as error:

        print("")
        print("NIFTY 500 DOWNLOAD FAILED")
        print(str(error))
        print("")

        raise Exception(
            "Could not download current NIFTY 500 list."
        )


# ============================================================
# DOWNLOAD BATCH
# ============================================================

def download_batch(
    symbols,
    batch_number,
    total_batches
):

    tickers = [
        f"{symbol}.NS"
        for symbol in symbols
    ]

    print("")
    print("=" * 70)
    print(
        f"BATCH {batch_number}/{total_batches}"
    )
    print(
        f"Stocks: {len(tickers)}"
    )
    print("=" * 70)

    try:

        data = yf.download(
            tickers=tickers,
            period="18mo",
            interval="1d",
            auto_adjust=False,
            progress=False,
            threads=True,
            group_by="ticker"
        )

        return data

    except Exception as error:

        print("Batch download failed:")
        print(str(error))

        return None


# ============================================================
# SAVE CHART DATA
# ============================================================

def save_chart_data(
    symbol,
    df
):

    try:

        chart_rows = []

        chart_df = df.copy()

        chart_df = chart_df.dropna(
            subset=[
                "Open",
                "High",
                "Low",
                "Close"
            ]
        )

        for index, row in chart_df.iterrows():

            item = {

                "date":
                    index.strftime(
                        "%Y-%m-%d"
                    ),

                "open":
                    round(
                        float(row["Open"]),
                        2
                    ),

                "high":
                    round(
                        float(row["High"]),
                        2
                    ),

                "low":
                    round(
                        float(row["Low"]),
                        2
                    ),

                "close":
                    round(
                        float(row["Close"]),
                        2
                    ),

                "sma44":
                    None,

                "sma100":
                    None,

                "sma200":
                    None
            }

            if pd.notna(row["sma44"]):

                item["sma44"] = round(
                    float(row["sma44"]),
                    2
                )

            if pd.notna(row["sma100"]):

                item["sma100"] = round(
                    float(row["sma100"]),
                    2
                )

            if pd.notna(row["sma200"]):

                item["sma200"] = round(
                    float(row["sma200"]),
                    2
                )

            chart_rows.append(item)

        chart_file = (
            CHARTS /
            f"{symbol}.json"
        )

        chart_file.write_text(
            json.dumps(
                {
                    "symbol": symbol,
                    "ticker": f"{symbol}.NS",
                    "data": chart_rows
                },
                indent=2
            ),
            encoding="utf-8"
        )

        return True

    except Exception as error:

        print(
            f"Chart save failed for {symbol}: "
            f"{error}"
        )

        return False


# ============================================================
# EMPTY PORTFOLIO
# ============================================================

def empty_portfolio():

    return {

        "version": 1,

        "allocationPerStock":
            PORTFOLIO_ALLOCATION,

        "createdAt":
            datetime.now(
                timezone.utc
            ).isoformat(),

        "updatedAt": None,

        "openPositions": [],

        "closedTrades": [],

        "realizedPnL": 0,

        "unrealizedPnL": 0,

        "totalInvested": 0,

        "totalCurrentValue": 0,

        "totalPnL": 0,

        "totalPnLPercent": 0,

        "openPositionsCount": 0,

        "totalTrades": 0,

        "winningTrades": 0,

        "losingTrades": 0
    }


# ============================================================
# LOAD PORTFOLIO
# ============================================================

def load_portfolio():

    portfolio_file = (
        DATA / "portfolio.json"
    )

    if not portfolio_file.exists():

        return empty_portfolio()

    try:

        portfolio = json.loads(
            portfolio_file.read_text(
                encoding="utf-8"
            )
        )

        if not isinstance(
            portfolio,
            dict
        ):

            return empty_portfolio()

        if "openPositions" not in portfolio:
            portfolio["openPositions"] = []

        if "closedTrades" not in portfolio:
            portfolio["closedTrades"] = []

        if "realizedPnL" not in portfolio:
            portfolio["realizedPnL"] = 0

        return portfolio

    except Exception as error:

        print("Portfolio load failed:")
        print(str(error))

        return empty_portfolio()


# ============================================================
# SAVE PORTFOLIO
# ============================================================

def save_portfolio(portfolio):

    portfolio_file = (
        DATA / "portfolio.json"
    )

    portfolio_file.write_text(
        json.dumps(
            portfolio,
            indent=2
        ),
        encoding="utf-8"
    )


# ============================================================
# UPDATE PORTFOLIO
# ============================================================

def update_portfolio(
    portfolio,
    results,
    buys,
    sells,
    scanned_at
):

    print("")
    print("=" * 70)
    print("UPDATING ₹5,000 PER STOCK PORTFOLIO")
    print("=" * 70)

    open_positions = portfolio.get(
        "openPositions",
        []
    )

    closed_trades = portfolio.get(
        "closedTrades",
        []
    )

    realized_pnl = float(
        portfolio.get(
            "realizedPnL",
            0
        )
    )

    # ========================================================
    # CREATE QUICK LOOKUP OF LATEST PRICES
    # ========================================================

    latest_prices = {}

    for item in results:

        symbol = item.get("symbol")

        if symbol:

            latest_prices[symbol] = item

    # ========================================================
    # UPDATE EXISTING POSITIONS WITH CURRENT PRICE
    # ========================================================

    for position in open_positions:

        symbol = position["symbol"]

        latest = latest_prices.get(
            symbol
        )

        if latest is None:
            continue

        current_price = float(
            latest["Close"]
        )

        position["currentPrice"] = round(
            current_price,
            2
        )

        position["currentValue"] = round(
            position["quantity"] *
            current_price,
            2
        )

        position["unrealizedPnL"] = round(
            position["currentValue"] -
            position["invested"],
            2
        )

        if position["invested"] > 0:

            position[
                "unrealizedPnLPercent"
            ] = round(
                (
                    position["unrealizedPnL"] /
                    position["invested"]
                ) * 100,
                2
            )

        else:

            position[
                "unrealizedPnLPercent"
            ] = 0

        position["lastUpdated"] = scanned_at

    # ========================================================
    # BUY SIGNALS
    # ========================================================

    for item in buys:

        symbol = item["symbol"]

        already_held = any(
            position["symbol"] == symbol
            for position in open_positions
        )

        if already_held:

            print(
                f"⏭️ HOLD {symbol} "
                f"- already in portfolio"
            )

            continue

        buy_price = float(
            item["Close"]
        )

        if buy_price <= 0:
            continue

        quantity = math.floor(
            PORTFOLIO_ALLOCATION /
            buy_price
        )

        if quantity <= 0:

            print(
                f"⚠️ SKIP {symbol} "
                f"- price ₹{buy_price:.2f} "
                f"is above ₹5,000"
            )

            continue

        invested = (
            quantity *
            buy_price
        )

        position = {

            "symbol":
                symbol,

            "ticker":
                item["ticker"],

            "buyDate":
                item["date"],

            "buyTimestamp":
                scanned_at,

            "buyPrice":
                round(
                    buy_price,
                    2
                ),

            "quantity":
                quantity,

            "invested":
                round(
                    invested,
                    2
                ),

            "currentPrice":
                round(
                    buy_price,
                    2
                ),

            "currentValue":
                round(
                    invested,
                    2
                ),

            "unrealizedPnL":
                0,

            "unrealizedPnLPercent":
                0,

            "signal":
                "BUY",

            "lastUpdated":
                scanned_at
        }

        open_positions.append(
            position
        )

        print(
            f"🟢 PORTFOLIO BUY "
            f"{symbol} | "
            f"{quantity} shares | "
            f"₹{invested:.2f}"
        )

    # ========================================================
    # SELL SIGNALS
    # ========================================================

    for item in sells:

        symbol = item["symbol"]

        sell_price = float(
            item["Close"]
        )

        position_index = None

        for index, position in enumerate(
            open_positions
        ):

            if position["symbol"] == symbol:

                position_index = index
                break

        # ----------------------------------------------------
        # SELL SIGNAL BUT STOCK NOT HELD
        # ----------------------------------------------------

        if position_index is None:

            print(
                f"⏭️ SELL {symbol} "
                f"- not held in portfolio"
            )

            continue

        position = open_positions[
            position_index
        ]

        quantity = int(
            position["quantity"]
        )

        buy_price = float(
            position["buyPrice"]
        )

        invested = float(
            position["invested"]
        )

        sell_value = (
            quantity *
            sell_price
        )

        trade_pnl = (
            sell_value -
            invested
        )

        if invested > 0:

            trade_pnl_percent = (
                trade_pnl /
                invested
            ) * 100

        else:

            trade_pnl_percent = 0

        if trade_pnl > 0:
            result_text = "WIN"

        elif trade_pnl < 0:
            result_text = "LOSS"

        else:
            result_text = "BREAKEVEN"

        closed_trade = {

            "symbol":
                symbol,

            "ticker":
                position["ticker"],

            "buyDate":
                position["buyDate"],

            "buyTimestamp":
                position["buyTimestamp"],

            "buyPrice":
                round(
                    buy_price,
                    2
                ),

            "quantity":
                quantity,

            "invested":
                round(
                    invested,
                    2
                ),

            "sellDate":
                item["date"],

            "sellTimestamp":
                scanned_at,

            "sellPrice":
                round(
                    sell_price,
                    2
                ),

            "sellValue":
                round(
                    sell_value,
                    2
                ),

            "pnl":
                round(
                    trade_pnl,
                    2
                ),

            "pnlPercent":
                round(
                    trade_pnl_percent,
                    2
                ),

            "result":
                result_text
        }

        closed_trades.insert(
            0,
            closed_trade
        )

        realized_pnl += trade_pnl

        open_positions.pop(
            position_index
        )

        print(
            f"🔴 PORTFOLIO SELL "
            f"{symbol} | "
            f"{quantity} shares | "
            f"P&L ₹{trade_pnl:.2f} | "
            f"{result_text}"
        )

    # ========================================================
    # FINAL CURRENT VALUE
    # ========================================================

    total_invested = 0
    total_current_value = 0

    for position in open_positions:

        total_invested += float(
            position["invested"]
        )

        total_current_value += float(
            position["currentValue"]
        )

    # ========================================================
    # UNREALIZED P&L
    # ========================================================

    unrealized_pnl = (
        total_current_value -
        total_invested
    )

    # ========================================================
    # TOTAL P&L
    # ========================================================

    total_pnl = (
        realized_pnl +
        unrealized_pnl
    )

    # Percentage based on capital
    # deployed into currently open
    # positions plus positive realized
    # gains.

    capital_basis = (
        total_invested +
        max(
            0,
            realized_pnl
        )
    )

    if capital_basis > 0:

        total_pnl_percent = (
            total_pnl /
            capital_basis
        ) * 100

    else:

        total_pnl_percent = 0

    # ========================================================
    # TRADE STATISTICS
    # ========================================================

    winning_trades = sum(
        1
        for trade in closed_trades
        if float(
            trade.get(
                "pnl",
                0
            )
        ) > 0
    )

    losing_trades = sum(
        1
        for trade in closed_trades
        if float(
            trade.get(
                "pnl",
                0
            )
        ) < 0
    )

    # ========================================================
    # SAVE PORTFOLIO
    # ========================================================

    portfolio[
        "allocationPerStock"
    ] = PORTFOLIO_ALLOCATION

    portfolio[
        "updatedAt"
    ] = scanned_at

    portfolio[
        "openPositions"
    ] = open_positions

    portfolio[
        "closedTrades"
    ] = closed_trades[:10000]

    portfolio[
        "realizedPnL"
    ] = round(
        realized_pnl,
        2
    )

    portfolio[
        "unrealizedPnL"
    ] = round(
        unrealized_pnl,
        2
    )

    portfolio[
        "totalInvested"
    ] = round(
        total_invested,
        2
    )

    portfolio[
        "totalCurrentValue"
    ] = round(
        total_current_value,
        2
    )

    portfolio[
        "totalPnL"
    ] = round(
        total_pnl,
        2
    )

    portfolio[
        "totalPnLPercent"
    ] = round(
        total_pnl_percent,
        2
    )

    portfolio[
        "openPositionsCount"
    ] = len(
        open_positions
    )

    portfolio[
        "totalTrades"
    ] = len(
        closed_trades
    )

    portfolio[
        "winningTrades"
    ] = winning_trades

    portfolio[
        "losingTrades"
    ] = losing_trades

    save_portfolio(
        portfolio
    )

    # ========================================================
    # REPORT
    # ========================================================

    print("")
    print(
        f"Open positions : "
        f"{len(open_positions)}"
    )

    print(
        f"Realized P&L   : "
        f"₹{realized_pnl:.2f}"
    )

    print(
        f"Unrealized P&L : "
        f"₹{unrealized_pnl:.2f}"
    )

    print(
        f"Invested       : "
        f"₹{total_invested:.2f}"
    )

    print(
        f"Current value  : "
        f"₹{total_current_value:.2f}"
    )

    print(
        f"Total P&L      : "
        f"₹{total_pnl:.2f}"
    )

    print(
        f"Total P&L %    : "
        f"{total_pnl_percent:.2f}%"
    )

    print("=" * 70)


# ============================================================
# PROCESS STOCK
# ============================================================

def process_stock(
    symbol,
    batch_data
):

    ticker = f"{symbol}.NS"

    try:

        if batch_data is None:
            return None

        if not isinstance(
            batch_data.columns,
            pd.MultiIndex
        ):
            return None

        available_symbols = set(
            batch_data.columns
            .get_level_values(0)
        )

        if ticker not in available_symbols:
            return None

        df = batch_data[
            ticker
        ].copy()

        required_columns = [
            "Open",
            "High",
            "Low",
            "Close"
        ]

        for column in required_columns:

            if column not in df.columns:
                return None

        df = df.dropna(
            subset=required_columns
        ).copy()

        if len(df) < 210:
            return None

        # ====================================================
        # MOVING AVERAGES
        # ====================================================

        df["sma44"] = (
            df["Close"]
            .rolling(44)
            .mean()
        )

        df["sma100"] = (
            df["Close"]
            .rolling(100)
            .mean()
        )

        df["sma200"] = (
            df["Close"]
            .rolling(200)
            .mean()
        )

        df["sma44_10d"] = (
            df["sma44"]
            .shift(10)
        )

        # ====================================================
        # SAVE CHART HISTORY
        # ====================================================

        save_chart_data(
            symbol,
            df
        )

        # ====================================================
        # CURRENT DAY
        # ====================================================

        row = df.iloc[-1]

        required_values = [
            "Open",
            "High",
            "Low",
            "Close",
            "sma44",
            "sma100",
            "sma200",
            "sma44_10d"
        ]

        for column in required_values:

            if pd.isna(
                row[column]
            ):
                return None

        open_price = float(
            row["Open"]
        )

        high_price = float(
            row["High"]
        )

        low_price = float(
            row["Low"]
        )

        close_price = float(
            row["Close"]
        )

        sma44 = float(
            row["sma44"]
        )

        sma100 = float(
            row["sma100"]
        )

        sma200 = float(
            row["sma200"]
        )

        sma44_10d = float(
            row["sma44_10d"]
        )

        # ====================================================
        # BUY STRATEGY
        # ====================================================

        # BUY PROXIMITY TO 44 SMA
        # Allow the day's Low to be up to 1% ABOVE the 44 SMA.
        # This replaces the old exact-touch requirement.

        buy_distance_from_44 = (
            (
                low_price /
                sma44
            ) - 1
        ) * 100

        buy_checks = {

            "44 SMA rising":
                sma44 > sma44_10d,

            "Low within 1% of 44 SMA":
                buy_distance_from_44 <= 1.0,

            "Close above 44 SMA":
                close_price > sma44,

            "44 SMA above 100 SMA":
                sma44 > sma100,

            "100 SMA above 200 SMA":
                sma100 > sma200,

            "Green candle":
                close_price > open_price
        }

        buy = all(
            buy_checks.values()
        )

        # ====================================================
        # SELL STRATEGY
        # ====================================================

        sell_checks = {

            "High touches 44 SMA":
                high_price >= sma44,

            "Close below 44 SMA":
                close_price < sma44,

            "Red candle":
                close_price < open_price
        }

        sell = all(
            sell_checks.values()
        )

        if buy:

            signal = "BUY"

        elif sell:

            signal = "SELL"

        else:

            signal = "NONE"

        distance_from_44 = (
            (
                close_price /
                sma44
            ) - 1
        ) * 100

        return {

            "symbol":
                symbol,

            "ticker":
                ticker,

            "date":
                df.index[-1].strftime(
                    "%Y-%m-%d"
                ),

            "signal":
                signal,

            "Open":
                open_price,

            "High":
                high_price,

            "Low":
                low_price,

            "Close":
                close_price,

            "sma44":
                sma44,

            "sma100":
                sma100,

            "sma200":
                sma200,

            "sma44_10d":
                sma44_10d,

            "distanceFrom44":
                distance_from_44,

            "buyDistanceFrom44":
                buy_distance_from_44,

            "buyChecks":
                buy_checks,

            "sellChecks":
                sell_checks
        }

    except Exception as error:

        print(
            f"{symbol}: {error}"
        )

        return None


# ============================================================
# MAIN
# ============================================================

def main():

    print("")
    print("=" * 70)
    print("44 SMA SCANNER PRO")
    print("₹5,000 PER STOCK PORTFOLIO")
    print("=" * 70)
    print("")

    # ========================================================
    # CURRENT NIFTY 500
    # ========================================================

    symbols = get_nifty500_symbols()

    print("")
    print(
        f"TOTAL UNIVERSE: {len(symbols)}"
    )

    # ========================================================
    # BATCHES
    # ========================================================

    batch_size = 50

    batches = [
        symbols[i:i + batch_size]
        for i in range(
            0,
            len(symbols),
            batch_size
        )
    ]

    results = []
    skipped = []

    # ========================================================
    # SCAN
    # ========================================================

    for batch_number, batch_symbols in enumerate(
        batches,
        start=1
    ):

        batch_data = download_batch(
            batch_symbols,
            batch_number,
            len(batches)
        )

        for symbol in batch_symbols:

            result = process_stock(
                symbol,
                batch_data
            )

            if result is None:

                skipped.append(
                    symbol
                )

                continue

            results.append(
                result
            )

            if result["signal"] == "BUY":

                print(
                    f"🟢 BUY  {symbol}"
                )

            elif result["signal"] == "SELL":

                print(
                    f"🔴 SELL {symbol}"
                )

    # ========================================================
    # BUY / SELL
    # ========================================================

    buys = [
        item
        for item in results
        if item["signal"] == "BUY"
    ]

    sells = [
        item
        for item in results
        if item["signal"] == "SELL"
    ]

    scanned_at = (
        datetime.now(
            timezone.utc
        ).isoformat()
    )

    # ========================================================
    # SIGNALS
    # ========================================================

    signals = {

        "scannedAt":
            scanned_at,

        "strategy":
            "44 SMA Support / Breakdown",

        "portfolioAllocation":
            PORTFOLIO_ALLOCATION,

        "universe":
            "NIFTY 500",

        "universeCount":
            len(symbols),

        "scanned":
            len(results),

        "skipped":
            len(skipped),

        "buyCount":
            len(buys),

        "sellCount":
            len(sells),

        "buy":
            buys,

        "sell":
            sells
    }

    (
        DATA /
        "signals.json"
    ).write_text(
        json.dumps(
            signals,
            indent=2
        ),
        encoding="utf-8"
    )

    # ========================================================
    # HISTORY
    # ========================================================

    history_file = (
        DATA / "history.json"
    )

    if history_file.exists():

        try:

            history = json.loads(
                history_file.read_text(
                    encoding="utf-8"
                )
            )

        except Exception:

            history = []

    else:

        history = []

    for item in (
        buys + sells
    ):

        history.insert(
            0,
            {
                "scannedAt":
                    scanned_at,

                "universe":
                    "NIFTY 500",

                **item
            }
        )

    history = history[:10000]

    history_file.write_text(
        json.dumps(
            history,
            indent=2
        ),
        encoding="utf-8"
    )

    # ========================================================
    # PORTFOLIO
    # ========================================================

    portfolio = load_portfolio()

    update_portfolio(
        portfolio,
        results,
        buys,
        sells,
        scanned_at
    )

    # ========================================================
    # UNIVERSE
    # ========================================================

    universe = {

        "updatedAt":
            scanned_at,

        "source":
            "Official NSE NIFTY 500",

        "count":
            len(symbols),

        "symbols":
            symbols
    }

    (
        DATA /
        "universe.json"
    ).write_text(
        json.dumps(
            universe,
            indent=2
        ),
        encoding="utf-8"
    )

    # ========================================================
    # SKIPPED
    # ========================================================

    skipped_data = {

        "scannedAt":
            scanned_at,

        "count":
            len(skipped),

        "symbols":
            skipped
    }

    (
        DATA /
        "skipped.json"
    ).write_text(
        json.dumps(
            skipped_data,
            indent=2
        ),
        encoding="utf-8"
    )

    # ========================================================
    # FINAL REPORT
    # ========================================================

    chart_count = len(
        list(
            CHARTS.glob(
                "*.json"
            )
        )
    )

    print("")
    print("=" * 70)
    print("44 SMA SCANNER COMPLETE")
    print("=" * 70)

    print(
        f"Universe              : "
        f"{len(symbols)}"
    )

    print(
        f"Successfully scanned  : "
        f"{len(results)}"
    )

    print(
        f"Skipped               : "
        f"{len(skipped)}"
    )

    print(
        f"BUY signals           : "
        f"{len(buys)}"
    )

    print(
        f"SELL signals          : "
        f"{len(sells)}"
    )

    print(
        f"Chart files created   : "
        f"{chart_count}"
    )

    print(
        f"Portfolio allocation  : "
        f"₹{PORTFOLIO_ALLOCATION:,} "
        f"per stock"
    )

    print(
        f"Portfolio positions   : "
        f"{len(portfolio['openPositions'])}"
    )

    print(
        f"Portfolio invested    : "
        f"₹{portfolio['totalInvested']:.2f}"
    )

    print(
        f"Portfolio value       : "
        f"₹{portfolio['totalCurrentValue']:.2f}"
    )

    print(
        f"Portfolio total P&L   : "
        f"₹{portfolio['totalPnL']:.2f}"
    )

    print(
        f"Portfolio P&L %       : "
        f"{portfolio['totalPnLPercent']:.2f}%"
    )

    print("=" * 70)
    print("")


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":
    main()
