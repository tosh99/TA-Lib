export interface StrategySchema {
    // Name of the trading strategy
    name: string;
    // Transaction fee as a decimal (e.g., 0.00035 for 0.035%)
    transaction_charges?: number;
    // Risk per trade as a decimal (e.g., 0.01 for 1%)
    risk_per_trade?: number;
    capital: number;
    // Number of periods to wait after a trade before entering new positions
    cooldown_period?: number;
    allow_reentry?: boolean;
    warmup_period?: number;
    lookback_period?: number;

    // Directional entry rules
    // DSL expression for long entry condition
    entry_long?: string;
    // DSL expression for short entry condition
    entry_short?: string;

    // Optional exit rules
    exit_long?: string;
    exit_short?: string;
    stop_loss_expr_long?: string;
    stop_loss_expr_short?: string;
    target_expr_long?: string;
    target_expr_short?: string;
    breakeven_trigger_expr_long?: string;
    breakeven_trigger_expr_short?: string;
    trailing_trigger_expr_long?: string;
    trailing_trigger_expr_short?: string;
    trailing_offset_expr_long?: string;
    trailing_offset_expr_short?: string;
}

export interface StrategyTrade {
    // Index position of trade entry in the candles array
    entry_index: number;
    // Index position of trade exit in the candles array
    exit_index: number;
    // Timestamp of trade entry
    entry_time: string;
    // Timestamp of trade exit
    exit_time: string;
    // Price at which the trade was entered
    entry_price: number;
    // Price at which the trade was exited
    exit_price: number;
    // Size of the trading position (quantity)
    position_size: number;
    // Direction of the trade (long or short)
    side: "long" | "short";
    // Profit/Loss in absolute terms
    pnl: number;
    // Profit/Loss as a percentage
    pnl_percent: number;
    // Reason for trade exit (take profit, stop loss, or exit condition)
    reason: "tp" | "sl" | "sl_breakeven" | "exit_condition";
    // Stop loss price level (optional)
    stop_price?: number;
    // Take profit price level (optional)
    take_profit_price?: number;
    // Whether trailing stop was activated during the trade
    trailing_triggered?: boolean;
    // Whether breakeven stop was activated during the trade
    breakeven_triggered?: boolean;
}

export interface StrategyState {
    // Whether currently holding a position
    in_position: boolean;
    // Index of the candle where position was entered
    entry_index: number | null;
    // Timestamp when position was entered
    entry_time: string | null;
    // Price at which position was entered
    entry_price: number | null;
    // Size/quantity of the trading position
    position_size: number;
    // Current stop loss price level
    stop_price: number | null;
    // Current take profit price level
    take_profit_price: number | null;
    // Whether breakeven stop has been triggered
    breakeven_triggered: boolean;
    // Whether trailing stop is currently active
    trailing_stop_active: boolean;
    // Number of periods remaining in cooldown
    cooldown_remaining: number;
    // Direction of current position (long/short)
    side: "long" | "short" | null;
    // Price at which last trade was exited
    last_exit_price?: number;
    // Index of the candle where last trade was exited
    last_exit_index?: number;
    // Reason for last trade exit (stop loss/take profit/exit condition)
    last_exit_reason?: "tp" | "exit_condition" | "sl" | "sl_breakeven";
}

export interface StrategyReportMetric {
    // Name of the strategy
    strategy: string;
    // Initial capital at the start of backtesting
    capital_start: number;
    // Final capital at the end of backtesting
    capital_end: number;
    // Total number of trades executed
    total_trades: number;
    // Percentage of winning trades
    win_rate: number;
    // Average profit/loss per trade
    avg_pnl: number;
    // Average percentage profit/loss per trade
    avg_pnl_percent: number;
    // Average profit of winning trades
    avg_win: number;
    // Average loss of losing trades
    avg_loss: number;
    // Average number of candles a position was held
    avg_hold: number;
    // Total profit/loss from all trades
    total_profit: number;
    // Maximum drawdown as a percentage
    max_drawdown: number;
    // Sharpe ratio (risk-adjusted return)
    sharpe_ratio: number;
    // Time taken for backtesting in milliseconds
    total_time_taken: number;
}

export interface StrategyReport {
    metric: StrategyReportMetric;
    trades: StrategyTrade[];
    candle_decisions: StrategyCandleDecision[];
}

export interface StrategyCandleDecision {
    index: number;
    decision: string;
    last_traded_price: number;
    stop_loss: null | number;
    take_profit: null | number;
    long_expression?: null | string;
    short_expression?: null | string;
    breakeven_expression?: null | string;
    update_sl_expression?: null | string;
    take_profit_expression?: null | string;
    exit_expression?: null | string;
}
