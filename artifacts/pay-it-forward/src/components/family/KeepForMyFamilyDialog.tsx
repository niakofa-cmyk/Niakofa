import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookHeart, LockKeyhole, X } from "lucide-react";
import { toast } from "sonner";
import { storiesClient } from "./stories-client";

/**
 * Standalone integration point for Moments: render with an authenticated Moment id.
 * The parent owns the trigger and may use onKept to refresh its own state.
 */
export function KeepForMyFamilyDialog({ open, momentId, onClose, onKept }: {
  open: boolean;
  momentId: number;
  onClose: () => void;
  onKept?: () => void;
}) {
  const [familyId, setFamilyId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["my-families-for-keeping"],
    queryFn: storiesClient.mine,
    enabled: open,
    staleTime: 30_000,
  });
  const families = (data?.families ?? []).filter(f =>
    f.status === "active" && ["owner", "curator", "contributor"].includes(f.my_role));
  useEffect(() => {
    if (!open) { setFamilyId(null); setSaveError(""); }
  }, [open]);
  if (!open) return null;

  async function keep() {
    if (familyId === null || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await storiesClient.keepMoment(familyId, momentId);
      toast.success("Caption kept privately in your family archive");
      onKept?.();
      onClose();
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Could not keep this moment. Please try again.");
    } finally { setSaving(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#081317]/80 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="keep-family-title" className="w-full max-w-md rounded-t-[2rem] border border-[#52666a] bg-[#1b3039] p-7 text-[#ede8db] shadow-2xl sm:rounded-[2rem]">
      <div className="flex items-start justify-between"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e2b78b]/15 text-[#e2b78b]"><BookHeart size={24} /></div><button onClick={onClose} disabled={saving} aria-label="Close dialog" className="rounded-full p-2 hover:bg-white/10"><X size={19} /></button></div>
      <p className="mt-6 text-[11px] font-bold uppercase tracking-[.22em] text-[#e2b78b]">From a moment to a memory</p>
      <h2 id="keep-family-title" className="mt-2 font-serif text-3xl">Keep for my family</h2>
      <p className="mt-3 text-sm leading-6 text-[#c5d0ca]">Choose a Family Space to keep this account in its private stories archive.</p>
      <div className="mt-5 flex gap-3 rounded-xl border border-[#53696c] bg-[#122831] p-4 text-sm leading-6 text-[#d9dfd6]"><LockKeyhole size={18} className="mt-0.5 shrink-0 text-[#e2b78b]" /><p><strong>Caption text only.</strong> The photo, video, and audio from this Moment are not preserved. This is a private family copy, not a repost to the feed.</p></div>
      <div className="mt-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[.15em] text-[#b9c8c3]">Choose a family</p>
        {isPending ? <div aria-label="Loading your families" className="space-y-2"><div className="h-14 animate-pulse rounded-xl bg-[#34505a]" /><div className="h-14 animate-pulse rounded-xl bg-[#34505a]" /></div> : error ? <div role="alert" className="rounded-xl border border-[#aa766c] p-4 text-sm text-[#ffd0c0]">Could not load your families. <button onClick={() => void refetch()} className="underline">Try again</button></div> : families.length === 0 ? <div className="rounded-xl border border-dashed border-[#697d7a] p-5 text-sm leading-6 text-[#c5d0ca]">You do not have a writable Family Space yet. Join or create one before keeping a Moment.</div> : <div className="max-h-52 space-y-2 overflow-y-auto">{families.map(family => <label key={family.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm transition-colors ${familyId === family.id ? "border-[#e2b78b] bg-[#e2b78b]/10" : "border-[#52666a] hover:bg-white/5"}`}><input type="radio" name="keep-family" className="accent-[#e2b78b]" checked={familyId === family.id} onChange={() => setFamilyId(family.id)} /> <span className="font-semibold">{family.name}</span></label>)}</div>}
      </div>
      {saveError && <p role="alert" className="mt-4 text-sm text-[#ffd0c0]">{saveError}</p>}
      <div className="mt-7 flex justify-end gap-3"><button onClick={onClose} disabled={saving} className="rounded-xl border border-[#667a7b] px-4 py-2.5 text-sm hover:bg-white/10">Cancel</button><button data-testid="button-keep-for-family" onClick={() => void keep()} disabled={familyId === null || saving || !Number.isInteger(momentId) || momentId <= 0} className="flex items-center gap-2 rounded-xl bg-[#e2b78b] px-5 py-2.5 text-sm font-semibold text-[#17262b] hover:bg-[#f1cba4] disabled:opacity-40">{saving ? "Keeping…" : "Keep caption"} <ArrowRight size={16} /></button></div>
    </section>
  </div>;
}

export default KeepForMyFamilyDialog;