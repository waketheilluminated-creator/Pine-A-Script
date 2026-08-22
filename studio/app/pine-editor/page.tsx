import type { Metadata } from "next";
import { PineEditorTab } from "./pine-editor-tab";

export const metadata: Metadata = {
  title: "Pine Editor — πlab",
  description: "A focused Pine Script editing tab synchronized with the πlab chart workspace.",
};

export default function PineEditorPage() {
  return <PineEditorTab />;
}
