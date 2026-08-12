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

NIFTY_500_API = (
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
    "Connection": "keep-alive",
}


def load_fallback_symbols():
    """Load symbols.csv if the live NIFTY 500 list cannot be downloaded."""

    if not SYMBOLS_FILE.exists():
        return []

    df = pd.read_csv(SYMBOLS_FILE)

    if "symbol" not in df.columns:
        raise ValueError(
            "symbols.csv must contain a 'symbol' column"
        )

    symbols = []

    for value in df["symbol"].dropna():

        symbol = str(value).strip().upper()

        if symbol and symbol not in symbols:
            symbols.append(symbol)

    return symbols


def fetch_nifty500_symbols():
    """
    Fetch the current NIFTY 500 constituents from NSE.
    """

    session = requests.Session()
    session.headers.update(NSE_HEADERS)

    try:

        session.get(
            "https://www.nseindia.com/",
            timeout=20,
        )

        response = session.get(
            NIFTY_500_API,
            timeout=30,
        )

        response.raise_for_status()

        payload = response.json()

        rows = payload.get("data", [])

        symbols = []

        for row in rows:

            symbol = str(
                row.get("symbol", "")
            ).strip().upper()

            if (
                symbol
                and symbol not in symbols
                and symbol not in {
                    "NIFTY 500",
                    "NIFTY500",
                }
            ):
                symbols.append(symbol)

        if len(symbols) < 400:

            raise RuntimeError(
                f"NSE returned only {len(symbols)} symbols"
            )

        return symbols

    except Exception as error:

        print(
            f"NSE NIFTY 500 download failed: {error}"
        )

        return []


def get_symbols():

    live_symbols = fetch_nifty500_symbols()

    if live_symbols:

        print(
            f"Using live NSE NIFTY 500 universe: "
            f"{len(live_symbols)} symbols"
        )

        return (
            live_symbols,
            "NSE live NIFTY 500"
        )

    fallback = load_fallback_symbols()

    if not fallback:

        raise RuntimeError(
            "Could not obtain the NIFTY 500 universe "
            "and symbols.csv is empty or missing."
        )

    print(
        f"Using fallback symbols.csv universe: "
        f"{len(fallback)} symbols"
    )

    return (
        fallback,
        "symbols.csv fallback"
    )


def download_stock(symbol):

    ticker = f"{symbol}.NS"

    try:

        df = yf.download(
            ticker,
            period="18mo",
            interval="1d",
            auto_adjust=False,
            progress=False,
            threads=False,
        )

    except Exception as error:

        print(
            f"Download failed for {symbol}: {error}"
        )

        return None

    if df is None or df.empty:
        return None

    if isinstance(
        df.columns,
        pd.MultiIndex
    ):

        df.columns = (
            df.columns
            .get_level_values(0)
        )

    required = [
        "Open",
        "High",
        "Low",
        "Close",
    ]

    for column in required:

        if column not in df.columns:
            return None

    df = df.dropna(
        subset=required
    ).copy()

    if len(df) < 210:
        return None

    return df


def scan_symbol(symbol):

    df = download_stock(symbol)

    if df is None:
        return None

    # ==============================
    # MOVING AVERAGES
    # ==============================

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

    # 44 SMA exactly 10 trading
    # sessions before current candle.

    df["sma44_10d"] = (
        df["sma44"]
        .shift(10)
    )

    row = df.iloc[-1]

    needed = [
        "Open",
        "High",
        "Low",
        "Close",
        "sma44",
        "sma100",
        "sma200",
        "sma44_10d",
    ]

    if any(
        pd.isna(row[column])
        for column in needed
    ):

        return None

    values = {

        "Open": float(row["Open"]),

        "High": float(row["High"]),

        "Low": float(row["Low"]),

        "Close": float(row["Close"]),

        "sma44": float(row["sma44"]),

        "sma100": float(row["sma100"]),

        "sma200": float(row["sma200"]),

        "sma44_10d": float(
            row["sma44_10d"]
        ),
    }

    # ==============================
    # BUY CONDITIONS
    # ==============================

    buy_checks = {

        "44 SMA rising":
            values["sma44"]
            > values["sma44_10d"],

        "Low touches 44 SMA":
            values["Low"]
            <= values["sma44"],

        "Close above 44 SMA":
            values["Close"]
            > values["sma44"],

        "44 SMA above 100 SMA":
            values["sma44"]
            > values["sma100"],

        "100 SMA above 200 SMA":
            values["sma100"]
            > values["sma200"],
    }

    buy = all(
        buy_checks.values()
    )

    # ==============================
    # SELL CONDITIONS
    # ==============================

    sell_checks = {

        "High touches 44 SMA":
            values["High"]
            >= values["sma44"],

        "Close below 44 SMA":
            values["Close"]
            < values["sma44"],
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

    signal_date = (
        df.index[-1]
        .strftime("%Y-%m-%d")
    )

    distance_from_44 = (
        (
            values["Close"]
            / values["sma44"]
        ) - 1
    ) * 100

    return {

        "symbol": symbol,

        "ticker": f"{symbol}.NS",

        "date": signal_date,

        "signal": signal,

        "Open": values["Open"],

        "High": values["High"],

        "Low": values["Low"],

        "Close": values["Close"],

        "sma44": values["sma44"],

        "sma100": values["sma100"],

        "sma200": values["sma200"],

        "sma44_10d":
            values["sma44_10d"],

        "distanceFrom44":
            distance_from_44,

        "buyChecks":
            buy_checks,

        "sellChecks":
            sell_checks,
    }


def main():

    symbols, universe_source = (
        get_symbols()
    )

    results = []

    skipped = []

    print("=" * 60)

    print("44 SMA SCANNER")

    print("=" * 60)

    print(
        f"Universe : {universe_source}"
    )

    print(
        f"Stocks   : {len(symbols)}"
    )

    print("=" * 60)

    for index, symbol in enumerate(
        symbols,
        start=1
    ):

        try:

            result = scan_symbol(
                symbol
            )

            if result is None:

                skipped.append(
                    symbol
                )

                print(
                    f"[{index}/{len(symbols)}] "
                    f"{symbol} - skipped"
                )

                continue

            results.append(
                result
            )

            print(
                f"[{index}/{len(symbols)}] "
                f"{symbol} - "
                f"{result['signal']}"
            )

        except Exception as error:

            skipped.append(
                symbol
            )

            print(
                f"[{index}/{len(symbols)}] "
                f"{symbol} - ERROR: "
                f"{error}"
            )

    # ==============================
    # BUY / SELL RESULTS
    # ==============================

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

    # ==============================
    # CURRENT SIGNALS
    # ==============================

    payload = {

        "scannedAt":
            scanned_at,

        "strategy":
            "44 SMA Support / Breakdown",

        "universe":
            universe_source,

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
            sells,
    }

    (
        DATA / "signals.json"
    ).write_text(

        json.dumps(
            payload,
            indent=2
        ),

        encoding="utf-8",
    )

    # ==============================
    # HISTORY
    # ==============================

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

    # Every qualifying BUY and SELL
    # is added to history.

    for item in buys + sells:

        history.insert(

            0,

            {
                "scannedAt":
                    scanned_at,

                "universe":
                    universe_source,

                **item,
            },
        )

    # Keep maximum 10,000 records.

    history = history[:10000]

    history_file.write_text(

        json.dumps(
            history,
            indent=2
        ),

        encoding="utf-8",
    )

    # ==============================
    # SAVE UNIVERSE
    # ==============================

    universe_payload = {

        "updatedAt":
            scanned_at,

        "source":
            universe_source,

        "count":
            len(symbols),

        "symbols":
            symbols,
    }

    (
        DATA / "universe.json"
    ).write_text(

        json.dumps(
            universe_payload,
            indent=2
        ),

        encoding="utf-8",
    )

    # ==============================
    # SAVE SKIPPED STOCKS
    # ==============================

    skipped_payload = {

        "scannedAt":
            scanned_at,

        "count":
            len(skipped),

        "symbols":
            skipped,
    }

    (
        DATA / "skipped.json"
    ).write_text(

        json.dumps(
            skipped_payload,
            indent=2
        ),

        encoding="utf-8",
    )

    # ==============================
    # FINAL REPORT
    # ==============================

    print("")

    print("=" * 60)

    print("44 SMA SCANNER COMPLETE")

    print("=" * 60)

    print(
        f"Universe       : "
        f"{universe_source}"
    )

    print(
        f"Universe count : "
        f"{len(symbols)}"
    )

    print(
        f"Successfully scanned: "
        f"{len(results)}"
    )

    print(
        f"Skipped        : "
        f"{len(skipped)}"
    )

    print(
        f"BUY triggers   : "
        f"{len(buys)}"
    )

    print(
        f"SELL triggers  : "
        f"{len(sells)}"
    )

    print("=" * 60)


if __name__ == "__main__":
    main()
