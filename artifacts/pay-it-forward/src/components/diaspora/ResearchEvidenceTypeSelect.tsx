import { RESEARCH_EVIDENCE_HELP, RESEARCH_EVIDENCE_LABELS, RESEARCH_EVIDENCE_TYPES, type ResearchEvidenceType } from "@/lib/diaspora/researchEvidence";

type Props = {
  value: ResearchEvidenceType;
  onChange: (value: ResearchEvidenceType) => void;
  disabled?: boolean;
};

export function ResearchEvidenceTypeSelect({ value, onChange, disabled }: Props) {
  return (
    <label className="block text-xs text-white/55">
      Evidence type
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as ResearchEvidenceType)}
        className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm text-white"
      >
        {RESEARCH_EVIDENCE_TYPES.map((type) => (
          <option key={type} value={type} className="bg-[#0b1917] text-white">
            {RESEARCH_EVIDENCE_LABELS[type]}
          </option>
        ))}
      </select>
      <span className="block mt-1 text-[11px] text-white/40">
        {RESEARCH_EVIDENCE_HELP[value]}
      </span>
    </label>
  );
}
