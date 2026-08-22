import type { Metadata } from "next";
import { TradingWorkspace } from "./trading-workspace";

export const metadata: Metadata = {
  title: "Pine Studio — Live crypto charting",
  description: "Live perpetual charts, Pine indicators, derivatives data, and alerts.",
};

export default function Home() {
  return <TradingWorkspace />;
}
