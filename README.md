# 📊 TA-Lib

A powerful TypeScript library designed specifically for Technical Analysis in trading and financial markets.

## 🌟 Overview

TA-Lib provides a comprehensive collection of technical indicators and functions for analyzing financial market data. Built with TypeScript, it offers type safety and modern programming patterns for reliable technical analysis.

## ✨ Features

- 📈 **Multiple Technical Indicators** - MACD, RSI, Bollinger Bands, ADX, OBV, Alligator, VWAP, ATR, and more
- 🧮 **Domain-Specific Language (DSL)** - Create and evaluate trading strategies using a simple expression language
- 🔄 **Strategy Backtesting** - Test your trading strategies against historical data
- 🛠️ **Extensible Architecture** - Easily add new indicators and functions
- 📊 **Type-Safe API** - Fully typed interfaces for reliable development

## 🚀 Getting Started

### Installation

```bash
npm install ta-lib-ts
```

### Basic Usage

```typescript
import { compute_rsi, compute_macd, compute_bollinger_bands } from 'ta-lib-ts';

// Calculate RSI
const rsi = compute_rsi(closePrices, 14);

// Calculate MACD
const macd = compute_macd(closePrices, 12, 26, 9);

// Calculate Bollinger Bands
const bb = compute_bollinger_bands(candleData, 20, 2);
```

### Using the DSL Parser

```typescript
import { DSLParser } from 'ta-lib-ts';
import { DEFAULT_FUNCTION_REGISTRY } from 'ta-lib-ts';

// Create a parser with candle data and the default function registry
const parser = new DSLParser(candleData, DEFAULT_FUNCTION_REGISTRY);

// Evaluate expressions
const result = parser.evaluate("ema(9, 0) > ema(21, 0)");
```

### Backtesting Strategies

```typescript
import { StrategyRunner, StrategySchema } from 'ta-lib-ts';
import { DEFAULT_FUNCTION_REGISTRY } from 'ta-lib-ts';

// Define a strategy
const strategy: StrategySchema = {
    name: "Golden Cross",
    entry_long: "ema(9, 0) > ema(21, 0)",
    exit_long: "ema(9, 0) < ema(21, 0)",
    capital: 1000,
    stop_loss_expr: "entry_price() * 0.95",
};

// Run the strategy
const runner = new StrategyRunner(candleData, strategy, DEFAULT_FUNCTION_REGISTRY);
const results = runner.run();
const report = runner.get_report();
```

## 📋 Available Indicators

| Indicator | Function | Description |
|-----------|----------|-------------|
| EMA | `compute_ema(data, period)` | Exponential Moving Average |
| MACD | `compute_macd(data, short_period, long_period, signal_period)` | Moving Average Convergence Divergence |
| RSI | `compute_rsi(data, period)` | Relative Strength Index |
| Bollinger Bands | `compute_bollinger_bands(data, period, multiplier)` | Bollinger Bands |
| ADX | `compute_adx(data, period)` | Average Directional Index |
| OBV | `compute_obv(data)` | On-Balance Volume |
| Alligator | `compute_alligator(data, jaw_period, teeth_period, lips_period)` | Williams Alligator Indicator |
| VWAP | `compute_vwap(data)` | Volume Weighted Average Price |
| ATR | `compute_atr(data, period)` | Average True Range |

## 🧩 DSL Functions

The library includes a powerful Domain-Specific Language for creating trading strategies. Available functions include:

- Basic price data: `open()`, `high()`, `low()`, `close()`
- Technical indicators: `ema()`, `macd_macd_line()`, `macd_signal_line()`, `rsi()`, `obv()`, `vwap()`, `atr()`
- Strategy context: `entry_price()`, `exit_price()`
- Utility functions: `avg()`

## 🛠️ Development

### Building the Project

```bash
npm install
npm run build
```

### Running Tests

```bash
npm test
```

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
```

This README provides a comprehensive overview of your TA-Lib project, including features, usage examples, available indicators, and development instructions. The emojis add visual appeal and help organize the different sections.