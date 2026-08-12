# 44 SMA Scanner Pro

A separate GitHub-based NSE stock scanner and dashboard using the 44 SMA strategy.

## Strategy
### BUY
- SMA(44) today > SMA(44) 10 trading days ago
- Low <= SMA(44)
- Close > SMA(44)
- SMA(44) > SMA(100)
- SMA(100) > SMA(200)

### SELL
- High >= SMA(44)
- Close < SMA(44)

The scanner records every qualifying BUY and SELL signal. There is no New Buy/New Sell concept.

## GitHub Actions
The included workflow runs at approximately 8:00 PM IST on weekdays (14:30 UTC). It can also be run manually from Actions.

## Data
The scanner uses Yahoo Finance daily market data through `yfinance`. The symbol universe is stored in `scanner/symbols.csv` and can be replaced with your preferred NSE 500 list.

## Dashboard
The dashboard is a static GitHub Pages-friendly app in `dashboard/`. It reads `data/signals.json` and `data/history.json`. Clicking a stock opens a chart/details view using TradingView's hosted chart page.

> This is a new project and does not modify the existing scanner repository.
