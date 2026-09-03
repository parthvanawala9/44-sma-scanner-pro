import json
import math
from datetime import datetime, timezone
from pathlib import Path
from io import StringIO

import pandas as pd
import requests
import yfinance as yf


# ============================================================
# CONFIG
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
    """
    Download the current official NIFTY 500 constituent list from NSE.
    """

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

        df = pd.read_csv(StringIO(response.text))

        if "Symbol" not in df.columns:
            raise ValueError("NSE NIFTY 500 CSV does not contain Symbol column.")

        symbols = (
            df["Symbol"]
            .dropna()
            .astype(str)
            .str.strip()
            .str.upper()
            .tolist()
        )

        symbols = list(dict.fromkeys(symbols))

        print(f"NIFTY 500 symbols loaded: {len(symbols)}")

        return symbols

    except Exception as e:
        print(f"Failed to download NIFTY 500 list: {e}")

        fallback_file = DATA / "universe.json"

        if fallback_file.exists():
            try:
                with open(fallback_file, "r", encoding="utf-8") as f:
                    old = json.load(f)

                if isinstance(old, list):
                    return old

                if isinstance(old, dict) and "symbols" in old:
                    return old["symbols"]

            except Exception:
                pass

        return []


# ============================================================
# YFINANCE DOWNLOAD
# ============================================================

def download_batch(symbols):
    """
    Download approximately 18 months of daily OHLC data.
    """

    tickers = [f"{symbol}.NS" for symbol in symbols]

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

    except Exception as e:
        print(f"Batch download error: {e}")
        return pd.DataFrame()


# ============================================================
# CHART DATA
# ============================================================

def save_chart_data(symbol, df):
    """
    Save the daily data required by the dashboard charts.
    """

    try:
        if df is None or df.empty:
            return

        chart_df = df.copy()

        chart_df = chart_df.reset_index()

        if "Date" in chart_df.columns:
            chart_df["Date"] = pd.to_datetime(
                chart_df["Date"]
            ).dt.strftime("%Y-%m-%d")

        output = []

        for _, row in chart_df.iterrows():
            try:
                close = float(row["Close"])
                open_price = float(row["Open"])
                high = float(row["High"])
                low = float(row["Low"])

                output.append(
                    {
                        "date": row["Date"],
                        "open": open_price,
                        "high": high,
                        "low": low,
                        "close": close,
                    }
                )

            except Exception:
                continue

        if not output:
            return

        file_path = CHARTS / f"{symbol}.json"

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(output, f, separators=(",", ":"))

    except Exception as e:
        print(f"Chart save error for {symbol}: {e}")


# ============================================================
# PORTFOLIO
# ============================================================

def empty_portfolio():
    return {
        "version": 2,
        "allocationPerStock": PORTFOLIO_ALLOCATION,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "updatedAt": None,

        "openPositions": [],
        "closedTrades": [],

        "pendingOrders": [],

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
        with open(file_path, "r", encoding="utf-8") as f:
            portfolio = json.load(f)

        if not isinstance(portfolio, dict):
            return empty_portfolio()

        defaults = empty_portfolio()

        for key, value in defaults.items():
            if key not in portfolio:
                portfolio[key] = value

        return portfolio

    except Exception as e:
        print(f"Portfolio load error: {e}")
        return empty_portfolio()


def save_portfolio(portfolio):
    file_path = DATA / "portfolio.json"

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(
            portfolio,
            f,
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
        return pd.to_datetime(value).strftime("%Y-%m-%d")
    except Exception:
        return str(value)[:10]


def find_position(portfolio, symbol):
    for position in portfolio.get("openPositions", []):
        if position.get("symbol") == symbol:
            return position

    return None


def has_pending_order(portfolio, symbol, signal, signal_date):
    signal_date = normalize_date(signal_date)

    for order in portfolio.get("pendingOrders", []):
        if (
            order.get("symbol") == symbol
            and order.get("signal") == signal
            and normalize_date(order.get("signalDate")) == signal_date
            and order.get("status") == "PENDING"
        ):
            return True

    return False


def add_pending_order(
    portfolio,
    symbol,
    ticker,
    signal,
    signal_date,
    signal_timestamp,
):
    """
    Store today's signal so it can execute at the next trading
    day's OPEN.
    """

    signal_date = normalize_date(signal_date)

    if has_pending_order(
        portfolio,
        symbol,
        signal,
        signal_date,
    ):
        return

    portfolio.setdefault("pendingOrders", []).append(
        {
            "symbol": symbol,
            "ticker": ticker,
            "signal": signal,
            "signalDate": signal_date,
            "signalTimestamp": signal_timestamp,
            "status": "PENDING",
            "execution": "NEXT_TRADING_DAY_OPEN",
        }
    )


# ============================================================
# EXECUTE PENDING ORDERS
# ============================================================

def execute_pending_orders(
    portfolio,
    results,
    scanned_at,
):
    """
    Execute pending signals from previous scan(s).

    IMPORTANT:
    - Pending BUY executes at current day's OPEN.
    - Pending SELL executes at current day's OPEN.
    - Current result date MUST be later than signalDate.
    - If current day's data is not available yet, order remains pending.
    """

    if not portfolio.get("pendingOrders"):
        return

    result_map = {}

    for item in results:
        symbol = item.get("symbol")

        if symbol:
            result_map[symbol] = item

    remaining_orders = []

    for order in portfolio.get("pendingOrders", []):
        symbol = order.get("symbol")
        signal = order.get("signal")

        item = result_map.get(symbol)

        # ----------------------------------------------------
        # No current market data
        # ----------------------------------------------------

        if not item:
            remaining_orders.append(order)
            continue

        current_date = normalize_date(item.get("date"))
        signal_date = normalize_date(order.get("signalDate"))

        if not current_date or not signal_date:
            remaining_orders.append(order)
            continue

        # ----------------------------------------------------
        # Never execute on the same day as signal.
        # ----------------------------------------------------

        if current_date <= signal_date:
            remaining_orders.append(order)
            continue

        open_price = item.get("Open")

        if open_price is None:
            remaining_orders.append(order)
            continue

        try:
            execution_price = float(open_price)

        except Exception:
            remaining_orders.append(order)
            continue

        if not math.isfinite(execution_price) or execution_price <= 0:
            remaining_orders.append(order)
            continue

        # ====================================================
        # BUY
        # ====================================================

        if signal == "BUY":

            # Already holding this stock.
            # Do not create another position.
            existing_position = find_position(
                portfolio,
                symbol,
            )

            if existing_position:
                continue

            quantity = math.floor(
                PORTFOLIO_ALLOCATION / execution_price
            )

            if quantity <= 0:
                # Cannot buy even one share.
                # Keep it pending for the next available day.
                remaining_orders.append(order)
                continue

            invested = quantity * execution_price

            position = {
                "symbol": symbol,
                "ticker": order.get(
                    "ticker",
                    item.get("ticker"),
                ),

                # Signal information
                "signalDate": signal_date,
                "signalTimestamp": order.get(
                    "signalTimestamp"
                ),

                # Actual execution
                "buyDate": current_date,
                "buyTimestamp": order.get(
                    "signalTimestamp"
                ),
                "buyExecutionTimestamp": scanned_at,
                "buyPrice": execution_price,
                "quantity": quantity,
                "invested": invested,

                # Current valuation
                "currentPrice": float(item.get("Close", execution_price)),
                "currentValue": quantity
                * float(item.get("Close", execution_price)),

                "unrealizedPnL": (
                    quantity
                    * float(item.get("Close", execution_price))
                    - invested
                ),

                "unrealizedPnLPercent": (
                    (
                        quantity
                        * float(item.get("Close", execution_price))
                        - invested
                    )
                    / invested
                    * 100
                )
                if invested
                else 0,

                "execution": "NEXT_TRADING_DAY_OPEN",
            }

            portfolio.setdefault(
                "openPositions",
                [],
            ).append(position)

            print(
                f"PORTFOLIO BUY EXECUTED: "
                f"{symbol} | "
                f"Signal {signal_date} | "
                f"Buy {current_date} OPEN "
                f"{execution_price:.2f} | "
                f"Qty {quantity}"
            )

            continue

        # ====================================================
        # SELL
        # ====================================================

        if signal == "SELL":

            position = find_position(
                portfolio,
                symbol,
            )

            if not position:
                # Nothing to sell anymore.
                continue

            quantity = int(
                position.get("quantity", 0)
            )

            buy_price = float(
                position.get("buyPrice", 0)
            )

            if quantity <= 0 or buy_price <= 0:
                continue

            sell_price = execution_price

            invested = quantity * buy_price
            sale_value = quantity * sell_price
            pnl = sale_value - invested

            pnl_percent = (
                (pnl / invested) * 100
                if invested
                else 0
            )

            closed_trade = {
                "symbol": symbol,
                "ticker": position.get(
                    "ticker",
                    order.get("ticker"),
                ),

                # Original BUY information
                "signalDate": position.get(
                    "signalDate"
                ),
                "buySignalDate": position.get(
                    "signalDate"
                ),
                "buyTimestamp": position.get(
                    "buyTimestamp"
                ),
                "buyExecutionTimestamp": position.get(
                    "buyExecutionTimestamp"
                ),
                "buyDate": position.get(
                    "buyDate"
                ),
                "buyPrice": buy_price,

                # SELL signal information
                "sellSignalDate": signal_date,
                "sellSignalTimestamp": order.get(
                    "signalTimestamp"
                ),

                # Actual SELL execution
                "sellDate": current_date,
                "sellTimestamp": scanned_at,
                "sellPrice": sell_price,

                "quantity": quantity,
                "invested": invested,
                "saleValue": sale_value,

                "pnl": pnl,
                "pnlPercent": pnl_percent,

                "execution": "NEXT_TRADING_DAY_OPEN",
            }

            portfolio.setdefault(
                "closedTrades",
                [],
            ).append(closed_trade)

            portfolio["realizedPnL"] = sum(
                float(trade.get("pnl", 0))
                for trade in portfolio.get(
                    "closedTrades",
                    [],
                )
            )

            portfolio["openPositions"] = [
                p
                for p in portfolio.get(
                    "openPositions",
                    [],
                )
                if p.get("symbol") != symbol
            ]

            print(
                f"PORTFOLIO SELL EXECUTED: "
                f"{symbol} | "
                f"Signal {signal_date} | "
                f"Sell {current_date} OPEN "
                f"{sell_price:.2f} | "
                f"Qty {quantity} | "
                f"PnL {pnl:.2f}"
            )

            continue

        # Unknown signal
        remaining_orders.append(order)

    portfolio["pendingOrders"] = remaining_orders


# ============================================================
# UPDATE PORTFOLIO
# ============================================================

def update_portfolio(
    portfolio,
    results,
    buys,
    sells,
    scanned_at,
):
    """
    Portfolio lifecycle:

    1. Execute OLD pending orders at today's OPEN.
    2. Update current values using today's CLOSE.
    3. Store TODAY's new signals as pending orders.
    4. Recalculate portfolio totals.

    This means:
        Day 1 4 PM -> signal
        Day 2 OPEN -> portfolio execution
    """

    # ========================================================
    # 1. EXECUTE PREVIOUS PENDING ORDERS FIRST
    # ========================================================

    execute_pending_orders(
        portfolio,
        results,
        scanned_at,
    )

    # ========================================================
    # 2. UPDATE OPEN POSITION MARKET VALUES
    # ========================================================

    result_map = {
        item.get("symbol"): item
        for item in results
        if item.get("symbol")
    }

    for position in portfolio.get(
        "openPositions",
        [],
    ):
        symbol = position.get("symbol")

        item = result_map.get(symbol)

        if not item:
            continue

        close_price = item.get("Close")

        try:
            close_price = float(close_price)
        except Exception:
            continue

        if not math.isfinite(close_price):
            continue

        quantity = int(
            position.get("quantity", 0)
        )

        invested = float(
            position.get("invested", 0)
        )

        current_value = quantity * close_price

        unrealized_pnl = current_value - invested

        position["currentPrice"] = close_price
        position["currentValue"] = current_value
        position["unrealizedPnL"] = unrealized_pnl

        position["unrealizedPnLPercent"] = (
            unrealized_pnl / invested * 100
            if invested
            else 0
        )

    # ========================================================
    # 3. STORE TODAY'S BUY SIGNALS AS PENDING
    # ========================================================

    for item in buys:

        symbol = item.get("symbol")

        if not symbol:
            continue

        # Don't queue BUY if already holding.
        if find_position(
            portfolio,
            symbol,
        ):
            continue

        add_pending_order(
            portfolio=portfolio,
            symbol=symbol,
            ticker=item.get(
                "ticker",
                f"{symbol}.NS",
            ),
            signal="BUY",
            signal_date=item.get("date"),
            signal_timestamp=scanned_at,
        )

    # ========================================================
    # 4. STORE TODAY'S SELL SIGNALS AS PENDING
    # ========================================================

    for item in sells:

        symbol = item.get("symbol")

        if not symbol:
            continue

        # Only queue SELL if currently holding.
        if not find_position(
            portfolio,
            symbol,
        ):
            continue

        add_pending_order(
            portfolio=portfolio,
            symbol=symbol,
            ticker=item.get(
                "ticker",
                f"{symbol}.NS",
            ),
            signal="SELL",
            signal_date=item.get("date"),
            signal_timestamp=scanned_at,
        )

    # ========================================================
    # 5. RECALCULATE TOTALS
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
        float(position.get("invested", 0))
        for position in open_positions
    )

    total_current_value = sum(
        float(position.get("currentValue", 0))
        for position in open_positions
    )

    unrealized_pnl = (
        total_current_value
        - total_invested
    )

    realized_pnl = sum(
        float(trade.get("pnl", 0))
        for trade in closed_trades
    )

    total_pnl = (
        realized_pnl
        + unrealized_pnl
    )

    portfolio["realizedPnL"] = realized_pnl
    portfolio["unrealizedPnL"] = unrealized_pnl
    portfolio["totalInvested"] = total_invested
    portfolio["totalCurrentValue"] = total_current_value
    portfolio["totalPnL"] = total_pnl

    # Keep the same useful denominator for open portfolio return.
    portfolio["totalPnLPercent"] = (
        total_pnl / total_invested * 100
        if total_invested
        else 0
    )

    portfolio["openPositionsCount"] = len(
        open_positions
    )

    portfolio["totalTrades"] = len(
        closed_trades
    )

    portfolio["winningTrades"] = sum(
        1
        for trade in closed_trades
        if float(trade.get("pnl", 0)) > 0
    )

    portfolio["losingTrades"] = sum(
        1
        for trade in closed_trades
        if float(trade.get("pnl", 0)) < 0
    )

    portfolio["updatedAt"] = scanned_at

    return portfolio


# ============================================================
# PROCESS STOCK
# ============================================================

def process_stock(symbol, df):
    """
    Apply the final 44 SMA strategy.

    BUY:
      - 44 SMA rising vs 10 trading days ago
      - Low within 1% above 44 SMA
      - Close above 44 SMA
      - 44 SMA above 100 SMA
      - 100 SMA above 200 SMA
      - Green candle

    SELL:
      - High touches/exceeds 44 SMA
      - Close below 44 SMA
      - Red candle
    """

    if df is None or df.empty:
        return None

    try:
        df = df.copy()

        # Handle MultiIndex if returned by yfinance.
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [
                column[0]
                if isinstance(column, tuple)
                else column
                for column in df.columns
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

        # ----------------------------------------------------
        # SMA calculations
        # ----------------------------------------------------

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

        sma44_10d = float(
            df["SMA44"].iloc[-11]
        )

        sma44 = float(
            latest["SMA44"]
        )

        sma100 = float(
            latest["SMA100"]
        )

        sma200 = float(
            latest["SMA200"]
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

        # ----------------------------------------------------
        # Date
        # ----------------------------------------------------

        current_date = pd.to_datetime(
            df.index[-1]
        ).strftime("%Y-%m-%d")

        # ----------------------------------------------------
        # BUY distance
        # ----------------------------------------------------

        buy_distance_from_44 = (
            (low_price / sma44) - 1
        ) * 100

        # ====================================================
        # BUY STRATEGY
        # ====================================================

        buy_checks = {
            "44 SMA rising": (
                sma44 > sma44_10d
            ),

            "Low within 1% of 44 SMA": (
                buy_distance_from_44 <= 1.0
            ),

            "Close above 44 SMA": (
                close_price > sma44
            ),

            "44 SMA above 100 SMA": (
                sma44 > sma100
            ),

            "100 SMA above 200 SMA": (
                sma100 > sma200
            ),

            "Green candle": (
                close_price > open_price
            ),
        }

        buy = all(
            buy_checks.values()
        )

        # ====================================================
        # SELL STRATEGY
        # ====================================================

        sell_checks = {
            "High touches 44 SMA": (
                high_price >= sma44
            ),

            "Close below 44 SMA": (
                close_price < sma44
            ),

            "Red candle": (
                close_price < open_price
            ),
        }

        sell = all(
            sell_checks.values()
        )

        ticker = f"{symbol}.NS"

        result = {
            "symbol": symbol,
            "ticker": ticker,

            "date": current_date,

            "Open": open_price,
            "High": high_price,
            "Low": low_price,
            "Close": close_price,

            "SMA44": sma44,
            "SMA100": sma100,
            "SMA200": sma200,

            "SMA44_10d": sma44_10d,

            "buyDistanceFrom44": buy_distance_from_44,

            "buy": buy,
            "sell": sell,

            "buyChecks": buy_checks,
            "sellChecks": sell_checks,
        }

        return result

    except Exception as e:
        print(
            f"Process error for {symbol}: {e}"
        )
        return None


# ============================================================
# MAIN
# ============================================================

def main():

    scanned_at = datetime.now(
        timezone.utc
    ).isoformat()

    print("=" * 70)
    print("44 SMA SCANNER PRO")
    print("=" * 70)
    print(
        f"Scan started: {scanned_at}"
    )

    # --------------------------------------------------------
    # NIFTY 500
    # --------------------------------------------------------

    symbols = get_nifty500()

    if not symbols:
        print(
            "No NIFTY 500 symbols available."
        )
        return

    print(
        f"Total symbols: {len(symbols)}"
    )

    # --------------------------------------------------------
    # Portfolio
    # --------------------------------------------------------

    portfolio = load_portfolio()

    # --------------------------------------------------------
    # Scan
    # --------------------------------------------------------

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
            start:start + batch_size
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

        if data is None or data.empty:
            print(
                "Batch returned no data."
            )

            for symbol in batch_symbols:
                skipped.append(
                    {
                        "symbol": symbol,
                        "reason": "No market data",
                    }
                )

            continue

        for symbol in batch_symbols:

            ticker = f"{symbol}.NS"

            try:

                # ------------------------------------------------
                # Extract ticker dataframe
                # ------------------------------------------------

                if isinstance(
                    data.columns,
                    pd.MultiIndex,
                ):

                    if ticker not in data.columns.get_level_values(0):
                        skipped.append(
                            {
                                "symbol": symbol,
                                "reason": "Ticker data missing",
                            }
                        )
                        continue

                    stock_df = data[
                        ticker
                    ].copy()

                else:

                    stock_df = data.copy()

                if stock_df.empty:
                    skipped.append(
                        {
                            "symbol": symbol,
                            "reason": "Empty dataframe",
                        }
                    )
                    continue

                # ------------------------------------------------
                # Save chart data
                # ------------------------------------------------

                save_chart_data(
                    symbol,
                    stock_df,
                )

                # ------------------------------------------------
                # Strategy
                # ------------------------------------------------

                result = process_stock(
                    symbol,
                    stock_df,
                )

                if result is None:
                    skipped.append(
                        {
                            "symbol": symbol,
                            "reason": "Insufficient/invalid data",
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

            except Exception as e:

                skipped.append(
                    {
                        "symbol": symbol,
                        "reason": str(e),
                    }
                )

    # ========================================================
    # SAVE SIGNALS
    # ========================================================

    signal_date = None

    if all_results:
        dates = [
            item.get("date")
            for item in all_results
            if item.get("date")
        ]

        if dates:
            signal_date = max(dates)

    signals = {
        "scannedAt": scanned_at,
        "signalDate": signal_date,

        "buyCount": len(buys),
        "sellCount": len(sells),

        "buys": buys,
        "sells": sells,

        "portfolioExecution": (
            "NEXT_TRADING_DAY_OPEN"
        ),
    }

    with open(
        DATA / "signals.json",
        "w",
        encoding="utf-8",
    ) as f:

        json.dump(
            signals,
            f,
            indent=2,
            ensure_ascii=False,
        )

    # ========================================================
    # HISTORY
    # ========================================================

    history_file = DATA / "history.json"

    history = []

    if history_file.exists():
        try:
            with open(
                history_file,
                "r",
                encoding="utf-8",
            ) as f:
                history = json.load(f)

            if not isinstance(
                history,
                list,
            ):
                history = []

        except Exception:
            history = []

    history_entry = {
        "scannedAt": scanned_at,
        "date": signal_date,

        "buyCount": len(buys),
        "sellCount": len(sells),

        "buys": buys,
        "sells": sells,
    }

    # Prevent duplicate history entries
    # for the same scan date.
    history = [
        entry
        for entry in history
        if entry.get("date") != signal_date
    ]

    history.insert(
        0,
        history_entry,
    )

    with open(
        history_file,
        "w",
        encoding="utf-8",
    ) as f:

        json.dump(
            history,
            f,
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
        "updatedAt": scanned_at,
        "count": len(symbols),
        "symbols": symbols,
    }

    with open(
        DATA / "universe.json",
        "w",
        encoding="utf-8",
    ) as f:

        json.dump(
            universe,
            f,
            indent=2,
            ensure_ascii=False,
        )

    # ========================================================
    # SKIPPED
    # ========================================================

    skipped_data = {
        "updatedAt": scanned_at,
        "count": len(skipped),
        "items": skipped,
    }

    with open(
        DATA / "skipped.json",
        "w",
        encoding="utf-8",
    ) as f:

        json.dump(
            skipped_data,
            f,
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
        f"Scanned stocks : {len(all_results)}"
    )

    print(
        f"BUY signals    : {len(buys)}"
    )

    print(
        f"SELL signals   : {len(sells)}"
    )

    print(
        f"Skipped        : {len(skipped)}"
    )

    print(
        f"Open positions : "
        f"{portfolio.get('openPositionsCount', 0)}"
    )

    print(
        f"Pending orders : "
        f"{len(portfolio.get('pendingOrders', []))}"
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
