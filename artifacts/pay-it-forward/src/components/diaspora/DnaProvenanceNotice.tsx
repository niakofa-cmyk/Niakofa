import { ShieldCheck } from "lucide-react";
import { diasporaTheme } from "@/lib/diaspora/theme";

export function DnaProvenanceNotice() {
  return (
    <aside className={`${diasporaTheme.radius} border ${diasporaTheme.gold.border} ${diasporaTheme.gold.soft} p-4`} aria-label="DNA provenance boundary">
      <div className="flex gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <div>
          <p className="text-sm font-semibold text-white">Trust-first DNA review</p>
          <p className="mt-1 text-xs leading-relaxed text-white/55">
            Niakofa's current connection signal is a consented derived-sketch similarity lead. It does not calculate or infer provider shared-cM, IBD segments, identity, parentage, paternity, forensic, or ethnicity findings.
          </p>
          <p className="mt-2 text-[11px] text-amber-200/70">
            Save promising leads to Research and confirm them with documented genealogy or provider-supplied evidence.
          </p>
        </div>
      </div>
    </aside>
  );
}
