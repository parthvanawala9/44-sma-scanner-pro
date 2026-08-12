import json
import os
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)
SYMBOLS_FILE = Path(__file__).resolve().parent / "symbols.csv"


def load_symbols():
    df = pd.read_csv(SYMBOLS_FILE)
    return [str(x).strip().upper() for x in df["symbol"].dropna() if str(x).strip()]


def scan_symbol(symbol):
    ticker = f"{symbol}.NS"
    df = yf.download(ticker, period="18mo", interval="1d", auto_adjust=False, progress=False, threads=False)
    if df is None or df.empty:
        return None
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    df = df.dropna(subset=["High", "Low", "Close"]).copy()
    if len(df) < 210:
        return None
    df["sma44"] = df["Close"].rolling(44).mean()
    df["sma100"] = df["Close"].rolling(100).mean()
    df["sma200"] = df["Close"].rolling(200).mean()
    df["sma44_10d"] = df["sma44"].shift(10)
    r = df.iloc[-1]
    vals = {k: float(r[k]) for k in ["Open", "High", "Low", "Close", "sma44", "sma100", "sma200", "sma44_10d"]}
    buy = (
        vals["sma44"] > vals["sma44_10d"] and
        vals["Low"] <= vals["sma44"] and
        vals["Close"] > vals["sma44"] and
        vals["sma44"] > vals["sma100"] and
        vals["sma100"] > vals["sma200"]
    )
    sell = vals["High"] >= vals["sma44"] and vals["Close"] < vals["sma44"]
    signal = "BUY" if buy else "SELL" if sell else "NONE"
    date = df.index[-1].strftime("%Y-%m-%d")
    return {
        "symbol": symbol,
        "ticker": ticker,
        "date": date,
        "signal": signal,
        **vals,
        "buyChecks": {
            "sma44Rising10d": vals["sma44"] > vals["sma44_10d"],
            "lowTouches44": vals["Low"] <= vals["sma44"],
            "closeAbove44": vals["Close"] > vals["sma44"],
            "sma44Above100": vals["sma44"] > vals["sma100"],
            "sma100Above200": vals["sma100"] > vals["sma200"],
        },
        "sellChecks": {
            "highTouches44": vals["High"] >= vals["sma44"],
            "closeBelow44": vals["Close"] < vals["sma44"],
        },
    }


def main():
    results = []
    for symbol in load_symbols():
        try:
            item = scan_symbol(symbol)
            if item:
                results.append(item)
        except Exception as e:
            print(f"{symbol}: {e}")

    buys = [x for x in results if x["signal"] == "BUY"]
    sells = [x for x in results if x["signal"] == "SELL"]
    scanned_at = datetime.now(timezone.utc).isoformat()
    payload = {
        "scannedAt": scanned_at,
        "strategy": "44 SMA Support / Breakdown",
        "scanned": len(results),
        "buyCount": len(buys),
        "sellCount": len(sells),
        "buy": buys,
        "sell": sells,
    }
    (DATA / "signals.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")

    history_file = DATA / "history.json"
    history = json.loads(history_file.read_text()) if history_file.exists() else []
    for item in buys + sells:
        history.insert(0, {"scannedAt": scanned_at, **item})
    # Keep the latest 10,000 signal records.
    history = history[:10000]
    history_file.write_text(json.dumps(history, indent=2), encoding="utf-8")
    print(f"Scanned {len(results)} | BUY {len(buys)} | SELL {len(sells)}")


if __name__ == "__main__":
    main()
