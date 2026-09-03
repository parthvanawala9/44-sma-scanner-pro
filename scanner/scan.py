import json
import math
from datetime import datetime, timezone
from pathlib import Path
from io import StringIO

import pandas as pd
import requests
import yfinance as yf


# ============================================================
# 44 SMA SCANNER PRO
# CLOSING PRICE PORTFOLIO SYSTEM
# ============================================================

PORTFOLIO_ALLOCATION = 5000

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CHARTS = DATA / "charts"

DATA.mkdir(parents=True, exist_ok=True)
CHARTS.mkdir(parents=True, exist_ok=True)


# ============================================================
# NIFTY 500
# ============================================================

NIFTY_500_URL = (
    "https://archives.nseindia.com/content/indices/ind_nifty500list.csv"
)


def get_nifty500():

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0 Safari/537.36"
        ),
        "Accept": "text/csv,text/plain,*/*",
        "Referer": "https://www.nseindia.com/",
    }

    try:

        response = requests.get(
            NIFTY_500_URL,
            headers=headers,
            timeout=30,
        )

        response.raise_for_status()

        df = pd.read_csv(
            StringIO(response.text)
        )

        if "Symbol" not in df.columns:
            raise ValueError(
                "NSE NIFTY 500 CSV does not contain Symbol column."
            )

        symbols = (
            df["Symbol"]
            .dropna()
            .astype(str)
            .str.strip()
            .str.upper()
            .tolist()
        )

        symbols = list(
            dict.fromkeys(symbols)
        )

        print(
            f"NIFTY 500 symbols loaded: {len(symbols)}"
        )

        return symbols

    except Exception as error:

        print(
            f"Failed to download NIFTY 500 list: {error}"
        )

        fallback_file = DATA / "universe.json"

        if fallback_file.exists():

            try:

                with open(
                    fallback_file,
                    "r",
                    encoding="utf-8",
                ) as file:

                    old = json.load(file)

                if isinstance(old, list):
                    return old

                if (
                    isinstance(old, dict)
                    and isinstance(
                        old.get("symbols"),
                        list,
                    )
                ):
                    return old["symbols"]

            except Exception:
                pass

        return []


# ============================================================
# YFINANCE
# ============================================================

def download_batch(symbols):

    tickers = [
        f"{symbol}.NS"
        for symbol in symbols
    ]

    try:

        data = yf.download(
            tickers=tickers,
            period="18mo",
            interval="1d",
            auto_adjust=False,
            group_by="ticker",
            threads=True,
            progress=False,
        )

        return data

    except Exception as error:

        print(
            f"Batch download error: {error}"
        )

        return pd.DataFrame()


# ============================================================
# CHART DATA
# ============================================================

def save_chart_data(
    symbol,
    df,
):

    try:

        if df is None or df.empty:
            return

        chart_df = df.copy()

        if isinstance(
            chart_df.columns,
            pd.MultiIndex,
        ):

            chart_df.columns = [
                column[0]
                if isinstance(column, tuple)
                else column
                for column in chart_df.columns
            ]

        required = [
            "Open",
            "High",
            "Low",
            "Close",
        ]

        for column in required:

            if column not in chart_df.columns:
                return

            chart_df[column] = pd.to_numeric(
                chart_df[column],
                errors="coerce",
            )

        chart_df = chart_df.dropna(
            subset=required
        )

        if chart_df.empty:
            return

        chart_df["sma44"] = (
            chart_df["Close"]
            .rolling(44)
            .mean()
        )

        chart_df["sma100"] = (
            chart_df["Close"]
            .rolling(100)
            .mean()
        )

        chart_df["sma200"] = (
            chart_df["Close"]
            .rolling(200)
            .mean()
        )

        chart_df = chart_df.dropna(
            subset=[
                "sma44",
                "sma100",
                "sma200",
            ]
        )

        output = []

        for index, row in chart_df.iterrows():

            try:

                date_value = pd.to_datetime(
                    index
                ).strftime(
                    "%Y-%m-%d"
                )

                output.append(
                    {
                        "date": date_value,
                        "open": float(row["Open"]),
                        "high": float(row["High"]),
                        "low": float(row["Low"]),
                        "close": float(row["Close"]),
                        "sma44": float(row["sma44"]),
                        "sma100": float(row["sma100"]),
                        "sma200": float(row["sma200"]),
                    }
                )

            except Exception:
                continue

        if not output:
            return

        file_path = (
            CHARTS / f"{symbol}.json"
        )

        # IMPORTANT:
        # Dashboard app.js expects chart.data
        chart_payload = {
            "symbol": symbol,
            "data": output,
        }

        with open(
            file_path,
            "w",
            encoding="utf-8",
        ) as file:

            json.dump(
                chart_payload,
                file,
                separators=(",", ":"),
                ensure_ascii=False,
            )

    except Exception as error:

        print(
            f"Chart save error for {symbol}: {error}"
        )


# ============================================================
# PORTFOLIO
# ============================================================

def empty_portfolio():

    return {
        "version": 3,

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
        "losingTrades": 0,
    }


def load_portfolio():

    file_path = DATA / "portfolio.json"

    if not file_path.exists():
        return empty_portfolio()

    try:

        with open(
            file_path,
            "r",
            encoding="utf-8",
        ) as file:

            portfolio = json.load(file)

        if not isinstance(
            portfolio,
            dict,
        ):

            return empty_portfolio()

        defaults = empty_portfolio()

        for key, value in defaults.items():

            if key not in portfolio:
                portfolio[key] = value

        if not isinstance(
            portfolio.get("openPositions"),
            list,
        ):

            portfolio["openPositions"] = []

        if not isinstance(
            portfolio.get("closedTrades"),
            list,
        ):

            portfolio["closedTrades"] = []

        # ----------------------------------------------------
        # IMPORTANT
        # Old NEXT_TRADING_DAY_OPEN system used pendingOrders.
        #
        # We are now permanently using same-day CLOSE execution.
        #
        # DO NOT execute old pending orders.
        # Simply remove them.
        # ----------------------------------------------------

        portfolio.pop(
            "pendingOrders",
            None,
        )

        portfolio["version"] = 3

        return portfolio

    except Exception as error:

        print(
            f"Portfolio load error: {error}"
        )

        return empty_portfolio()


def save_portfolio(
    portfolio,
):

    file_path = DATA / "portfolio.json"

    with open(
        file_path,
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            portfolio,
            file,
            indent=2,
            ensure_ascii=False,
        )


# ============================================================
# HELPERS
# ============================================================

def normalize_date(value):

    if value is None:
        return None

    try:

        return pd.to_datetime(
            value
        ).strftime(
            "%Y-%m-%d"
        )

    except Exception:

        return str(value)[:10]


def find_position(
    portfolio,
    symbol,
):

    for position in portfolio.get(
        "openPositions",
        [],
    ):

        if (
            position.get("symbol")
            == symbol
        ):

            return position

    return None


# ============================================================
# EXECUTE SAME-DAY CLOSE
# ============================================================

def update_portfolio(
    portfolio,
    results,
    buys,
    sells,
    scanned_at,
):

    """
    FINAL PORTFOLIO MODEL

    Scanner runs after daily candle closes.

    BUY:
        Today's BUY signal
        -> BUY at today's CLOSE

    SELL:
        An existing position is sold at today's CLOSE when
        ANY of these is true:
          1. Close <= 5% below Buy Price
          2. Close >= 20% above Buy Price
          3. Close < 44 SMA (trailing stop)

    No pending orders.
    No next-day OPEN execution.
    """

    result_map = {
        item.get("symbol"): item
        for item in results
        if item.get("symbol")
    }

    # ========================================================
    # REMOVE OLD PENDING ORDER SYSTEM
    # ========================================================

    portfolio.pop(
        "pendingOrders",
        None,
    )

    # ========================================================
    # 1. SELL FIRST
    #
    # Portfolio exits are evaluated independently from the
    # scanner-wide SELL list.
    #
    # Existing position exits:
    #   - Close <= 95% of Buy Price  -> 5% Stop Loss
    #   - Close >= 120% of Buy Price -> 20% Target
    #   - Close < 44 SMA             -> 44 SMA Trailing Stop
    #
    # Any one condition is enough to exit.
    # ========================================================

    for position in list(
        portfolio.get("openPositions", [])
    ):

        symbol = position.get("symbol")

        if not symbol:
            continue

        item = result_map.get(symbol)

        if not item:
            continue

        try:

            sell_price = float(
                item.get("Close")
            )

            sma44 = float(
                item.get("sma44")
            )

            buy_price = float(
                position.get(
                    "buyPrice",
                    0,
                )
            )

            quantity = int(
                position.get(
                    "quantity",
                    0,
                )
            )

        except Exception:
            continue

        if (
            not math.isfinite(sell_price)
            or sell_price <= 0
            or not math.isfinite(sma44)
            or buy_price <= 0
            or quantity <= 0
        ):

            continue

        stop_loss_price = (
            buy_price * 0.95
        )

        target_price = (
            buy_price * 1.20
        )

        stop_loss_hit = (
            sell_price <= stop_loss_price
        )

        target_hit = (
            sell_price >= target_price
        )

        trailing_stop_hit = (
            sell_price < sma44
        )

        exit_reasons = []

        if stop_loss_hit:

            exit_reasons.append(
                "5% STOP LOSS"
            )

        if target_hit:

            exit_reasons.append(
                "20% TARGET"
            )

        if trailing_stop_hit:

            exit_reasons.append(
                "44 SMA TRAILING STOP"
            )

        if not exit_reasons:

            continue

        invested = (
            quantity
            * buy_price
        )

        sell_value = (
            quantity
            * sell_price
        )

        pnl = (
            sell_value
            - invested
        )

        pnl_percent = (
            pnl
            / invested
            * 100
            if invested
            else 0
        )

        closed_trade = {

            "symbol":
                symbol,

            "ticker":
                position.get(
                    "ticker",
                    f"{symbol}.NS",
                ),

            "signalDate":
                position.get(
                    "signalDate"
                ),

            "buySignalDate":
                position.get(
                    "signalDate"
                ),

            "buyTimestamp":
                position.get(
                    "buyTimestamp"
                ),

            "buyExecutionTimestamp":
                position.get(
                    "buyExecutionTimestamp"
                ),

            "buyDate":
                position.get(
                    "buyDate"
                ),

            "buyPrice":
                buy_price,

            "sellSignalDate":
                normalize_date(
                    item.get("date")
                ),

            "sellSignalTimestamp":
                scanned_at,

            "sellDate":
                normalize_date(
                    item.get("date")
                ),

            "sellTimestamp":
                scanned_at,

            "sellPrice":
                sell_price,

            "quantity":
                quantity,

            "invested":
                invested,

            "sellValue":
                sell_value,

            "saleValue":
                sell_value,

            "pnl":
                pnl,

            "pnlPercent":
                pnl_percent,

            "exitReason":
                " + ".join(
                    exit_reasons
                ),

            "execution":
                "SAME_DAY_CLOSE",
        }

        portfolio.setdefault(
            "closedTrades",
            [],
        ).append(
            closed_trade
        )

        portfolio["openPositions"] = [
            existing
            for existing
            in portfolio.get(
                "openPositions",
                [],
            )
            if existing.get("symbol")
            != symbol
        ]

        print(
            f"PORTFOLIO SELL: "
            f"{symbol} | "
            f"Close {sell_price:.2f} | "
            f"Qty {quantity} | "
            f"PnL {pnl:.2f} | "
            f"Exit: {' + '.join(exit_reasons)}"
        )

    # ========================================================
    # 2. BUY
    # ========================================================

    for item in buys:

        symbol = item.get("symbol")

        if not symbol:
            continue

        # Already holding
        if find_position(
            portfolio,
            symbol,
        ):

            continue

        try:

            buy_price = float(
                item.get("Close")
            )

            if (
                not math.isfinite(
                    buy_price
                )
                or buy_price <= 0
            ):
                continue

        except Exception:
            continue

        quantity = math.floor(
            PORTFOLIO_ALLOCATION
            / buy_price
        )

        if quantity <= 0:
            continue

        invested = (
            quantity
            * buy_price
        )

        current_value = invested

        position = {

            "symbol":
                symbol,

            "ticker":
                item.get(
                    "ticker",
                    f"{symbol}.NS",
                ),

            # Signal and execution happen same day
            "signalDate":
                normalize_date(
                    item.get("date")
                ),

            "signalTimestamp":
                scanned_at,

            "buyDate":
                normalize_date(
                    item.get("date")
                ),

            "buyTimestamp":
                scanned_at,

            "buyExecutionTimestamp":
                scanned_at,

            "buyPrice":
                buy_price,

            "quantity":
                quantity,

            "invested":
                invested,

            "currentPrice":
                buy_price,

            "currentValue":
                current_value,

            "unrealizedPnL":
                0,

            "unrealizedPnLPercent":
                0,

            "currentSMA44":
                float(
                    item.get(
                        "sma44",
                        0,
                    )
                ),

            "stopLossPrice":
                buy_price * 0.95,

            "targetPrice":
                buy_price * 1.20,

            "exitStatus":
                "HOLD",

            "execution":
                "SAME_DAY_CLOSE",
        }

        portfolio.setdefault(
            "openPositions",
            [],
        ).append(
            position
        )

        print(
            f"PORTFOLIO BUY: "
            f"{symbol} | "
            f"Close {buy_price:.2f} | "
            f"Qty {quantity}"
        )

    # ========================================================
    # 3. UPDATE CURRENT VALUES
    # ========================================================

    for position in portfolio.get(
        "openPositions",
        [],
    ):

        symbol = position.get(
            "symbol"
        )

        item = result_map.get(
            symbol
        )

        if not item:
            continue

        try:

            close_price = float(
                item.get("Close")
            )

            if not math.isfinite(
                close_price
            ):
                continue

            quantity = int(
                position.get(
                    "quantity",
                    0,
                )
            )

            invested = float(
                position.get(
                    "invested",
                    0,
                )
            )

        except Exception:
            continue

        current_value = (
            quantity
            * close_price
        )

        unrealized_pnl = (
            current_value
            - invested
        )

        position["currentPrice"] = (
            close_price
        )

        position["currentValue"] = (
            current_value
        )

        position["unrealizedPnL"] = (
            unrealized_pnl
        )

        position[
            "unrealizedPnLPercent"
        ] = (
            unrealized_pnl
            / invested
            * 100
            if invested
            else 0
        )

        try:

            current_sma44 = float(
                item.get("sma44")
            )

            buy_price = float(
                position.get(
                    "buyPrice",
                    0,
                )
            )

            position["currentSMA44"] = (
                current_sma44
            )

            position["stopLossPrice"] = (
                buy_price * 0.95
            )

            position["targetPrice"] = (
                buy_price * 1.20
            )

            if (
                close_price
                <= position["stopLossPrice"]
            ):

                position["exitStatus"] = (
                    "5% STOP LOSS"
                )

            elif (
                close_price
                >= position["targetPrice"]
            ):

                position["exitStatus"] = (
                    "20% TARGET"
                )

            elif (
                close_price
                < current_sma44
            ):

                position["exitStatus"] = (
                    "44 SMA TRAILING STOP"
                )

            else:

                position["exitStatus"] = (
                    "HOLD"
                )

        except Exception:

            position["exitStatus"] = (
                "HOLD"
            )

    # ========================================================
    # 4. TOTALS
    # ========================================================

    open_positions = portfolio.get(
        "openPositions",
        [],
    )

    closed_trades = portfolio.get(
        "closedTrades",
        [],
    )

    total_invested = sum(
        float(
            position.get(
                "invested",
                0,
            )
        )
        for position
        in open_positions
    )

    total_current_value = sum(
        float(
            position.get(
                "currentValue",
                0,
            )
        )
        for position
        in open_positions
    )

    unrealized_pnl = (
        total_current_value
        - total_invested
    )

    realized_pnl = sum(
        float(
            trade.get(
                "pnl",
                0,
            )
        )
        for trade
        in closed_trades
    )

    total_pnl = (
        realized_pnl
        + unrealized_pnl
    )

    portfolio["realizedPnL"] = (
        realized_pnl
    )

    portfolio["unrealizedPnL"] = (
        unrealized_pnl
    )

    portfolio["totalInvested"] = (
        total_invested
    )

    portfolio["totalCurrentValue"] = (
        total_current_value
    )

    portfolio["totalPnL"] = (
        total_pnl
    )

    portfolio["totalPnLPercent"] = (
        total_pnl
        / total_invested
        * 100
        if total_invested
        else 0
    )

    portfolio["openPositionsCount"] = (
        len(open_positions)
    )

    portfolio["totalTrades"] = (
        len(closed_trades)
    )

    portfolio["winningTrades"] = sum(
        1
        for trade in closed_trades
        if float(
            trade.get("pnl", 0)
        ) > 0
    )

    portfolio["losingTrades"] = sum(
        1
        for trade in closed_trades
        if float(
            trade.get("pnl", 0)
        ) < 0
    )

    portfolio["updatedAt"] = (
        scanned_at
    )

    portfolio["version"] = 3

    return portfolio


# ============================================================
# PROCESS STOCK
# ============================================================

def process_stock(
    symbol,
    df,
):

    """
    FINAL 44 SMA STRATEGY

    BUY:

    1. 44 SMA rising vs 10 trading days ago
    2. Low can be up to 1% above 44 SMA
    3. Close above 44 SMA
    4. 44 SMA above 100 SMA
    5. 100 SMA above 200 SMA
    6. Green candle

    SELL SIGNAL (scanner-wide):

    1. Close below 44 SMA

    PORTFOLIO EXIT (already-held stocks only):

    1. Basic Stop Loss = -5% from Buy Price
    2. Target = +20% from Buy Price
    3. Trailing Stop Loss = Close below 44 SMA

    Any one of these three conditions can close an existing
    position. Execution remains SAME_DAY_CLOSE.
    """

    if df is None or df.empty:
        return None

    try:

        df = df.copy()

        if isinstance(
            df.columns,
            pd.MultiIndex,
        ):

            df.columns = [
                column[0]
                if isinstance(
                    column,
                    tuple,
                )
                else column
                for column
                in df.columns
            ]

        required_columns = [
            "Open",
            "High",
            "Low",
            "Close",
        ]

        for column in required_columns:

            if column not in df.columns:
                return None

            df[column] = pd.to_numeric(
                df[column],
                errors="coerce",
            )

        df = df.dropna(
            subset=required_columns
        )

        if len(df) < 210:
            return None

        # ====================================================
        # SMA
        # ====================================================

        df["SMA44"] = (
            df["Close"]
            .rolling(44)
            .mean()
        )

        df["SMA100"] = (
            df["Close"]
            .rolling(100)
            .mean()
        )

        df["SMA200"] = (
            df["Close"]
            .rolling(200)
            .mean()
        )

        df = df.dropna(
            subset=[
                "SMA44",
                "SMA100",
                "SMA200",
            ]
        )

        if len(df) < 11:
            return None

        latest = df.iloc[-1]

        sma44 = float(
            latest["SMA44"]
        )

        sma100 = float(
            latest["SMA100"]
        )

        sma200 = float(
            latest["SMA200"]
        )

        sma44_10d = float(
            df["SMA44"].iloc[-11]
        )

        open_price = float(
            latest["Open"]
        )

        high_price = float(
            latest["High"]
        )

        low_price = float(
            latest["Low"]
        )

        close_price = float(
            latest["Close"]
        )

        current_date = (
            pd.to_datetime(
                df.index[-1]
            ).strftime(
                "%Y-%m-%d"
            )
        )

        # ====================================================
        # BUY DISTANCE
        # ====================================================

        buy_distance_from_44 = (
            (
                low_price
                / sma44
            )
            - 1
        ) * 100

        # ====================================================
        # BUY
        # ====================================================

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
                close_price > open_price,
        }

        buy = all(
            buy_checks.values()
        )

        # ====================================================
        # SELL
        # ====================================================

        # Scanner-wide SELL signal is the 44 SMA trailing-stop
        # condition. The -5% stop loss and +20% target are
        # portfolio-only exits for stocks already held.
        sell_checks = {

            "Close below 44 SMA":
                close_price < sma44,
        }

        sell = all(
            sell_checks.values()
        )

        ticker = (
            f"{symbol}.NS"
        )

        # ====================================================
        # DASHBOARD-COMPATIBLE RESULT
        # ====================================================

        result = {

            "symbol":
                symbol,

            "ticker":
                ticker,

            "date":
                current_date,

            "Open":
                open_price,

            "High":
                high_price,

            "Low":
                low_price,

            "Close":
                close_price,

            # lowercase fields required by dashboard
            "sma44":
                sma44,

            "sma100":
                sma100,

            "sma200":
                sma200,

            "sma44_10d":
                sma44_10d,

            "distanceFrom44":
                buy_distance_from_44,

            "buyDistanceFrom44":
                buy_distance_from_44,

            "signal":
                "BUY"
                if buy
                else (
                    "SELL"
                    if sell
                    else ""
                ),

            "buy":
                buy,

            "sell":
                sell,

            "buyChecks":
                buy_checks,

            "sellChecks":
                sell_checks,
        }

        return result

    except Exception as error:

        print(
            f"Process error for "
            f"{symbol}: {error}"
        )

        return None


# ============================================================
# MAIN
# ============================================================

def main():

    scanned_at = (
        datetime.now(
            timezone.utc
        ).isoformat()
    )

    print("=" * 70)
    print("44 SMA SCANNER PRO")
    print("SAME-DAY CLOSE | -5% SL | +20% TARGET | 44 SMA TRAILING EXIT")
    print("=" * 70)

    print(
        f"Scan started: {scanned_at}"
    )

    # ========================================================
    # UNIVERSE
    # ========================================================

    symbols = get_nifty500()

    if not symbols:

        print(
            "No NIFTY 500 symbols available."
        )

        return

    print(
        f"Total symbols: {len(symbols)}"
    )

    # ========================================================
    # PORTFOLIO
    # ========================================================

    portfolio = load_portfolio()

    # ========================================================
    # SCAN
    # ========================================================

    all_results = []

    buys = []

    sells = []

    skipped = []

    batch_size = 50

    for start in range(
        0,
        len(symbols),
        batch_size,
    ):

        batch_symbols = symbols[
            start:
            start + batch_size
        ]

        print(
            f"\nScanning batch "
            f"{start + 1}-"
            f"{min(start + batch_size, len(symbols))}"
            f" / {len(symbols)}"
        )

        data = download_batch(
            batch_symbols
        )

        if (
            data is None
            or data.empty
        ):

            print(
                "Batch returned no data."
            )

            for symbol in batch_symbols:

                skipped.append(
                    {
                        "symbol":
                            symbol,

                        "reason":
                            "No market data",
                    }
                )

            continue

        for symbol in batch_symbols:

            ticker = (
                f"{symbol}.NS"
            )

            try:

                # =================================================
                # EXTRACT TICKER DATA
                # =================================================

                if isinstance(
                    data.columns,
                    pd.MultiIndex,
                ):

                    level_zero = (
                        data.columns
                        .get_level_values(0)
                    )

                    if (
                        ticker
                        not in level_zero
                    ):

                        skipped.append(
                            {
                                "symbol":
                                    symbol,

                                "reason":
                                    "Ticker data missing",
                            }
                        )

                        continue

                    stock_df = data[
                        ticker
                    ].copy()

                else:

                    stock_df = (
                        data.copy()
                    )

                if stock_df.empty:

                    skipped.append(
                        {
                            "symbol":
                                symbol,

                            "reason":
                                "Empty dataframe",
                        }
                    )

                    continue

                # =================================================
                # CHART
                # =================================================

                save_chart_data(
                    symbol,
                    stock_df,
                )

                # =================================================
                # STRATEGY
                # =================================================

                result = process_stock(
                    symbol,
                    stock_df,
                )

                if result is None:

                    skipped.append(
                        {
                            "symbol":
                                symbol,

                            "reason":
                                "Insufficient/invalid data",
                        }
                    )

                    continue

                all_results.append(
                    result
                )

                if result["buy"]:

                    buys.append(
                        result
                    )

                if result["sell"]:

                    sells.append(
                        result
                    )

            except Exception as error:

                skipped.append(
                    {
                        "symbol":
                            symbol,

                        "reason":
                            str(error),
                    }
                )

    # ========================================================
    # SIGNAL DATE
    # ========================================================

    signal_date = None

    if all_results:

        dates = [
            item.get("date")
            for item
            in all_results
            if item.get("date")
        ]

        if dates:

            signal_date = max(
                dates
            )

    # ========================================================
    # SIGNALS
    # ========================================================

    signals = {

        "scannedAt":
            scanned_at,

        "signalDate":
            signal_date,

        "universe":
            "NIFTY 500",

        "universeCount":
            len(symbols),

        "scanned":
            len(all_results),

        "skipped":
            len(skipped),

        "buyCount":
            len(buys),

        "sellCount":
            len(sells),

        # Dashboard uses these
        "buy":
            buys,

        "sell":
            sells,

        # Keep compatibility with old scanner naming
        "buys":
            buys,

        "sells":
            sells,

        "portfolioExecution":
            "SAME_DAY_CLOSE",

        "portfolioExitStrategy": {
            "stopLossPercent": -5,
            "targetPercent": 20,
            "trailingStop":
                "CLOSE_BELOW_44_SMA",
        },
    }

    with open(
        DATA / "signals.json",
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            signals,
            file,
            indent=2,
            ensure_ascii=False,
        )

    # ========================================================
    # HISTORY
    # ========================================================

    history_file = (
        DATA / "history.json"
    )

    history = []

    if history_file.exists():

        try:

            with open(
                history_file,
                "r",
                encoding="utf-8",
            ) as file:

                old_history = json.load(
                    file
                )

            if isinstance(
                old_history,
                list,
            ):

                history = old_history

        except Exception:

            history = []

    # --------------------------------------------------------
    # Current dashboard history needs flat stock records.
    # Store today's BUY + SELL records.
    # --------------------------------------------------------

    today_history = []

    for item in buys:

        history_item = dict(
            item
        )

        history_item[
            "signal"
        ] = "BUY"

        today_history.append(
            history_item
        )

    for item in sells:

        history_item = dict(
            item
        )

        history_item[
            "signal"
        ] = "SELL"

        today_history.append(
            history_item
        )

    # Remove today's old flat records
    # and today's old summary-style record.

    cleaned_history = []

    for entry in history:

        entry_date = (
            entry.get("date")
            if isinstance(
                entry,
                dict,
            )
            else None
        )

        if (
            normalize_date(
                entry_date
            )
            == normalize_date(
                signal_date
            )
        ):

            continue

        cleaned_history.append(
            entry
        )

    history = (
        today_history
        + cleaned_history
    )

    with open(
        history_file,
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            history,
            file,
            indent=2,
            ensure_ascii=False,
        )

    # ========================================================
    # PORTFOLIO
    # ========================================================

    portfolio = update_portfolio(
        portfolio=portfolio,
        results=all_results,
        buys=buys,
        sells=sells,
        scanned_at=scanned_at,
    )

    save_portfolio(
        portfolio
    )

    # ========================================================
    # UNIVERSE
    # ========================================================

    universe = {

        "updatedAt":
            scanned_at,

        "count":
            len(symbols),

        "symbols":
            symbols,
    }

    with open(
        DATA / "universe.json",
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            universe,
            file,
            indent=2,
            ensure_ascii=False,
        )

    # ========================================================
    # SKIPPED
    # ========================================================

    skipped_data = {

        "updatedAt":
            scanned_at,

        "count":
            len(skipped),

        "items":
            skipped,
    }

    with open(
        DATA / "skipped.json",
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            skipped_data,
            file,
            indent=2,
            ensure_ascii=False,
        )

    # ========================================================
    # SUMMARY
    # ========================================================

    print("\n" + "=" * 70)
    print("SCAN COMPLETE")
    print("=" * 70)

    print(
        f"Scanned stocks : "
        f"{len(all_results)}"
    )

    print(
        f"BUY signals    : "
        f"{len(buys)}"
    )

    print(
        f"SELL signals   : "
        f"{len(sells)}"
    )

    print(
        f"Skipped        : "
        f"{len(skipped)}"
    )

    print(
        f"Open positions : "
        f"{portfolio.get('openPositionsCount', 0)}"
    )

    print(
        "Execution      : SAME_DAY_CLOSE"
    )

    print(
        f"Realized P&L   : "
        f"₹{portfolio.get('realizedPnL', 0):,.2f}"
    )

    print(
        f"Unrealized P&L : "
        f"₹{portfolio.get('unrealizedPnL', 0):,.2f}"
    )

    print(
        f"Total P&L      : "
        f"₹{portfolio.get('totalPnL', 0):,.2f}"
    )

    print("=" * 70)


if __name__ == "__main__":
    main()
