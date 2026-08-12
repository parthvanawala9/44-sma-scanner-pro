import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests
import yfinance as yf


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)

SYMBOLS_FILE = Path(__file__).resolve().parent / "symbols.csv"

NSE_API = (
    "https://www.nseindia.com/api/equity-stockIndices"
    "?index=NIFTY%20500"
)

NSE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/",
}


# ============================================================
# GET NIFTY 500
# ============================================================

def get_nifty500_symbols():

    session = requests.Session()

    session.headers.update(NSE_HEADERS)

    try:

        print("Connecting to NSE...")

        session.get(
            "https://www.nseindia.com/",
            timeout=20
        )

        response = session.get(
            NSE_API,
            timeout=30
        )

        response.raise_for_status()

        data = response.json()

        rows = data.get("data", [])

        symbols = []

        for row in rows:

            symbol = str(
                row.get("symbol", "")
            ).strip().upper()

            if (
                symbol
                and symbol not in symbols
                and symbol not in [
                    "NIFTY 500",
                    "NIFTY500"
                ]
            ):

                symbols.append(symbol)

        if len(symbols) < 400:

            raise Exception(
                f"NSE returned only {len(symbols)} stocks"
            )

        print(
            f"NSE returned {len(symbols)} stocks"
        )

        return symbols

    except Exception as error:

        print(
            f"NSE download failed: {error}"
        )

        return load_fallback_symbols()


# ============================================================
# FALLBACK CSV
# ============================================================

def load_fallback_symbols():

    print("Using symbols.csv fallback")

    if not SYMBOLS_FILE.exists():

        raise Exception(
            "symbols.csv not found"
        )

    df = pd.read_csv(
        SYMBOLS_FILE
    )

    if "symbol" not in df.columns:

        raise Exception(
            "symbols.csv must contain symbol column"
        )

    symbols = []

    for value in df["symbol"].dropna():

        symbol = str(
            value
        ).strip().upper()

        if (
            symbol
            and symbol not in symbols
        ):

            symbols.append(symbol)

    print(
        f"Fallback contains {len(symbols)} stocks"
    )

    return symbols


# ============================================================
# DOWNLOAD DATA IN BATCHES
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
    print(
        f"Downloading batch "
        f"{batch_number}/{total_batches}"
    )

    print(
        f"Stocks in batch: {len(tickers)}"
    )

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
            f"Batch download failed: {error}"
        )

        return None


# ============================================================
# PROCESS ONE STOCK
# ============================================================

def process_stock(
    symbol,
    batch_data
):

    ticker = f"{symbol}.NS"

    try:

        if batch_data is None:
            return None

        # ----------------------------------------------------
        # Get this stock's dataframe
        # ----------------------------------------------------

        if isinstance(
            batch_data.columns,
            pd.MultiIndex
        ):

            if ticker not in batch_data.columns.levels[0]:

                return None

            df = batch_data[ticker].copy()

        else:

            df = batch_data.copy()

        required = [
            "Open",
            "High",
            "Low",
            "Close"
        ]

        for column in required:

            if column not in df.columns:

                return None

        df = df.dropna(
            subset=required
        ).copy()

        if len(df) < 210:

            return None

        # ----------------------------------------------------
        # SMA
        # ----------------------------------------------------

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

            if pd.isna(
                row[column]
            ):

                return None

        # ----------------------------------------------------
        # VALUES
        # ----------------------------------------------------

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

        # ----------------------------------------------------
        # DISTANCE FROM 44 SMA
        # ----------------------------------------------------

        distance_from_44 = (
            (
                close_price
                / sma44
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
            f"{symbol} processing error: "
            f"{error}"
        )

        return None


# ============================================================
# MAIN SCANNER
# ============================================================

def main():

    print("")
    print("=" * 70)
    print("44 SMA SCANNER PRO")
    print("=" * 70)
    print("")

    symbols = get_nifty500_symbols()

    print("")
    print(
        f"TOTAL STOCKS TO SCAN: {len(symbols)}"
    )

    print("")

    # --------------------------------------------------------
    # Batch size
    # --------------------------------------------------------

    batch_size = 75

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

    # --------------------------------------------------------
    # DOWNLOAD + PROCESS
    # --------------------------------------------------------

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
            "NSE NIFTY 500",

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

    # --------------------------------------------------------
    # signals.json
    # --------------------------------------------------------

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

    # --------------------------------------------------------
    # Add every BUY and SELL
    # --------------------------------------------------------

    for item in (
        buys + sells
    ):

        history.insert(
            0,
            {
                "scannedAt":
                    scanned_at,

                "universe":
                    "NSE NIFTY 500",

                **item
            }
        )

    # Keep last 10,000 signals

    history = history[:10000]

    history_file.write_text(

        json.dumps(
            history,
            indent=2
        ),

        encoding="utf-8"
    )

    # ========================================================
    # UNIVERSE
    # ========================================================

    universe = {

        "updatedAt":
            scanned_at,

        "source":
            "NSE NIFTY 500",

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
        f"Universe       : {len(symbols)}"
    )

    print(
        f"Successfully scanned : {len(results)}"
    )

    print(
        f"Skipped        : {len(skipped)}"
    )

    print(
        f"BUY signals    : {len(buys)}"
    )

    print(
        f"SELL signals   : {len(sells)}"
    )

    print("=" * 70)
    print("")


if __name__ == "__main__":

    main()
