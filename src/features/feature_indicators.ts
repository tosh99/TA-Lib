import {stats_ema, stats_mean} from "./feature_statistics";
import {ISanitizedOHLC, IOHLC, BollingerBands} from "../types/types_ohlc";
import {sanitize_ohlc} from "./feature_ohlc";
import round from "lodash.round";

export const indi_adx = (ohlc_data: IOHLC[], period: number): number[] => {
    const trueRanges: number[] = [];
    const positiveDMs: number[] = [];
    const negativeDMs: number[] = [];
    const dxValues: number[] = [];
    const adxValues: number[] = [];
    const sanitized_ohlc: ISanitizedOHLC[] = sanitize_ohlc(ohlc_data);

    // Calculate True Range (TR), Positive Directional Movement (+DM), Negative Directional Movement (-DM)
    for (let i = 1; i < sanitized_ohlc.length; i++) {
        const currentHigh = sanitized_ohlc[i].high;
        const currentLow = sanitized_ohlc[i].low;
        const previousClose = sanitized_ohlc[i - 1].close;

        const trueRange = Math.max(currentHigh - currentLow, Math.abs(currentHigh - previousClose), Math.abs(currentLow - previousClose));

        trueRanges.push(trueRange);

        const positiveDM = currentHigh - sanitized_ohlc[i - 1].high;
        const negativeDM = sanitized_ohlc[i - 1].low - currentLow;

        positiveDMs.push(positiveDM > 0 ? positiveDM : 0);
        negativeDMs.push(negativeDM > 0 ? negativeDM : 0);
    }

    // Calculate the smoothed average of True Range (ATR)
    const atrValues = calculateSmoothedAverage(trueRanges, period);

    // Calculate the smoothed averages of Positive Directional Movement (+DM) and Negative Directional Movement (-DM)
    const positiveDMMAs = calculateSmoothedAverage(positiveDMs, period);
    const negativeDMMAs = calculateSmoothedAverage(negativeDMs, period);

    // Calculate the Directional Movement Index (DX) and ADX
    for (let i = period; i < sanitized_ohlc.length - 1; i++) {
        const diPlus = (positiveDMMAs[i - period] / atrValues[i - period]) * 100;
        const diMinus = (negativeDMMAs[i - period] / atrValues[i - period]) * 100;

        const dx = (Math.abs(diPlus - diMinus) / (diPlus + diMinus)) * 100;
        dxValues.push(dx);

        if (dxValues.length >= period) {
            const adx = calculateSmoothedAverage(dxValues, period)[dxValues.length - period];
            adxValues.push(adx);
        }
    }

    return adxValues;
};

export const indi_macd = (data: number[], shortPeriod: number = 12, longPeriod: number = 26, signalPeriod: number = 9): { macd: number[]; signal_line: number[] } => {
    // Calculate the short EMA
    const shortEMA = stats_ema(data, shortPeriod);

    // Calculate the long EMA
    const longEMA = stats_ema(data, longPeriod);

    // Calculate the MACD line
    const macdLine: number[] = [];
    for (let i = 0; i < data.length; i++) {
        macdLine.push(shortEMA[i] - longEMA[i]);
    }

    // Calculate the signal line using SMA of the MACD line
    const signalLine = stats_ema(macdLine, signalPeriod);

    // Return the MACD line and signal line
    return {
        macd: macdLine,
        signal_line: signalLine,
    };
};

export const indi_obv = (data: IOHLC[]): number[] => {
    const obvValues: number[] = [];
    obvValues.push(0); // Initialize OBV with zero as the starting value

    for (let i = 1; i < data.length; i++) {
        const currentClose = data[i].close;
        const previousClose = data[i - 1].close;
        const volume = parseInt(data[i].volume.toString());

        if (currentClose > previousClose) {
            // Add the volume to OBV if the current close price is higher than the previous close price
            obvValues.push(obvValues[i - 1] + volume);
        } else if (currentClose < previousClose) {
            // Subtract the volume from OBV if the current close price is lower than the previous close price
            obvValues.push(obvValues[i - 1] - volume);
        } else {
            // If the current close price is equal to the previous close price, keep the OBV value unchanged
            obvValues.push(obvValues[i - 1]);
        }
    }

    return obvValues;
};

export const indi_rsi = (data: number[], period: number = 7): number[] => {
    const gains: number[] = [];
    const losses: number[] = [];
    const rsi: number[] = [];

    // Calculate the price changes and separate gains and losses
    for (let i = 1; i < data.length; i++) {
        const change = data[i] - data[i - 1];

        if (change >= 0) {
            gains.push(change);
            losses.push(0);
        } else {
            gains.push(0);
            losses.push(-change);
        }
    }

    // Calculate the average gains and losses for the first period
    let avgGain = stats_mean(gains.slice(0, period));
    let avgLoss = stats_mean(losses.slice(0, period));

    // Calculate the initial RSI value
    let rs = avgGain / avgLoss;
    const initialRSI = 100 - 100 / (1 + rs);
    rsi.push(initialRSI);

    // Calculate RSI for the remaining data
    for (let i = period; i < data.length - 1; i++) {
        const currentGain = gains[i];
        const currentLoss = losses[i];

        // Smooth the average gains and losses using the previous averages
        avgGain = (avgGain * (period - 1) + currentGain) / period;
        avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

        rs = avgGain / avgLoss;
        const currentRSI = 100 - 100 / (1 + rs);
        rsi.push(currentRSI);
    }

    return rsi;
};

export const ind_alligator = (
    ohlc_data: IOHLC[],
    jawPeriod: number,
    teethPeriod: number,
    lipsPeriod: number,
): {
    jaw: number[];
    teeth: number[];
    lips: number[];
} => {
    const jawValues: number[] = [];
    const teethValues: number[] = [];
    const lipsValues: number[] = [];
    const sanitized_ohlc: ISanitizedOHLC[] = sanitize_ohlc(ohlc_data);

    for (let i = jawPeriod - 1; i < sanitized_ohlc.length; i++) {
        const jawStartIndex = i - jawPeriod + 1;
        const teethStartIndex = i - teethPeriod + 1;
        const lipsStartIndex = i - lipsPeriod + 1;

        const jawHighs = sanitized_ohlc.slice(jawStartIndex, i + 1).map((d) => d.high);
        const jawLowestHigh = Math.min(...jawHighs);
        jawValues.push(jawLowestHigh);

        const teethHighs = sanitized_ohlc.slice(teethStartIndex, i + 1).map((d) => d.high);
        const teethLowestHigh = Math.min(...teethHighs);
        teethValues.push(teethLowestHigh);

        const lipsHighs = sanitized_ohlc.slice(lipsStartIndex, i + 1).map((d) => d.high);
        const lipsLowestHigh = Math.min(...lipsHighs);
        lipsValues.push(lipsLowestHigh);
    }

    return {
        jaw: jawValues,
        teeth: teethValues,
        lips: lipsValues,
    };
};

export const ind_bollinger_bands = (data: IOHLC[], period: number = 20, multiplier: number = 2): BollingerBands => {
  const closePrices = data.map(d => round(Number(d.close), 2));
  const middle: number[] = [];
  const upper: number[] = [];
  const lower: number[] = [];

  function simpleMovingAverage(prices: number[], period: number, index: number): number {
    const slice = prices.slice(index - period, index);
    const sum = slice.reduce((acc, price) => acc + price, 0);
    return sum / period;
  }

  function standardDeviation(prices: number[], period: number, index: number, sma: number): number {
    const slice = prices.slice(index - period, index);
    const variance = slice.reduce((acc, price) => acc + Math.pow(price - sma, 2), 0) / period;
    return Math.sqrt(variance);
  }

  for (let i = period; i <= closePrices.length; i++) {
    const sma = simpleMovingAverage(closePrices, period, i);
    const stdDev = standardDeviation(closePrices, period, i, sma);

    middle.push(sma);
    upper.push(sma + multiplier * stdDev);
    lower.push(sma - multiplier * stdDev);
  }

  return { middle, upper, lower };
}

const calculateSmoothedAverage = (data: number[], period: number): number[] => {
    const smoothedData: number[] = [];

    const sum = data.slice(0, period).reduce((acc, val) => acc + val, 0);
    const average = sum / period;
    smoothedData.push(average);

    for (let i = period; i < data.length; i++) {
        const smoothedValue = (smoothedData[i - period] * (period - 1) + data[i]) / period;
        smoothedData.push(smoothedValue);
    }

    return smoothedData;
}
