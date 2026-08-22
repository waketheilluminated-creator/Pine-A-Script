"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  CandlestickSeries, ColorType, createChart, LineSeries,
  type CandlestickData, type IChartApi, type ISeriesApi,
  type LineData, type Time, type UTCTimestamp,
} from "lightweight-charts";
import { savePineSource, usePineSource } from "./pine-source";

type Candle = CandlestickData<Time> & { volume?: number };
type Interval = "1" | "5" | "15" | "60" | "240" | "D";
type Derivatives = {
  openInterestValue: number | null; openInterestAmount: number | null;
  fundingRate: number | null; markPrice: number | null; indexPrice: number | null;
  nextFundingTimestamp: number | null; exchange: string; updatedAt: number;
};
type PinePlot = { title?: string; data?: (number | null)[] };
type AIMessage = { id: number; role: "user" | "assistant"; content: string };

const INTERVALS: { label: string; value: Interval }[] = [
  { label: "1m", value: "1" }, { label: "5m", value: "5" }, { label: "15m", value: "15" },
  { label: "1H", value: "60" }, { label: "4H", value: "240" }, { label: "1D", value: "D" },
];
const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"];

function formatPrice(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value >= 1000
    ? value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}
function formatCompact(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}
function toCandle(row: string[]): Candle {
  return { time: (Number(row[0]) / 1000) as UTCTimestamp, open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) };
}
function calculateEma(candles: Candle[], length: number): LineData<Time>[] {
  if (!candles.length) return [];
  const multiplier = 2 / (length + 1);
  let ema = candles[0].close;
  return candles.map((candle, index) => {
    ema = index === 0 ? candle.close : candle.close * multiplier + ema * (1 - multiplier);
    return { time: candle.time, value: ema };
  });
}

export function TradingWorkspace() {
  const chartHost = useRef<HTMLDivElement>(null);
  const editorBodyRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const fastSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const slowSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setInterval] = useState<Interval>("15");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showFast, setShowFast] = useState(true);
  const [showSlow, setShowSlow] = useState(true);
  const [activeTab, setActiveTab] = useState<"pine" | "console">("pine");
  const pine = usePineSource();
  const [consoleText, setConsoleText] = useState("Ready. Pine Script v5 subset loaded.");
  const [consoleKind, setConsoleKind] = useState<"normal" | "success" | "error">("normal");
  const [running, setRunning] = useState(false);
  const [derivatives, setDerivatives] = useState<Derivatives | null>(null);
  const [exchange, setExchange] = useState<"bybit" | "binance" | "okx">("bybit");
  const [alerts, setAlerts] = useState<{ id: number; direction: "above" | "below"; price: number; triggered: boolean }[]>([]);
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [alertDirection, setAlertDirection] = useState<"above" | "below">("above");
  const [alertPrice, setAlertPrice] = useState("");
  const [pinePlots, setPinePlots] = useState<PinePlot[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiEndpoint, setAiEndpoint] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiKey, setAiKey] = useState("");
  const [aiQuestion, setAiQuestion] = useState("Analyze the current market structure and identify the most important risk signals.");
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiError, setAiError] = useState("");
  const [panelHeight, setPanelHeight] = useState(245);
  const [consoleWidth, setConsoleWidth] = useState(260);

  const last = candles.at(-1);
  const first = candles.at(0);
  const change = last && first ? ((last.close - first.open) / first.open) * 100 : 0;
  const lineCount = useMemo(() => pine.split("\n").map((_, i) => i + 1).join("\n"), [pine]);

  const openPineEditorTab = () => {
    savePineSource(pine);
    window.open("/pine-editor", "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    if (!chartHost.current) return;
    const chart = createChart(chartHost.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#0b1017" }, textColor: "#748094", fontFamily: "var(--font-geist-mono)", fontSize: 10 },
      grid: { vertLines: { color: "#17202b" }, horzLines: { color: "#17202b" } },
      rightPriceScale: { borderColor: "#27313f", scaleMargins: { top: 0.09, bottom: 0.08 } },
      timeScale: { borderColor: "#27313f", timeVisible: true, secondsVisible: false, rightOffset: 8, barSpacing: 7 },
      crosshair: { vertLine: { color: "#59677a", width: 1, labelBackgroundColor: "#344154" }, horzLine: { color: "#59677a", width: 1, labelBackgroundColor: "#344154" } },
      handleScale: true, handleScroll: true,
    });
    const candleSeries = chart.addSeries(CandlestickSeries, { upColor: "#53c990", downColor: "#e76770", wickUpColor: "#53c990", wickDownColor: "#e76770", borderVisible: false });
    const fastSeries = chart.addSeries(LineSeries, { color: "#62d6e8", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    const slowSeries = chart.addSeries(LineSeries, { color: "#f2c66d", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    chartRef.current = chart; candleSeriesRef.current = candleSeries; fastSeriesRef.current = fastSeries; slowSeriesRef.current = slowSeries;
    return () => { chart.remove(); chartRef.current = null; };
  }, []);

  useEffect(() => {
    candleSeriesRef.current?.setData(candles);
    fastSeriesRef.current?.setData(showFast ? calculateEma(candles, 9) : []);
    slowSeriesRef.current?.setData(showSlow ? calculateEma(candles, 21) : []);
  }, [candles, showFast, showSlow]);

  useEffect(() => {
    let cancelled = false;
    fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=300`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Market request failed (${response.status})`)))
      .then((payload) => {
        if (cancelled || payload.retCode !== 0) return;
        setCandles((payload.result.list as string[][]).map(toCandle).reverse()); setLoading(false);
        requestAnimationFrame(() => chartRef.current?.timeScale().fitContent());
      })
      .catch((error) => { if (!cancelled) { setLoading(false); setConsoleKind("error"); setConsoleText(error.message); } });

    const socket = new WebSocket("wss://stream.bybit.com/v5/public/linear");
    socket.onopen = () => { socket.send(JSON.stringify({ op: "subscribe", args: [`kline.${interval}.${symbol}`] })); setConnected(true); };
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data); const item = message.data?.[0];
      if (!item?.start) return;
      const next: Candle = { time: (item.start / 1000) as UTCTimestamp, open: Number(item.open), high: Number(item.high), low: Number(item.low), close: Number(item.close), volume: Number(item.volume) };
      setCandles((current) => current.length && current.at(-1)?.time === next.time ? [...current.slice(0, -1), next] : [...current.slice(-499), next]);
    };
    socket.onclose = () => setConnected(false); socket.onerror = () => setConnected(false);
    const heartbeat = window.setInterval(() => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ op: "ping" })), 20000);
    return () => { cancelled = true; clearInterval(heartbeat); socket.close(); };
  }, [symbol, interval]);

  useEffect(() => {
    let active = true;
    const load = () => fetch(`/api/derivatives?exchange=${exchange}&symbol=${encodeURIComponent(symbol.replace("USDT", "/USDT:USDT"))}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("Derivatives feed unavailable")))
      .then((data) => { if (active) setDerivatives(data); })
      .catch(() => { if (active) setDerivatives(null); });
    load(); const timer = window.setInterval(load, 30000);
    return () => { active = false; clearInterval(timer); };
  }, [symbol, exchange]);

  useEffect(() => {
    const price = last?.close;
    if (!price) return;
    const timer = window.setTimeout(() => setAlerts((items) => items.map((alert) => {
        if (alert.triggered) return alert;
        const hit = alert.direction === "above" ? price >= alert.price : price <= alert.price;
        if (hit && "Notification" in window && Notification.permission === "granted") {
          new Notification(`${symbol} price alert`, { body: `${formatPrice(price)} crossed ${alert.direction} ${formatPrice(alert.price)}` });
        }
        return hit ? { ...alert, triggered: true } : alert;
      })), 0);
    return () => clearTimeout(timer);
  }, [last?.close, symbol]);

  const runPine = useCallback(async () => {
    setRunning(true);
    try {
      const { transpile } = await import("@/lib/pine/transpiler.js");
      const result = transpile(pine);
      if (!result.success || !result.code) throw new Error(result.error || "Pine compilation failed");
      const moduleUrl = URL.createObjectURL(new Blob([result.code], { type: "text/javascript" }));
      try {
        const generatedScript = await import(/* @vite-ignore */ moduleUrl);
        const data = { open: candles.map((c) => c.open), high: candles.map((c) => c.high), low: candles.map((c) => c.low), close: candles.map((c) => c.close), volume: candles.map((c) => c.volume ?? 0), time: candles.map((c) => Number(c.time) * 1000) };
        const analysisGlobals = globalThis as typeof globalThis & { open_interest: number | null; funding_rate: number | null; mark_price: number | null; index_price: number | null };
        analysisGlobals.open_interest = derivatives?.openInterestValue ?? null;
        analysisGlobals.funding_rate = derivatives?.fundingRate ?? null;
        analysisGlobals.mark_price = derivatives?.markPrice ?? null;
        analysisGlobals.index_price = derivatives?.indexPrice ?? null;
        const runtime = generatedScript.run(data);
        const plots = Object.values(runtime.plots || {}) as PinePlot[];
        setPinePlots(plots);
        const seriesData = (values: (number | null)[]) => values.map((value, i) => value == null ? null : { time: candles[i].time, value }).filter(Boolean) as LineData<Time>[];
        if (plots[0]?.data) fastSeriesRef.current?.setData(seriesData(plots[0].data));
        if (plots[1]?.data) slowSeriesRef.current?.setData(seriesData(plots[1].data));
        setConsoleKind("success"); setConsoleText(`Compiled successfully · ${candles.length} bars · ${plots.length} plot${plots.length === 1 ? "" : "s"} · ${runtime.alerts?.length || 0} alert events`);
      } finally { URL.revokeObjectURL(moduleUrl); }
    } catch (error) { setConsoleKind("error"); setConsoleText(error instanceof Error ? error.message : "Pine execution failed"); }
    finally { setRunning(false); }
  }, [pine, candles, derivatives]);

  const createAlert = () => {
    const price = Number(alertPrice); if (!Number.isFinite(price)) return;
    setAlerts((items) => [...items, { id: Date.now(), direction: alertDirection, price, triggered: false }]);
    setAlertPrice(""); setShowAlertForm(false);
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  };

  const startPanelResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const move = (pointer: PointerEvent) => setPanelHeight(Math.max(150, Math.min(window.innerHeight * 0.65, window.innerHeight - 28 - pointer.clientY)));
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop);
  };

  const startConsoleResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const move = (pointer: PointerEvent) => {
      const bounds = editorBodyRef.current?.getBoundingClientRect();
      if (bounds) setConsoleWidth(Math.max(180, Math.min(bounds.width * 0.62, bounds.right - pointer.clientX)));
    };
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop);
  };

  const resizePanelWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault(); setPanelHeight((height) => Math.max(150, Math.min(window.innerHeight * 0.65, height + (event.key === "ArrowUp" ? 20 : -20))));
  };

  const resizeConsoleWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault(); setConsoleWidth((width) => Math.max(180, Math.min(520, width + (event.key === "ArrowLeft" ? 20 : -20))));
  };

  const analyzeMarket = async () => {
    const question = aiQuestion.trim();
    if (!question || !aiEndpoint.trim() || !aiModel.trim()) {
      setAiError("Add a compatible endpoint and model ID, then enter a question.");
      return;
    }
    setAiRunning(true); setAiError("");
    setAiMessages((items) => [...items, { id: (items.at(-1)?.id ?? 0) + 1, role: "user", content: question }]);
    try {
      const ema9 = calculateEma(candles, 9);
      const ema21 = calculateEma(candles, 21);
      const context = {
        capturedAt: new Date().toISOString(),
        market: { symbol, venue: "bybit", contract: "USDT perpetual", timeframe: INTERVALS.find((item) => item.value === interval)?.label, lastPrice: last?.close ?? null },
        candles: candles.slice(-120).map((candle) => ({ time: new Date(Number(candle.time) * 1000).toISOString(), open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume ?? null })),
        indicators: {
          builtIn: { ema9: ema9.at(-1)?.value ?? null, ema21: ema21.at(-1)?.value ?? null, ema9Visible: showFast, ema21Visible: showSlow },
          customPine: { source: pine, plots: pinePlots.map((plot, index) => ({ title: plot.title || `Plot ${index + 1}`, recentValues: plot.data?.slice(-30) ?? [] })) },
        },
        derivatives: derivatives ? { sourceExchange: exchange, openInterestUsd: derivatives.openInterestValue, openInterestBase: derivatives.openInterestAmount, fundingRate: derivatives.fundingRate, markPrice: derivatives.markPrice, indexPrice: derivatives.indexPrice, nextFundingTimestamp: derivatives.nextFundingTimestamp } : null,
      };
      const response = await fetch("/api/ai/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: aiEndpoint, apiKey: aiKey, model: aiModel, question, context }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "AI analysis failed");
      setAiMessages((items) => [...items, { id: (items.at(-1)?.id ?? 0) + 1, role: "assistant", content: payload.analysis }]);
      setAiQuestion("");
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI analysis failed");
    } finally { setAiRunning(false); }
  };

  return (
    <main className="studio-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">π</span><span>πlab</span><small>crypto workspace</small></div>
        <div className="market-switcher"><span className="coin-badge">₿</span><div className="market-copy"><strong>{symbol.replace("USDT", " / USDT")}</strong><span>Perpetual · Bybit</span></div><span style={{ color: "var(--faint)" }}>⌄</span></div>
        <div className="top-actions"><button className="ghost-button" onClick={() => setShowAlertForm(true)}>＋ Alert</button><button className="ai-button" onClick={() => setAiOpen(true)}><span>✦</span> AI Analyst <em>LAB</em></button><button className="primary-button" onClick={runPine}>Run Pine</button></div>
      </header>

      <section className="workspace">
        <nav className="left-rail" aria-label="Chart tools">
          {[["＋", "Cursor"], ["╱", "Trend line"], ["⌁", "Brush"], ["T", "Text"], ["⌖", "Measure"]].map(([icon, title], i) => <button key={title} className={`tool-button ${i === 0 ? "active" : ""}`} title={title}>{icon}</button>)}
          <span className="rail-spacer" /><button className="tool-button" title="Settings">⚙</button>
        </nav>

        <section className="main-area" style={{ gridTemplateRows: `45px minmax(220px, 1fr) ${panelHeight}px` }}>
          <div className="chart-toolbar">
            <div className="toolbar-cluster">
              <select aria-label="Market" value={symbol} onChange={(e) => { setLoading(true); setSymbol(e.target.value); }} className="time-button" style={{ background: "transparent", border: 0 }}>
                {SYMBOLS.map((item) => <option key={item} value={item}>{item.replace("USDT", " / USDT")}</option>)}
              </select><span className="toolbar-separator" />
              {INTERVALS.map((item) => <button key={item.value} onClick={() => { setLoading(true); setInterval(item.value); }} className={`time-button ${interval === item.value ? "active" : ""}`}>{item.label}</button>)}
            </div>
            <div className="toolbar-cluster"><span className={`live-dot ${connected ? "online" : ""}`} /><span className="live-copy">{connected ? "Live" : "Connecting"}</span><span className="toolbar-separator" /><button className="time-button" onClick={() => chartRef.current?.timeScale().fitContent()}>Fit</button></div>
          </div>

          <div className="chart-stage">
            <div className="chart-legend">
              <div className="market-head"><h1>{symbol.replace("USDT", "/USDT")} Perpetual</h1><span className="exchange-pill">BYBIT</span></div>
              <div className="quote-line"><span className="price">{formatPrice(last?.close ?? null)}</span><span className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</span><span>H {formatPrice(last?.high ?? null)}</span><span>L {formatPrice(last?.low ?? null)}</span></div>
              {showFast && <div className="indicator-label"><i style={{ background: "var(--cyan)" }} />EMA 9</div>}
              {showSlow && <div className="indicator-label"><i style={{ background: "var(--amber)" }} />EMA 21</div>}
            </div>
            <div className="chart-canvas" ref={chartHost} />
            {loading && <div className="chart-loading">Loading market data…</div>}
          </div>

          <section className="bottom-panel">
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- ARIA separators become interactive when focusable and expose aria-valuenow. */}
            <div className="panel-resize-handle" role="separator" aria-label="Resize Pine editor panel" aria-orientation="horizontal" aria-valuemin={150} aria-valuemax={700} aria-valuenow={Math.round(panelHeight)} tabIndex={0} onPointerDown={startPanelResize} onKeyDown={resizePanelWithKeyboard} onDoubleClick={() => setPanelHeight(245)}><span /></div>
            <div className="panel-header"><div className="tabs"><button className={`tab-button ${activeTab === "pine" ? "active" : ""}`} onClick={() => setActiveTab("pine")}>Pine Editor</button><button className={`tab-button ${activeTab === "console" ? "active" : ""}`} onClick={() => setActiveTab("console")}>Console</button></div><div className="editor-actions"><button className="popout-button" aria-label="Open Pine editor in new tab" title="Open Pine editor in new tab" onClick={openPineEditorTab}>↗ New tab</button><button className="run-button" onClick={runPine} disabled={running}>{running ? "Running…" : "▶ Run on chart"}</button></div></div>
            <div className="editor-body" ref={editorBodyRef} style={{ gridTemplateColumns: `minmax(0, 1fr) 7px ${consoleWidth}px` }}>
              <div className="code-wrap"><pre className="line-numbers">{lineCount}</pre><textarea aria-label="Pine Script editor" className="code-editor" spellCheck={false} value={pine} onChange={(e) => savePineSource(e.target.value)} /></div>
              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- ARIA separators become interactive when focusable and expose aria-valuenow. */}
              <div className="editor-splitter" role="separator" aria-label="Resize compiler console" aria-orientation="vertical" aria-valuemin={180} aria-valuemax={520} aria-valuenow={Math.round(consoleWidth)} tabIndex={0} onPointerDown={startConsoleResize} onKeyDown={resizeConsoleWithKeyboard} onDoubleClick={() => setConsoleWidth(260)}><span /></div>
              <aside className="console"><strong>Compiler output</strong><span className={consoleKind === "normal" ? "" : consoleKind}>{consoleText}</span></aside>
            </div>
          </section>
        </section>

        <aside className="right-panel">
          <section className="side-section">
            <div className="section-title-row"><h2 className="section-kicker">Derivatives pulse</h2><select aria-label="Derivatives exchange" value={exchange} onChange={(event) => setExchange(event.target.value as "bybit" | "binance" | "okx")}><option value="bybit">Bybit</option><option value="binance">Binance</option><option value="okx">OKX</option></select></div>
            <div className="metric-grid">
              <div className="metric-card"><span>Open interest</span><strong>${formatCompact(derivatives?.openInterestValue ?? null)}</strong><small>{formatCompact(derivatives?.openInterestAmount ?? null)} {symbol.replace("USDT", "")}</small></div>
              <div className="metric-card"><span>Funding / 8h</span><strong className={(derivatives?.fundingRate ?? 0) >= 0 ? "positive" : "negative"}>{derivatives?.fundingRate == null ? "—" : `${(derivatives.fundingRate * 100).toFixed(4)}%`}</strong><small>{derivatives?.nextFundingTimestamp ? `Next ${new Date(derivatives.nextFundingTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Current rate"}</small></div>
              <div className="metric-card"><span>Mark price</span><strong>{formatPrice(derivatives?.markPrice ?? null)}</strong><small>Fair price</small></div>
              <div className="metric-card"><span>Basis</span><strong className={((derivatives?.markPrice ?? 0) - (derivatives?.indexPrice ?? 0)) >= 0 ? "positive" : "negative"}>{derivatives?.markPrice && derivatives?.indexPrice ? `${(((derivatives.markPrice - derivatives.indexPrice) / derivatives.indexPrice) * 100).toFixed(3)}%` : "—"}</strong><small>Mark vs index</small></div>
            </div>
            <div className="data-source"><span>Pine: open_interest · funding_rate</span><code>CCXT · {derivatives?.exchange || exchange}</code></div>
          </section>
          <section className="side-section">
            <h2 className="section-kicker">Indicators</h2>
            <div className="indicator-row"><div className="indicator-copy"><strong>EMA 9</strong><span>Built-in · close</span></div><button aria-label="Toggle EMA 9" className={`metric-toggle ${showFast ? "active" : ""}`} onClick={() => setShowFast(!showFast)} /></div>
            <div className="indicator-row"><div className="indicator-copy"><strong>EMA 21</strong><span>Built-in · close</span></div><button aria-label="Toggle EMA 21" className={`metric-toggle ${showSlow ? "active" : ""}`} onClick={() => setShowSlow(!showSlow)} /></div>
            <div className="indicator-row"><div className="indicator-copy"><strong>Custom Pine</strong><span>Editor output · overlay</span></div><button aria-label="Run custom Pine" className="metric-toggle active" onClick={runPine} /></div>
          </section>
          <section className="side-section">
            <h2 className="section-kicker">Alerts</h2>
            {alerts.length === 0 && <div style={{ color: "var(--faint)", fontSize: 10, lineHeight: 1.5 }}>No active alerts for this market.</div>}
            {alerts.map((alert) => <div className="alert-row" key={alert.id}><div className="alert-copy"><strong>{symbol} {alert.direction} {formatPrice(alert.price)}</strong><span className={alert.triggered ? "positive" : ""}>{alert.triggered ? "Triggered" : "Watching live price"}</span></div><button className="tool-button" style={{ width: 25, height: 25 }} onClick={() => setAlerts((items) => items.filter((item) => item.id !== alert.id))}>×</button></div>)}
            {showAlertForm ? <div className="alert-form"><select value={alertDirection} onChange={(e) => setAlertDirection(e.target.value as "above" | "below")}><option value="above">Crosses above</option><option value="below">Crosses below</option></select><input aria-label="Alert price" inputMode="decimal" placeholder={last ? formatPrice(last.close) : "Price"} value={alertPrice} onChange={(e) => setAlertPrice(e.target.value)} /><button onClick={createAlert}>Create price alert</button></div> : <button className="add-alert" onClick={() => setShowAlertForm(true)}>＋ Create alert</button>}
          </section>
        </aside>
      </section>
      {aiOpen && <button className="ai-backdrop" aria-label="Close AI Analyst" onClick={() => setAiOpen(false)} />}
      <aside className={`ai-drawer ${aiOpen ? "open" : ""}`} aria-hidden={!aiOpen} aria-label="πlab AI Analyst">
        <div className="ai-header">
          <div><span className="ai-orb">✦</span><strong>πlab AI Analyst</strong><small>Experimental · current chart context</small></div>
          <button aria-label="Close AI Analyst" onClick={() => setAiOpen(false)}>×</button>
        </div>
        <div className="ai-context-strip">
          <span>{symbol}</span><span>{INTERVALS.find((item) => item.value === interval)?.label}</span><span>{candles.length} candles</span><span>{pinePlots.length || 2} indicators</span>
        </div>
        <section className="ai-connection">
          <div className="ai-section-title"><span>Model connection</span><code>OpenAI-compatible</code></div>
          <label>Endpoint<input type="url" placeholder="https://your-host/v1/chat/completions" value={aiEndpoint} onChange={(event) => setAiEndpoint(event.target.value)} /></label>
          <div className="ai-field-row">
            <label>Model ID<input placeholder="your-model-id" value={aiModel} onChange={(event) => setAiModel(event.target.value)} /></label>
            <label>API key<input type="password" autoComplete="off" placeholder="Session only" value={aiKey} onChange={(event) => setAiKey(event.target.value)} /></label>
          </div>
          <p>The key stays in this browser session and is sent only when you analyze.</p>
        </section>
        <div className="ai-messages" aria-live="polite">
          {aiMessages.length === 0 && <div className="ai-empty"><span>✦</span><strong>Chart context is ready</strong><p>The model receives 120 recent OHLCV candles, EMA outputs, custom Pine plots, open interest, funding, mark price, and index price.</p></div>}
          {aiMessages.map((message) => <article key={message.id} className={`ai-message ${message.role}`}><small>{message.role === "assistant" ? "πlab AI" : "You"}</small><div>{message.content}</div></article>)}
          {aiRunning && <article className="ai-message assistant thinking"><small>πlab AI</small><div><i /><i /><i /> Analyzing chart context…</div></article>}
        </div>
        <div className="ai-composer">
          <div className="ai-quick-prompts"><button onClick={() => setAiQuestion("What is the current trend, momentum, and likely invalidation level?")}>Trend</button><button onClick={() => setAiQuestion("Do funding and open interest confirm or contradict the price move?")}>OI + funding</button><button onClick={() => setAiQuestion("Explain the current Pine indicator outputs and any conflicts between them.")}>Indicators</button></div>
          <textarea aria-label="Ask AI about the current chart" placeholder="Ask about this chart…" value={aiQuestion} onChange={(event) => setAiQuestion(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") analyzeMarket(); }} />
          {aiError && <div className="ai-error">{aiError}</div>}
          <div className="ai-send-row"><span>⌘ Enter to send · analysis only</span><button onClick={analyzeMarket} disabled={aiRunning}>{aiRunning ? "Analyzing…" : "Analyze current chart"}</button></div>
        </div>
      </aside>
      <footer className="footer"><div className="status-group"><span className="tiny-dot" /><span>Bybit public feed</span><span>CCXT normalized</span><span>Pine v5 subset</span><span>AI context ready</span></div><span>UTC · Data for analysis only</span></footer>
    </main>
  );
}
