import round from "lodash.round";
import { EventEmitter } from "events";
import { Candle } from "../types/types_ohlc";
import { DSLParser, FunctionRegistry } from "./feature_dsl_parser";
import { StrategySchema, StrategyTrade, StrategyState, StrategyCandleDecision, StrategyReport } from "../types/types-strategy";

export class StrategyRunner extends EventEmitter {
    private readonly candles: Candle[];
    private readonly strategy: StrategySchema;
    private readonly function_registry: FunctionRegistry;
    private readonly warmup_period: number;
    private readonly lookback_period: number;

    private start_time = Date.now();
    private trades: StrategyTrade[] = [];
    private capital: number;
    private state: StrategyState;
    private candle_decisions: StrategyCandleDecision[] = [];

    constructor(candles: Candle[], strategy: StrategySchema, function_registry: FunctionRegistry) {
        super();
        this.candles = candles;
        this.strategy = strategy;
        this.function_registry = function_registry;
        this.capital = strategy.capital;
        this.warmup_period = strategy.warmup_period || 100;
        this.lookback_period = strategy.lookback_period || 200;

        // Validate the strategy configuration
        this.evaluateStrategy();

        // Initialize strategy state with default values
        this.state = {
            in_position: false,
            entry_index: null,
            entry_time: null,
            entry_price: null,
            position_size: 0,
            stop_price: null,
            take_profit_price: null,
            breakeven_triggered: false,
            trailing_stop_active: false,
            cooldown_remaining: 0,
            side: null,
        };
    }

    /**
     * Validates the strategy configuration to ensure it meets minimum requirements
     * and has consistent settings.
     * @throws Error if the strategy configuration is invalid
     */
    private evaluateStrategy(): void {
        const strategy = this.strategy;
        const errors: string[] = [];

        // Check required fields
        if (!strategy.name) {
            errors.push("Strategy name is required");
        }

        if (strategy.capital <= 0) {
            errors.push("Capital must be greater than zero");
        }

        // Check entry conditions
        if (!strategy.entry_long && !strategy.entry_short) {
            errors.push("At least one entry condition (long or short) must be defined");
        }

        // Check risk parameters
        if (strategy.risk_per_trade !== undefined && (strategy.risk_per_trade <= 0 || strategy.risk_per_trade > 1)) {
            errors.push("Risk per trade must be between 0 and 1");
        }

        // Check stop loss and take profit expressions
        // if (strategy.entry_long && !strategy.stop_loss_expr_long) {
        //     errors.push("Stop loss expression for long positions is required when long entry is defined");
        // }

        if (strategy.entry_short && !strategy.stop_loss_expr_short) {
            errors.push("Stop loss expression for short positions is required when short entry is defined");
        }

        // Check for consistent trailing stop configuration
        if (strategy.trailing_trigger_expr_long && !strategy.trailing_offset_expr_long) {
            errors.push("Trailing offset expression for long positions is required when trailing trigger is defined");
        }

        if (strategy.trailing_trigger_expr_short && !strategy.trailing_offset_expr_short) {
            errors.push("Trailing offset expression for short positions is required when trailing trigger is defined");
        }

        // Check transaction charges
        if (strategy.transaction_charges !== undefined && strategy.transaction_charges < 0) {
            errors.push("Transaction charges cannot be negative");
        }

        // Check cooldown period
        if (strategy.cooldown_period !== undefined && strategy.cooldown_period < 0) {
            errors.push("Cooldown period cannot be negative");
        }

        // If any errors were found, throw an exception with all error messages
        if (errors.length > 0) {
            throw new Error(`Strategy validation failed:\n${errors.join("\n")}`);
        }
    }

    public async run(): Promise<StrategyTrade[]> {
        try {
            for (let i = this.warmup_period; i < this.candles.length; i++) {
                // Loop through each candle
                const sliced = this.candles.slice(i - this.lookback_period > 0 ? i - this.lookback_period : 0, i + 1); // Get candles up to current index
                const candle = this.candles[i]; // Get current candle
                const parser = new DSLParser(sliced, this.function_registry); // Create parser with available candles

                if (this.state.cooldown_remaining > 0) {
                    // If in cooldown period
                    this.state.cooldown_remaining--; // Decrement cooldown counter
                }

                if (!this.state.in_position) {
                    // If not currently in a position
                    this.try_entry(i, candle, parser); // Try to enter a new position
                } else {
                    // If already in a position
                    this.try_exit(i, candle, parser); // Try to exit the current position
                }

                const progress = ((i + 1) / this.candles.length) * 100;
                if (progress % 2 === 0) {
                    this.emit("progress", {
                        progress: progress,
                        report: this.get_report(),
                    });
                }
            }
        } catch (e) {
            console.error(e);
        }
        return this.trades; // Return completed trades
    }

    private try_entry(index: number, candle: Candle, parser: DSLParser): void {
        if (this.state.cooldown_remaining > 0) return; // Skip if in cooldown period
        if (this.state.in_position) return; // Skip if already in a position
        let expression: string | null = null;
        let take_profit_expression: string | null = null;

        // Evaluate entry conditions using DSL
        const long_entry = this.strategy.entry_long ? parser.evaluate(this.strategy.entry_long) : false; // Check long entry condition
        const long_expression = parser.get_last_resolved_expression(); // Get last resolved expression

        const short_entry = this.strategy.entry_short ? parser.evaluate(this.strategy.entry_short) : false; // Check short entry condition
        const short_expression = parser.get_last_resolved_expression(); // Get last resolved expression

        let side: "long" | "short" | null = null; // Initialize position side
        if (long_entry === true) {
            side = "long";
            expression = long_expression;
        } // Set side to long if long entry condition is true
        if (short_entry === true) {
            side = "short";
            expression = short_expression;
        } // Set side to short if short entry condition is true

        if (!side) {
            this.candle_decisions.push({
                index,
                decision: "IGNORE",
                last_traded_price: candle.close,
                stop_loss: null,
                take_profit: null,
                long_expression,
                short_expression,
            });
            return;
        } // Exit if no valid entry signal

        const entry_price = candle.close; // Use close price as entry price
        const context = { entry_price, stop_price: 0, target_price: 0 }; // Create context for DSL evaluation

        // Select appropriate stop loss expression based on position direction
        const stop_loss_expr = side === "long" ? this.strategy.stop_loss_expr_long : side === "short" ? this.strategy.stop_loss_expr_short : this.strategy.stop_loss_expr_long;

        // Calculate stop loss price using DSL if provided
        const stop_price = stop_loss_expr ? round(Number(parser.evaluate(stop_loss_expr, context)), 2) : null;

        // Calculate take profit price using DSL if provided
        context.stop_price = stop_price || 0; // Update context with stop price

        // Select appropriate target expression based on position direction
        const target_expr = side === "long" ? this.strategy.target_expr_long : side === "short" ? this.strategy.target_expr_short : this.strategy.target_expr_long;

        const target_price = target_expr ? round(Number(parser.evaluate(target_expr, context)), 2) : null;
        take_profit_expression = parser.get_last_resolved_expression();

        context.target_price = target_price || 0; // Update context with target price

        // Calculate position sizing
        const risk_per_trade = this.strategy.risk_per_trade ?? 0.01; // Get risk per trade or default to 1%
        const capital_to_risk = this.capital * risk_per_trade; // Calculate amount of capital to risk

        // Calculate stop gap (distance to stop loss)
        let stop_gap = stop_price !== null ? Math.abs(entry_price - stop_price) : 1; // Calculate stop gap or use default
        stop_gap = stop_gap === 0 ? 0.01 : stop_gap; // Ensure stop gap is not zero

        // Calculate position size based on risk and capital constraints
        let position_size = Math.floor(capital_to_risk / stop_gap) || Infinity;

        // Check capital constraint
        const max_position_by_capital = Math.floor(this.capital / entry_price);
        position_size = Math.min(position_size, max_position_by_capital);

        // Ensure we have a valid position size
        if (position_size <= 0) {
            console.debug("Insufficient capital for minimum position size");
            return;
        }

        this.candle_decisions.push({
            index,
            decision: `ENTRY ${side}`,
            last_traded_price: candle.close,
            stop_loss: stop_price,
            take_profit: target_price,
            take_profit_expression,
        });
        this.state = {
            in_position: true, // Now in a position
            entry_index: index, // Set entry index
            entry_time: candle.time, // Set entry time
            entry_price, // Set entry price
            position_size, // Set position size
            stop_price, // Set stop loss price
            take_profit_price: target_price, // Set take profit price
            breakeven_triggered: false, // Reset breakeven flag
            trailing_stop_active: false, // Reset trailing stop flag
            cooldown_remaining: 0, // Reset cooldown
            side, // Set position side
        };
    }

    private try_exit(index: number, candle: Candle, parser: DSLParser): void {
        const state = this.state; // Get current state
        if (!state.in_position) return; // Exit if not in a position

        const is_long = state.side === "long"; // Check if position is long
        const is_short = state.side === "short"; // Check if position is short
        const current_price = candle.close; // Use close price as current price
        let breakeven_expression: string | null = null;
        let update_sl_expression: string | null = null;
        let exit_expression: string | null = null;

        let exit_reason: "tp" | "sl" | "sl_breakeven" | "exit_condition" | null = null; // Initialize exit reason
        let decision_made = false; // Flag to track if a decision has been made

        // === Stop Loss ===
        // Check if stop loss has been hit
        if (state.stop_price !== null && ((is_long && candle.low <= state.stop_price) || (is_short && candle.high >= state.stop_price))) {
            if (state.breakeven_triggered && state.stop_price === state.entry_price) {
                exit_reason = "sl_breakeven"; // Special case: breakeven SL
            } else {
                exit_reason = "sl"; // Normal SL
            }
        }

        // === Breakeven ===
        // Select appropriate breakeven expression based on position direction
        const breakeven_expr = is_long ? this.strategy.breakeven_trigger_expr_long : is_short ? this.strategy.breakeven_trigger_expr_short : null;

        if (!state.breakeven_triggered && breakeven_expr) {
            // If breakeven not triggered and expression exists
            const be_trigger = parser.evaluate(breakeven_expr, {
                // Evaluate breakeven trigger condition
                entry_price: state.entry_price!,
                target_price: state.take_profit_price!,
                stop_loss: state.stop_price!,
                position_size: state.position_size,
            });
            breakeven_expression = parser.get_last_resolved_expression();
            if (be_trigger === true) {
                this.candle_decisions.push({
                    index,
                    decision: `UPDATED_SL_TO_BREAKEVEN`,
                    last_traded_price: candle.close,
                    stop_loss: state.entry_price!,
                    take_profit: state.take_profit_price!,
                    update_sl_expression,
                    breakeven_expression,
                });

                decision_made = true; // Set decision flag

                // If breakeven condition met
                this.state.breakeven_triggered = true; // Set breakeven flag
                this.state.stop_price = state.entry_price!; // Move stop to entry price
            }
        }

        // === Trailing Stop Activation ===
        // Select appropriate trailing trigger expression based on position direction
        const trailing_trigger_expr = is_long ? this.strategy.trailing_trigger_expr_long : is_short ? this.strategy.trailing_trigger_expr_short : null;

        if (!state.trailing_stop_active && trailing_trigger_expr) {
            // If trailing stop not active and expression exists
            const trailing_triggered = parser.evaluate(trailing_trigger_expr, {
                // Evaluate trailing stop trigger condition
                entry_price: state.entry_price!,
                target_price: state.take_profit_price!,
                stop_loss: state.stop_price!,
                position_size: state.position_size,
            });
            update_sl_expression = parser.get_last_resolved_expression();
            if (trailing_triggered === true) {
                // If trailing stop condition met
                this.state.trailing_stop_active = true; // Activate trailing stop
            }
        }

        // === Trailing Stop Update ===
        // Select appropriate trailing offset expression based on position direction
        const trailing_offset_expr = is_long ? this.strategy.trailing_offset_expr_long : is_short ? this.strategy.trailing_offset_expr_short : null;

        if (state.trailing_stop_active && trailing_offset_expr) {
            // If trailing stop active and offset expression exists
            const trailing_offset = Number(
                // Calculate trailing stop offset
                parser.evaluate(trailing_offset_expr, {
                    entry_price: state.entry_price!,
                    target_price: state.take_profit_price!,
                    stop_loss: state.stop_price!,
                    position_size: state.position_size,
                }),
            );

            // Calculate new trailing stop level based on position direction
            const trailing_sl = is_long ? round(current_price - trailing_offset, 2) : round(current_price + trailing_offset, 2);

            // Update stop price for long positions if new stop is higher
            if (is_long && (state.stop_price === null || trailing_sl > state.stop_price)) {
                this.candle_decisions.push({
                    index,
                    decision: `UPDATED_SL: ${trailing_sl}`,
                    last_traded_price: candle.close,
                    stop_loss: trailing_sl,
                    take_profit: state.take_profit_price!,
                    update_sl_expression,
                    breakeven_expression,
                });

                decision_made = true; // Set decision flag
                this.state.stop_price = trailing_sl;
            }

            // Update stop price for short positions if new stop is lower
            if (is_short && (state.stop_price === null || trailing_sl < state.stop_price)) {
                this.candle_decisions.push({
                    index,
                    decision: `UPDATED_SL: ${trailing_sl}`,
                    last_traded_price: candle.close,
                    stop_loss: trailing_sl,
                    take_profit: state.take_profit_price!,
                    update_sl_expression,
                    breakeven_expression,
                });

                decision_made = true; // Set decision flag
                this.state.stop_price = trailing_sl;
            }
        }

        // === Take Profit ===
        // Check if take profit has been hit
        if (exit_reason === null && state.take_profit_price !== null && ((is_long && candle.high >= state.take_profit_price) || (is_short && candle.low <= state.take_profit_price))) {
            exit_reason = "tp"; // Set exit reason to take profit
        }

        // === Exit DSL ===
        if (exit_reason === null) {
            // If no exit reason yet
            // Get appropriate exit rule based on position side
            const rule = is_long ? this.strategy.exit_long : is_short ? this.strategy.exit_short : null;

            if (rule) {
                // If exit rule exists
                const should_exit = parser.evaluate(rule, {
                    // Evaluate exit condition
                    entry_price: state.entry_price!,
                    target_price: state.take_profit_price!,
                    stop_loss: state.stop_price!,
                    position_size: state.position_size,
                });

                exit_expression = parser.get_last_resolved_expression();

                if (should_exit === true) {
                    // If exit condition met
                    exit_reason = "exit_condition"; // Set exit reason to exit condition
                }
            }
        }

        if (!exit_reason && !decision_made) {
            this.candle_decisions.push({
                index,
                decision: `HOLD`,
                last_traded_price: candle.close,
                stop_loss: state.stop_price!,
                take_profit: state.take_profit_price!,
                update_sl_expression,
                breakeven_expression,
                exit_expression,
            });
        }

        if (!exit_reason) {
            return;
        } // Exit if no exit reason found

        // === Finalize Trade ===
        const qty = state.position_size; // Get position size
        const entry_price = state.entry_price!; // Get entry price
        const exit_price = current_price; // Use current price as exit price

        // Calculate profit/loss
        const gross_pnl = is_long ? (exit_price - entry_price) * qty : (entry_price - exit_price) * qty;

        // Calculate total transaction value
        const turnover = (entry_price + exit_price) * qty;

        // Calculate transaction charges
        const charges = (this.strategy.transaction_charges ?? 0) * turnover;

        // Calculate net profit/loss
        const pnl = round(gross_pnl - charges, 2);
        // Calculate percentage profit/loss
        const pnl_percent = round(((exit_price - entry_price) / entry_price) * (is_long ? 1 : -1) * 100, 3);

        this.candle_decisions.push({
            index,
            decision: `EXITED: ${exit_reason}`,
            last_traded_price: candle.close,
            stop_loss: state.stop_price!,
            take_profit: state.take_profit_price!,
            update_sl_expression,
            breakeven_expression,
            exit_expression,
        });

        // Add completed trade to trades array
        this.trades.push({
            entry_index: state.entry_index!,
            exit_index: index,
            entry_time: state.entry_time!,
            exit_time: candle.time,
            entry_price,
            exit_price,
            position_size: qty,
            side: state.side!,
            pnl,
            pnl_percent,
            reason: exit_reason,
            stop_price: state.stop_price ?? undefined,
            take_profit_price: state.take_profit_price ?? undefined,
            trailing_triggered: state.trailing_stop_active,
            breakeven_triggered: state.breakeven_triggered,
        });

        // === Capital Update & Reset State ===
        this.capital += pnl; // Update capital with trade profit/loss

        // Reset state for next trade
        this.state = {
            in_position: false, // No longer in a position
            entry_index: null, // Clear entry index
            entry_time: null, // Clear entry time
            entry_price: null, // Clear entry price
            position_size: 0, // Clear position size
            stop_price: null, // Clear stop price
            take_profit_price: null, // Clear take profit price
            breakeven_triggered: false, // Reset breakeven flag
            trailing_stop_active: false, // Reset trailing stop flag
            cooldown_remaining: this.strategy.cooldown_period ?? 0, // Set cooldown period
            side: null, // Clear position side
            last_exit_price: exit_price, // Store last exit price
            last_exit_index: index, // Store last exit index
            last_exit_reason: exit_reason, // Store last exit reason
        };
    }

    public get_report(): StrategyReport {
        const total_trades = this.trades.length; // Get total number of trades
        const winning_trades = this.trades.filter((t) => t.pnl > 0); // Filter winning trades
        const losing_trades = this.trades.filter((t) => t.pnl <= 0); // Filter losing trades

        const total_pnl = this.trades.reduce((acc, t) => acc + t.pnl, 0); // Calculate total profit/loss
        const total_pnl_percent = this.trades.reduce((acc, t) => acc + t.pnl_percent, 0); // Calculate total percentage profit/loss

        const avg_pnl = total_trades > 0 ? total_pnl / total_trades : 0; // Calculate average profit/loss per trade
        const avg_pnl_percent = total_trades > 0 ? total_pnl_percent / total_trades : 0; // Calculate average percentage profit/loss per trade

        const win_rate = total_trades > 0 ? (winning_trades.length / total_trades) * 100 : 0; // Calculate win rate
        const avg_win = winning_trades.length > 0 ? winning_trades.reduce((acc, t) => acc + t.pnl, 0) / winning_trades.length : 0; // Calculate average winning trade
        const avg_loss = losing_trades.length > 0 ? losing_trades.reduce((acc, t) => acc + t.pnl, 0) / losing_trades.length : 0; // Calculate average losing trade

        const avg_hold = total_trades > 0 ? this.trades.reduce((acc, t) => acc + (t.exit_index - t.entry_index), 0) / total_trades : 0; // Calculate average holding period

        // Calculate maximum drawdown
        let max_drawdown = 0;
        let peak_capital = this.strategy.capital;
        let running_capital = this.strategy.capital;
        
        for (const trade of this.trades) {
            running_capital += trade.pnl;
            if (running_capital > peak_capital) {
                peak_capital = running_capital;
            } else {
                const drawdown = (peak_capital - running_capital) / peak_capital * 100;
                if (drawdown > max_drawdown) {
                    max_drawdown = drawdown;
                }
            }
        }
        
        // Calculate Sharpe ratio
        // Using daily returns assumption and risk-free rate of 6.3%
        let sharpe_ratio = 0;
        if (total_trades > 1) {
            const returns = this.trades.map(t => t.pnl_percent / 100); // Convert percentage to decimal
            const mean_return = returns.reduce((sum, r) => sum + r, 0) / returns.length;
            const risk_free_rate = 0.063; // 6.3% annual risk-free rate
            
            // Calculate standard deviation of returns
            const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean_return, 2), 0) / (returns.length - 1);
            const std_dev = Math.sqrt(variance);
            
            // Annualized Sharpe ratio (assuming daily returns)
            sharpe_ratio = std_dev !== 0 ? ((mean_return - risk_free_rate / 252) / std_dev) * Math.sqrt(252) : 0;
        }

        // Return comprehensive strategy report
        return {
            metric: {
                total_time_taken: Date.now() - this.start_time,
                strategy: this.strategy.name,
                capital_start: this.strategy.capital,
                capital_end: this.capital,
                total_trades,
                win_rate: round(Number(win_rate), 2),
                avg_pnl: round(Number(avg_pnl), 2),
                avg_pnl_percent: round(Number(avg_pnl_percent), 2),
                avg_win: round(Number(avg_win), 2),
                avg_loss: round(Number(avg_loss), 2),
                avg_hold: round(Number(avg_hold), 2),
                total_profit: round(Number(total_pnl), 2),
                max_drawdown: round(Number(max_drawdown), 2),
                sharpe_ratio: round(Number(sharpe_ratio), 2),
            },
            trades: this.trades,
            candle_decisions: this.candle_decisions,
        };
    }
}
