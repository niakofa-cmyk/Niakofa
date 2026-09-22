import { RESEARCH_CONFIDENCE, type ResearchConfidence } from "@/lib/diaspora/researchCaseStatus";

const LABELS: Record<ResearchConfidence, string> = {
  unreviewed: "Unreviewed",
  possible: "Possible",
  supported: "Supported by multiple sources",
  strong: "Strong",
};

export function EvidenceConfidenceSelect({
  value,
  onChange,
  disabled,
}: {
  value: ResearchConfidence;
  onChange: (value: ResearchConfidence) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block text-xs text-white/50">
      Evidence confidence
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as ResearchConfidence)}
        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm disabled:opacity-40"
      >
        {RESEARCH_CONFIDENCE.map((confidence) => (
          <option key={confidence} value={confidence}>
            {LABELS[confidence]}
          </option>
        ))}
      </select>
    </label>
  );
}