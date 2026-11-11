"use client";

import { EquityChart } from "@/components/equity-chart";
import { fmtUsd } from "@/lib/format";
import type { CounterfactualReport, ScenarioImpact } from "@/lib/types";

export function MistakeCost({
  report,
  onShowTrades,
}: {
  report: CounterfactualReport;
  onShowTrades: (ids: string[], label: string) => void;
}) {
  if (report.scenarios.length === 0) {
    return (
      <section className="section" id="mistake-cost">
        <div className="section-head">
          <h2>Mistake cost</h2>
          <p>Historical replays need at least three trades in a leak class before a scenario clears the bar.</p>
        </div>
      </section>
    );
  }

  const best = report.best;
  return (
    <section className="section" id="mistake-cost">
      <div className="section-head">
        <h2>Mistake cost</h2>
        <p>
          What the book would look like if a leak rule had been followed. These are historical simulations on
          recorded fills — not claims about fills you could still get.
        </p>
      </div>

      {best ? (
        <div className="mistake-hero">
          <div className="stat-row mistake-stats">
            <div className="stat">
              <span className="kicker">Actual net</span>
              <b className={report.actualNetUsd < 0 ? "bad" : report.actualNetUsd > 0 ? "good" : ""}>
                {fmtUsd(report.actualNetUsd)}
              </b>
            </div>
            <div className="stat">
              <span className="kicker">Best replay</span>
              <b className={best.replayNetUsd < 0 ? "bad" : best.replayNetUsd > 0 ? "good" : ""}>
                {fmtUsd(best.replayNetUsd)}
              </b>
            </div>
            <div className="stat">
              <span className="kicker">Recovered if followed</span>
              <b className={best.recoveredUsd > 0 ? "good" : best.recoveredUsd < 0 ? "bad" : ""}>
                {fmtUsd(best.recoveredUsd)}
              </b>
            </div>
          </div>
          <p className="note">
            Top scenario: <strong>{best.title}</strong> across {best.sample} trades.
          </p>
          {best.replayEquity.length >= 2 ? (
            <div className="mistake-charts">
              <div>
                <h3 className="feed-title">Actual equity</h3>
                <EquityChart points={best.actualEquity} />
              </div>
              <div>
                <h3 className="feed-title">Replay equity</h3>
                <EquityChart points={best.replayEquity} />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="play-grid">
        {report.scenarios.map((scenario) => (
          <ScenarioCard key={scenario.id} scenario={scenario} onShowTrades={onShowTrades} />
        ))}
      </div>
    </section>
  );
}

function ScenarioCard({
  scenario,
  onShowTrades,
}: {
  scenario: ScenarioImpact;
  onShowTrades: (ids: string[], label: string) => void;
}) {
  const ids = [...scenario.skippedTradeIds, ...scenario.resizedTradeIds];
  return (
    <article className="play fix">
      <p className="kicker">{scenario.id.replaceAll("-", " ")}</p>
      <h3>{scenario.title}</h3>
      <p className="rule">
        Recovered <strong className={scenario.recoveredUsd > 0 ? "good" : scenario.recoveredUsd < 0 ? "bad" : ""}>{fmtUsd(scenario.recoveredUsd)}</strong>
        {" · "}
        replay {fmtUsd(scenario.replayNetUsd)} vs actual {fmtUsd(scenario.actualNetUsd)}
      </p>
      <p className="evidence">{scenario.detail}</p>
      {ids.length > 0 ? (
        <button type="button" className="ghost" onClick={() => onShowTrades(ids, scenario.title)}>
          Show {ids.length} affected trade{ids.length === 1 ? "" : "s"}
        </button>
      ) : null}
    </article>
  );
}
