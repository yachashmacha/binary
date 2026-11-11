import { fomoStatus } from "@/lib/analysis/fomo";
import { MC_CUTS, SIZE_CUTS, bestSplit, revengeIds } from "@/lib/analysis/slices";
import { money, net } from "@/lib/analysis/stats";
import { fmtMc, fmtUsd, fmtUsdPlain } from "@/lib/format";
import type { CounterfactualReport, EquityPoint, RoundTrip, ScenarioImpact } from "@/lib/types";

export type ScenarioId =
  | "skip-revenge"
  | "cap-size"
  | "skip-high-mc"
  | "skip-fomo"
  | "follow-top-leaks";

const MIN_SAMPLE = 3;

/**
 * Historical “what if” replays of the closed book.
 *
 * These are simulations on recorded fills — not achievable fills with the same
 * path dependence, fees, or liquidity. Each scenario applies one discipline
 * (skip a leak class, or cap size) and recomputes net P&L plus equity.
 */
export function counterfactualReport(trades: RoundTrip[]): CounterfactualReport {
  const ordered = chronological(trades);
  const actualNetUsd = money(net(ordered));
  const actualEquity = equityCurve(ordered);
  const scenarios: ScenarioImpact[] = [];

  const revenge = revengeIds(ordered);
  scenarios.push(
    buildSkipScenario({
      id: "skip-revenge",
      title: "Skip revenge size-ups",
      reason: "Larger tickets within 30 minutes of a usual-size loss",
      ordered,
      actualNetUsd,
      actualEquity,
      skipIds: revenge,
    }),
  );

  const size = bestSplit(ordered, (trade) => trade.amountUsd, SIZE_CUTS);
  if (size) {
    scenarios.push(
      buildResizeScenario({
        id: "cap-size",
        title: `Cap size at ${fmtUsdPlain(size.cut)}`,
        detail: `Trades at or above ${fmtUsdPlain(size.cut)} are scaled to that ticket. P&L scales with size; the same fill path is assumed.`,
        ordered,
        actualNetUsd,
        actualEquity,
        capUsd: size.cut,
        resizeIds: new Set(size.bad.map((trade) => trade.id)),
      }),
    );
  }

  const mc = bestSplit(ordered, (trade) => trade.entryMarketCapUsd, MC_CUTS);
  if (mc) {
    scenarios.push(
      buildSkipScenario({
        id: "skip-high-mc",
        title: `Skip entries at ${fmtMc(mc.cut)}+`,
        reason: `Entries at or above ${fmtMc(mc.cut)} market cap`,
        ordered,
        actualNetUsd,
        actualEquity,
        skipIds: new Set(mc.bad.map((trade) => trade.id)),
      }),
    );
  }

  const fomoIds = new Set(
    ordered.filter((trade) => fomoStatus(trade) === "yes").map((trade) => trade.id),
  );
  scenarios.push(
    buildSkipScenario({
      id: "skip-fomo",
      title: "Skip FOMO fades",
      reason: "Buys where volume and market cap both faded in the minutes after entry",
      ordered,
      actualNetUsd,
      actualEquity,
      skipIds: fomoIds,
    }),
  );

  const combined = new Set<string>([...revenge, ...fomoIds]);
  if (mc) for (const trade of mc.bad) combined.add(trade.id);
  scenarios.push(
    buildSkipScenario({
      id: "follow-top-leaks",
      title: "Follow the top leak rules together",
      reason: "Skip revenge size-ups, FOMO fades, and the high market-cap band when that split exists",
      ordered,
      actualNetUsd,
      actualEquity,
      skipIds: combined,
    }),
  );

  const ranked = scenarios
    .filter((scenario) => scenario.sample >= MIN_SAMPLE)
    .sort((a, b) => b.recoveredUsd - a.recoveredUsd || b.sample - a.sample);
  return {
    scenarios: ranked,
    best: ranked[0] ?? null,
    actualNetUsd,
  };
}

function buildSkipScenario(input: {
  id: ScenarioId;
  title: string;
  reason: string;
  ordered: RoundTrip[];
  actualNetUsd: number;
  actualEquity: EquityPoint[];
  skipIds: Set<string>;
}): ScenarioImpact {
  const skipped = input.ordered.filter((trade) => input.skipIds.has(trade.id));
  const kept = input.ordered.filter((trade) => !input.skipIds.has(trade.id));
  const replayNetUsd = money(net(kept));
  const recoveredUsd = money(replayNetUsd - input.actualNetUsd);
  const skippedNet = money(net(skipped));
  return {
    id: input.id,
    title: input.title,
    detail: `${input.reason}. ${skipped.length} trade${skipped.length === 1 ? "" : "s"} removed (${fmtUsd(skippedNet)} on those fills). Replay assumes those tickets were never taken — not that a better fill replaced them.`,
    skippedTradeIds: skipped.map((trade) => trade.id),
    resizedTradeIds: [],
    actualNetUsd: input.actualNetUsd,
    replayNetUsd,
    recoveredUsd,
    actualEquity: input.actualEquity,
    replayEquity: equityCurve(kept),
    sample: skipped.length,
  };
}

function buildResizeScenario(input: {
  id: ScenarioId;
  title: string;
  detail: string;
  ordered: RoundTrip[];
  actualNetUsd: number;
  actualEquity: EquityPoint[];
  capUsd: number;
  resizeIds: Set<string>;
}): ScenarioImpact {
  const resized = input.ordered.filter((trade) => input.resizeIds.has(trade.id) && trade.amountUsd > input.capUsd);
  const replay = input.ordered.map((trade) => {
    if (!input.resizeIds.has(trade.id) || !(trade.amountUsd > input.capUsd)) return trade;
    const scale = input.capUsd / trade.amountUsd;
    return {
      ...trade,
      amountUsd: money(input.capUsd),
      pnlUsd: money(trade.pnlUsd * scale),
    };
  });
  const replayNetUsd = money(net(replay));
  return {
    id: input.id,
    title: input.title,
    detail: input.detail,
    skippedTradeIds: [],
    resizedTradeIds: resized.map((trade) => trade.id),
    actualNetUsd: input.actualNetUsd,
    replayNetUsd,
    recoveredUsd: money(replayNetUsd - input.actualNetUsd),
    actualEquity: input.actualEquity,
    replayEquity: equityCurve(replay),
    sample: resized.length,
  };
}

function chronological(trades: RoundTrip[]): RoundTrip[] {
  return [...trades].sort((a, b) => a.exitAt.localeCompare(b.exitAt) || a.id.localeCompare(b.id));
}

function equityCurve(trades: RoundTrip[]): EquityPoint[] {
  let running = 0;
  return chronological(trades).map((trade) => {
    running = money(running + trade.pnlUsd);
    return { at: trade.exitAt, pnl: running };
  });
}
