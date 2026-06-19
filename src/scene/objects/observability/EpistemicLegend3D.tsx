import { Html } from "@react-three/drei";
import {
  EPISTEMIC_CATEGORY_META,
  type EpistemicCategory,
  type EpistemicFogFilter
} from "../../../observability/epistemicScoring";

type EpistemicCounts = Record<EpistemicCategory | "total", number>;

const FILTERS: Array<{ filter: EpistemicFogFilter; label: string }> = [
  { filter: "all", label: "All" },
  { filter: "unknown", label: "Unknown" },
  { filter: "untested", label: "Untested" },
  { filter: "risky", label: "Risky" }
];

const COUNT_CATEGORIES: EpistemicCategory[] = [
  "diagnostic_error",
  "changed_unvalidated",
  "agent_context_missing",
  "missing_tests",
  "runtime_unobserved",
  "heuristic_only"
];

export function EpistemicLegend3D({
  counts,
  filter,
  visibleCount,
  hiddenCount,
  runtimeObserved,
  onFilter,
  onHide
}: {
  counts: EpistemicCounts;
  filter: EpistemicFogFilter;
  visibleCount: number;
  hiddenCount: number;
  runtimeObserved: boolean;
  onFilter: (filter: EpistemicFogFilter) => void;
  onHide: () => void;
}) {
  return (
    <Html transform position={[-5.86, 2.36, -0.35]} rotation={[0, 0.62, 0]} className="scene-html epistemic-fog-legend">
      <header>
        <div>
          <span>What the system does not know</span>
          <strong>Epistemic Fog</strong>
        </div>
        <button onClick={onHide}>Hide</button>
      </header>

      <div className="epistemic-filter-row">
        {FILTERS.map((item) => (
          <button key={item.filter} className={filter === item.filter ? "is-active" : ""} onClick={() => onFilter(item.filter)}>
            {item.label}
          </button>
        ))}
      </div>

      <dl>
        <div>
          <dt>Files scored</dt>
          <dd>{counts.total}</dd>
        </div>
        <div>
          <dt>Visible</dt>
          <dd>{visibleCount}</dd>
        </div>
        <div>
          <dt>Hidden cap</dt>
          <dd>{hiddenCount}</dd>
        </div>
        <div>
          <dt>Validated</dt>
          <dd>{counts.validated}</dd>
        </div>
      </dl>

      <ol>
        {COUNT_CATEGORIES.map((category) => (
          <li key={category}>
            <i style={{ background: EPISTEMIC_CATEGORY_META[category].color }} />
            <span>{EPISTEMIC_CATEGORY_META[category].label}</span>
            <b>{counts[category]}</b>
          </li>
        ))}
      </ol>

      <p className={runtimeObserved ? "epistemic-runtime-ok" : "epistemic-runtime-missing"}>
        {runtimeObserved ? "Runtime evidence comes from the selected imported trace." : "Runtime coverage is missing/unobserved, not assumed."}
      </p>
    </Html>
  );
}
