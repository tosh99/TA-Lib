import { Candle } from "../types/types_ohlc";

/**
 * A function that computes a value using candle data and numeric arguments.
 */
type FunctionImplementation = (candles: Candle[], context: Record<string, number>, ...args: number[]) => number;

/**
 * Metadata for each function supported in the DSL.
 * - `fn`: the implementation
 * - `arity`: number of arguments expected (null = variadic)
 * - `description`: optional explanation
 */
interface FunctionMeta {
    fn: FunctionImplementation; // The actual function implementation
    arity: number | null; // Number of expected arguments (null means variable number)
    description?: string; // Optional description of what the function does
}

/**
 * A registry mapping function names to their metadata.
 */
export type FunctionRegistry = Record<string, FunctionMeta>; // Maps function names to their implementations and metadata

/**
 * DSLParser evaluates expressions like "ema(9, close(2)) > 100"
 * by recursively resolving each indicator or function call.
 */
export class DSLParser {
    private candles: Candle[]; // Array of price candles available for calculations
    private function_registry: FunctionRegistry; // Registry of available functions

    /**
     * Creates a new DSLParser instance with candle data sliced up to the current evaluation point.
     * This avoids any lookahead bias and ensures real-time safe evaluation.
     *
     * @param sliced_candles - Only the candles up to the current tick (e.g., candles.slice(0, index + 1))
     * @param function_registry - Set of known function implementations (ema, close, etc.)
     */
    constructor(sliced_candles: Candle[], function_registry: FunctionRegistry) {
        this.candles = sliced_candles; // Store the candles for calculations
        this.function_registry = function_registry; // Store the function registry
    }

    /**
     * Evaluates a DSL expression like "ema(9, 2) > close(0)"
     * against the most recent candle in the slice.
     *
     * Example:
     * - ema(9, 2) → compute EMA(9) using candles[0..(len-1-2)]
     * - close(0) → get close price of latest candle
     *
     * @param expression - DSL rule to evaluate
     * @param context - External variables (e.g., entry_price, capital)
     * @returns boolean or number result
     */
    public evaluate(expression: string, context: Record<string, number> = {}): number | boolean {
        const resolved = this.parse_and_evaluate_expression(expression, context); // Parse and resolve all function calls
        try {
            // Evaluate using JS eval() after all functions are resolved to values
            return eval(resolved);
        } catch (err) {
            // Provide detailed error information if evaluation fails
            throw new Error(`DSL evaluation error: ${err instanceof Error ? err.message : String(err)}\nResolved: ${resolved}`);
        }
    }
    /**
     * Parses and resolves all function calls within a DSL expression
     * into a final flattened string like "104.2 > 100", ready to be passed to eval().
     *
     * Supports deeply nested calls like:
     * - ema(3, close(0))
     * - avg(ema(5, 1), close(0), 10)
     */
    private parse_and_evaluate_expression(expr: string, context: Record<string, number>): string {
        const fn_pattern = /\b(\w+)\(([^()]*)\)/; // Regex to match function calls like "func(args)"

        while (true) {
            const match = fn_pattern.exec(expr); // Find the next function call
            if (!match) break; // Exit loop if no more function calls found

            const [full_match, fn_name, raw_args] = match; // Extract function name and raw arguments

            // Split args and recursively evaluate each one to a number
            const args = this.split_arguments(raw_args).map((arg) => Number(this.evaluate(arg, context)));

            const fn_entry = this.function_registry[fn_name]; // Look up function in registry
            if (!fn_entry) throw new Error(`Unknown function: ${fn_name}`); // Error if function not found

            if (fn_entry.arity !== null && args.length !== fn_entry.arity) {
                // Validate argument count if function has fixed arity
                throw new Error(`Function "${fn_name}" expects ${fn_entry.arity} arguments, got ${args.length}`);
            }

            const result = fn_entry.fn(this.candles, context, ...args); // Execute the function with arguments

            // Replace the entire "func(...)" with its computed result
            expr = expr.replace(full_match, String(result));
        }

        return expr; // Return the fully resolved expression
    }

    /**
     * Splits a function argument list string into its individual arguments,
     * handling nested function calls and parentheses properly.
     *
     * Example:
     * "ema(3, close(0)), 5, myfunc(1,2)"
     * → ["ema(3, close(0))", "5", "myfunc(1,2)"]
     */
    private split_arguments(arg_expr: string): string[] {
        const args: string[] = []; // Array to store split arguments
        let current = ""; // Current argument being built
        let depth = 0; // Tracks nesting level of parentheses

        for (let i = 0; i < arg_expr.length; i++) {
            const char = arg_expr[i]; // Get current character

            if (char === "," && depth === 0) {
                // Found argument separator at top level
                args.push(current.trim()); // Add completed argument to array
                current = ""; // Reset current argument
            } else {
                if (char === "(") depth++; // Increase depth when opening parenthesis found
                if (char === ")") depth--; // Decrease depth when closing parenthesis found
                current += char; // Add character to current argument
            }
        }

        if (current.trim()) {
            // Add final argument if not empty
            args.push(current.trim());
        }

        return args; // Return array of split arguments
    }
}

/**
 * Sample Expressions
 * ema(2, 3) + ema(7, close(0)) > 100
 * ema(2, 3) + ema(7, close(0)) > ema(9, close(0))
 * rsi(14, 1) > 50 + current_price()
 * my_function(1, 2, 3)
 * avg(1, 2, 3)
 */
