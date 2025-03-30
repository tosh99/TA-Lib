export interface Candle {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}
export interface IHeikinAshi extends Candle {
    [key: string]: any;
}

export type BollingerBands = {
  middle: number[];
  upper: number[];
  lower: number[];
};
