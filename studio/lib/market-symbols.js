export const FALLBACK_MARKETS = [
  { symbol: "BTCUSDT", base: "BTC", quote: "USDT" },
  { symbol: "ETHUSDT", base: "ETH", quote: "USDT" },
  { symbol: "SOLUSDT", base: "SOL", quote: "USDT" },
  { symbol: "XRPUSDT", base: "XRP", quote: "USDT" },
];

export function normalizeBybitMarkets(payload) {
  const rows = Array.isArray(payload?.result?.list) ? payload.result.list : [];
  const unique = new Map();
  for (const row of rows) {
    if (row?.status !== "Trading" || row?.contractType !== "LinearPerpetual" || row?.quoteCoin !== "USDT") continue;
    if (!row.symbol || !row.baseCoin) continue;
    unique.set(row.symbol, { symbol: row.symbol, base: row.baseCoin, quote: row.quoteCoin });
  }
  return [...unique.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function searchMarkets(markets, query) {
  const normalized = query.toUpperCase().replace(/\s|\//g, "");
  if (!normalized) return markets;
  return markets.filter((market) => `${market.symbol}${market.base}${market.quote}`.includes(normalized));
}

export function nextRecentSymbols(recent, symbol, limit = 6) {
  return [symbol, ...recent.filter((item) => item !== symbol)].slice(0, limit);
}
