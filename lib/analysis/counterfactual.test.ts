import { describe, expect, it } from "vitest";
import { counterfactualReport } from "@/lib/analysis/counterfactual";
import { sampleBook } from "@/lib/ingest/demo";
import type { RoundTrip } from "@/lib/types";

describe("counterfactualReport", () => {
  it("ranks scenarios with recovered dollars on the sample book", () => {
    const trades = sampleBook("axiom").trades;
    const report = counterfactualReport(trades);
    expect(report.actualNetUsd).toBeCloseTo(
      trades.reduce((sum, trade) => sum + trade.pnlUsd, 0),
      1,
    );
    expect(report.scenarios.length).toBeGreaterThan(0);
    expect(report.best).not.toBeNull();
    expect(report.best!.sample).toBeGreaterThanOrEqual(3);
    for (const scenario of report.scenarios) {
      expect(scenario.replayEquity.length).toBeGreaterThan(0);
      expect(scenario.recoveredUsd).toBeCloseTo(scenario.replayNetUsd - scenario.actualNetUsd, 2);
    }
  });

  it("recovers the full loss when every revenge ticket is skipped", () => {
    const base = sampleBook("axiom").trades[0];
    const pairs: RoundTrip[] = [];
    for (let index = 0; index < 3; index += 1) {
      const day = String(index + 1).padStart(2, "0");
      pairs.push({
        ...base,
        id: `loss-${index}`,
        symbol: `L${index}`,
        entryAt: `2025-10-${day}T14:00:00.000Z`,
        exitAt: `2025-10-${day}T14:10:00.000Z`,
        amountUsd: 150,
        pnlUsd: -40,
        pnlPct: -26,
      });
      pairs.push({
        ...base,
        id: `revenge-${index}`,
        symbol: `R${index}`,
        entryAt: `2025-10-${day}T14:20:00.000Z`,
        exitAt: `2025-10-${day}T14:25:00.000Z`,
        amountUsd: 400,
        pnlUsd: -120,
        pnlPct: -30,
      });
    }
    const pad: RoundTrip[] = Array.from({ length: 6 }, (_, index) => ({
      ...base,
      id: `pad-${index}`,
      symbol: `P${index}`,
      entryAt: `2025-10-1${index}T16:00:00.000Z`,
      exitAt: `2025-10-1${index}T16:15:00.000Z`,
      amountUsd: 150,
      pnlUsd: 10,
      pnlPct: 6,
    }));
    const report = counterfactualReport([...pairs, ...pad]);
    const skipRevenge = report.scenarios.find((scenario) => scenario.id === "skip-revenge");
    expect(skipRevenge).toBeDefined();
    expect(skipRevenge!.skippedTradeIds).toEqual(expect.arrayContaining(["revenge-0", "revenge-1", "revenge-2"]));
    expect(skipRevenge!.recoveredUsd).toBeCloseTo(360, 1);
    expect(skipRevenge!.replayNetUsd).toBeCloseTo(report.actualNetUsd + 360, 1);
  });

  it("scales oversized tickets linearly when capping size", () => {
    const base = sampleBook("axiom").trades[0];
    const winners: RoundTrip[] = Array.from({ length: 5 }, (_, index) => ({
      ...base,
      id: `win-${index}`,
      symbol: `W${index}`,
      entryAt: `2025-10-0${index + 1}T15:00:00.000Z`,
      exitAt: `2025-10-0${index + 1}T15:20:00.000Z`,
      entryMarketCapUsd: 30_000,
      amountUsd: 150,
      pnlUsd: 40,
      pnlPct: 26,
    }));
    const losers: RoundTrip[] = Array.from({ length: 5 }, (_, index) => ({
      ...base,
      id: `big-${index}`,
      symbol: `B${index}`,
      entryAt: `2025-10-1${index}T15:00:00.000Z`,
      exitAt: `2025-10-1${index}T15:10:00.000Z`,
      entryMarketCapUsd: 40_000,
      amountUsd: 800,
      pnlUsd: -200,
      pnlPct: -25,
    }));
    const report = counterfactualReport([...winners, ...losers]);
    const cap = report.scenarios.find((scenario) => scenario.id === "cap-size");
    expect(cap).toBeDefined();
    expect(cap!.resizedTradeIds.length).toBeGreaterThanOrEqual(3);
    expect(cap!.recoveredUsd).toBeGreaterThan(0);
    expect(cap!.replayNetUsd).toBeGreaterThan(cap!.actualNetUsd);
  });
});
