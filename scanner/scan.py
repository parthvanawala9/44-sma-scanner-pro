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

# Full NIFTY 500 symbol list.
# Used instead of the temporary 10-stock symbols.csv.
NIFTY500_URL = (
    "https://raw.githubusercontent.com/"
    "ganeshbiyer/Nse_Historical_Data/main/"
    "nifty500_symbols.csv"
)


def get_nifty500_symbols():

    print("")
    print("Downloading NIFTY 500 symbol list...")
    print("")

    try:

        response = requests.get(
            NIFTY500_URL,
            timeout=30
        )

        response.raise_for_status()

        df = pd.read_csv(
            StringIO(response.text)
        )

        print(
            "CSV columns:",
            list(df.columns)
        )

        # Find the symbol column automatically.
        symbol_column = None

        for column in df.columns:

            name = str(column).strip().lower()

            if name in [
                "symbol",
                "symbols",
                "ticker",
                "ticker symbol"
            ]:

                symbol_column = column
                break

        if symbol_column is None:

            # If the file has only one column,
            # use that column.
            if len(df.columns) == 1:

                symbol_column = df.columns[0]

            else:

                raise Exception(
                    "Could not find symbol column"
                )

        symbols = []

        for value in df[
            symbol_column
        ].dropna():

            symbol = str(
                value
            ).strip().upper()

            # Remove .NS if present.
            if symbol.endswith(".NS"):

                symbol = symbol[:-3]

            if (
                symbol
                and symbol not in symbols
                and symbol not in [
                    "SYMBOL",
                    "NIFTY 500",
                    "NIFTY500"
                ]
            ):

                symbols.append(symbol)

        if len(symbols) < 400:

            raise Exception(
                f"Only {len(symbols)} symbols found"
            )

        print(
            f"SUCCESS: {len(symbols)} "
            "NIFTY 500 symbols loaded"
        )

        return symbols

    except Exception as error:

        print("")
        print(
            "ERROR downloading NIFTY 500:",
            error
        )
        print("")

        raise Exception(
            "Could not download the NIFTY 500 "
            "symbol list. Scanner stopped so "
            "it does NOT accidentally scan only "
            "the old 10-stock list."
        )


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
    print("=" * 60)

    print(
        f"DOWNLOAD BATCH "
        f"{batch_number}/{total_batches}"
    )

    print(
        f"Stocks: {len(tickers)}"
    )

    print("=" * 60)

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
            "Batch download error:",
            error
        )

        return None


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

        if ticker not in (
            batch_data.columns
            .get_level_values(0)
        ):

            return None

        df = batch_data[
            ticker
        ].copy()

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

        # ==============================
        # BUY
        # ==============================

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

        # ==============================
        # SELL
        # ==============================

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
            f"{symbol}: {error}"
        )

        return None


def main():

    print("")
    print("=" * 70)
    print("44 SMA SCANNER PRO")
    print("=" * 70)

    # IMPORTANT:
    # This ALWAYS downloads the full universe.
    # It does NOT use the old 10-stock symbols.csv.

    symbols = get_nifty500_symbols()

    print("")
    print(
        f"TOTAL UNIVERSE: {len(symbols)}"
    )

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
                    f"BUY  {symbol}"
                )

            elif result["signal"] == "SELL":

                print(
                    f"SELL {symbol}"
                )

    # ==============================
    # SIGNALS
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

    # ==============================
    # UNIVERSE
    # ==============================

    universe = {

        "updatedAt":
            scanned_at,

        "source":
            "NIFTY 500",

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

    # ==============================
    # SKIPPED
    # ==============================

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

    # ==============================
    # FINAL
    # ==============================

    print("")
    print("=" * 70)
    print("44 SMA SCANNER COMPLETE")
    print("=" * 70)

    print(
        f"Universe: {len(symbols)}"
    )

    print(
        f"Scanned successfully: "
        f"{len(results)}"
    )

    print(
        f"Skipped: {len(skipped)}"
    )

    print(
        f"BUY: {len(buys)}"
    )

    print(
        f"SELL: {len(sells)}"
    )

    print("=" * 70)


if __name__ == "__main__":

    main()
