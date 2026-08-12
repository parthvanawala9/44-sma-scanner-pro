import json
from datetime import datetime, timezone
from pathlib import Path
from io import StringIO

import pandas as pd
import requests
import yfinance as yf


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)


# ============================================================
# OFFICIAL NSE NIFTY 500 LIST
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
# GET OFFICIAL NIFTY 500
# ============================================================

def get_nifty500_symbols():

    print("")
    print("=" * 70)
    print("DOWNLOADING OFFICIAL NSE NIFTY 500 LIST")
    print("=" * 70)

    session = requests.Session()
    session.headers.update(HEADERS)

    try:

        # Open NSE first to establish session/cookies.
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
                "Official NSE CSV does not contain "
                "Symbol column"
            )

        symbols = []

        for value in df["Symbol"].dropna():

            symbol = str(
                value
            ).strip().upper()

            # Clean accidental formatting.
            symbol = symbol.replace(
                ".NS",
                ""
            )

            symbol = symbol.lstrip(
                "$"
            )

            symbol = symbol.strip()

            if not symbol:
                continue

            if symbol in [
                "NIFTY 500",
                "NIFTY500",
                "SYMBOL"
            ]:
                continue

            if symbol not in symbols:

                symbols.append(symbol)

        # Safety check.
        if len(symbols) < 450:

            raise Exception(
                f"NSE returned only "
                f"{len(symbols)} symbols"
            )

        print("")
        print(
            f"SUCCESS: {len(symbols)} "
            "NIFTY 500 stocks loaded"
        )

        print("")
        print(
            "First 10 symbols:"
        )

        print(
            symbols[:10]
        )

        print("")
        print(
            "Last 10 symbols:"
        )

        print(
            symbols[-10:]
        )

        return symbols

    except Exception as error:

        print("")
        print(
            "NSE NIFTY 500 DOWNLOAD FAILED"
        )

        print(
            str(error)
        )

        print("")

        raise Exception(
            "Could not load the official "
            "NIFTY 500 list. Scanner stopped."
        )


# ============================================================
# DOWNLOAD MARKET DATA
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
        f"DOWNLOADING BATCH "
        f"{batch_number}/{total_batches}"
    )

    print(
        f"Stocks in batch: {len(tickers)}"
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

        print(
            "Batch download error:"
        )

        print(
            str(error)
        )

        return None


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

        # Need enough history for 200 SMA
        # plus the 10-day comparison.
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

            if pd.isna(row[column]):
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

        buy_checks = {

            "44 SMA rising":
                sma44 > sma44_10d,

            "Low touches 44 SMA":
                low_price <= sma44,

            "Close above 44 SMA":
                close_price > sma44,

            "44 SMA above 100 SMA":
                sma44 > sma100,

            "100 SMA above 200 SMA":
                sma100 > sma200
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
                close_price < sma44
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
    print("=" * 70)
    print("")

    # ========================================================
    # LOAD OFFICIAL NIFTY 500
    # ========================================================

    symbols = get_nifty500_symbols()

    print("")
    print(
        f"TOTAL UNIVERSE: {len(symbols)}"
    )

    # ========================================================
    # BATCH SIZE
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
    # SCAN ALL BATCHES
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
    # SIGNALS
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

    signals = {

        "scannedAt":
            scanned_at,

        "strategy":
            "44 SMA Support / Breakdown",

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
        DATA / "signals.json"
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

    # Add every BUY and SELL
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

    # Keep last 10,000 records.
    history = history[:10000]

    history_file.write_text(

        json.dumps(
            history,
            indent=2
        ),

        encoding="utf-8"
    )

    # ========================================================
    # UNIVERSE FILE
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
        DATA / "universe.json"
    ).write_text(

        json.dumps(
            universe,
            indent=2
        ),

        encoding="utf-8"
    )

    # ========================================================
    # SKIPPED FILE
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
        DATA / "skipped.json"
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

    print("")
    print("=" * 70)
    print("44 SMA SCANNER COMPLETE")
    print("=" * 70)

    print(
        f"Universe              : {len(symbols)}"
    )

    print(
        f"Successfully scanned  : {len(results)}"
    )

    print(
        f"Skipped               : {len(skipped)}"
    )

    print(
        f"BUY signals           : {len(buys)}"
    )

    print(
        f"SELL signals          : {len(sells)}"
    )

    print("=" * 70)
    print("")


if __name__ == "__main__":
    main()
