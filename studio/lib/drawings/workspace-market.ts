export const CHART_MARKET_VENUE = "bybit" as const;

export type ChartDrawingMarket = Readonly<{
  venue: typeof CHART_MARKET_VENUE;
  symbol: string;
}>;

export function chartDrawingMarket(symbol: string): ChartDrawingMarket {
  return { venue: CHART_MARKET_VENUE, symbol };
}
