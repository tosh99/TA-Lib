import { DSLParser, FunctionRegistry } from "./features/feature_dsl_parser";
import { DEFAULT_FUNCTION_REGISTRY } from "./features/feature_indicators_formulaes";
import { StrategyRunner, StrategySchema } from "./features/feature_strategy_runner";
import { Candle } from "./types/types_ohlc";
import * as fs from "fs";

const r = fs.readFileSync(process.cwd() + "/src/sample_ohlc.json", "utf-8");
const rs = JSON.parse(r);

const candles: Candle[] = rs.data.symbol_ticks.map((item: any) => ({
    ...item,
    open: item.open,
    close: item.close,
    high: item.high,
    low: item.low,
}));

const parser = new DSLParser(candles, DEFAULT_FUNCTION_REGISTRY);
const index = 2;
const result = parser.evaluate(`close(0) > vwap(0)`);
console.log(`DSL at index ${index}:`, result);

// && ema(20, 0) > ema(50, 0)
// && close(1) > open(1)
// && volume(1) > max(volume(2),volume(1))
// && (close(0) > ema(20, 0) || close(0) > ema(50, 0))

const s_schema: StrategySchema = {
    name: "VWAP + EMA Pullback with Breakout Confirmation",

    entry_long: `
      close(0) > vwap(0) &&
      ema(20, 0) > ema(50, 0) &&
      close(1) > open(1) &&
      volume(1) > avg(volume(2), volume(3)) &&
      rsi(14, 0) > 50
    `,

    // Set SL slightly below previous candle low and 1.5x ATR
    stop_loss_expr: `min(low(1), ema(50, 0)) - atr(14, 0) * 0.5`,

    // Clean 1:2 RRR
    target_expr: `entry_price() + (entry_price() - stop_loss()) * 2`,

    // Trail/breakeven after 1R
    breakeven_trigger_expr: `risk_reward_ratio() >= 1`,
    trailing_trigger_expr: `risk_reward_ratio() >= 1`,
    trailing_offset_expr: `atr(14, 0) * 1.0`,

    capital: 1000000,
    risk_per_trade: 0.01, // 1% of capital
    cooldown_period: 3, // 45 minutes between trades
    transaction_charges: 0.00035, // Brokerage
};
const strat = new StrategyRunner(candles, s_schema, DEFAULT_FUNCTION_REGISTRY);
const res = strat.run();
const report = strat.get_report();
console.log(report);
