/**
 * Preserve the Culture — conversation prompts + Family Vault handoff.
 * Route: /diaspora/preserve
 *
 * This page is intentionally a bridge into the real Family Vault workflow.
 * It never claims that a QR scan itself created a memory link; the backend
 * currently resolves QR codes and returns a next action, so the UI hands the
 * user into the existing recorder/vault journey.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, BookHeart, ChevronLeft, ChevronRight, Layers, Loader2, Mic, QrCode, RotateCcw, Shuffle } from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { buildOralHistoryHref } from "@/lib/diaspora/oralHistoryDeepLink";
import { toast } from "sonner";

interface CultureCard {
  id: string;
  title: string;
  category: string;
  prompt: string;
  follow_up: string;
  color: string;
}

const TONES: Record<string, { accent: string; border: string; background: string }> = {
  amber: { accent: "text-amber-300", border: "border-amber-300/25", background: "from-amber-950 to-[#17100a]" },
  teal: { accent: "text-teal-300", border: "border-teal-300/25", background: "from-teal-950 to-[#071312]" },
  purple: { accent: "text-violet-300", border: "border-violet-300/25", background: "from-violet-950 to-[#100b16]" },
  gold: { accent: "text-yellow-300", border: "border-yellow-300/25", background: "from-yellow-950 to-[#171207]" },
  emerald: { accent: "text-emerald-300", border: "border-emerald-300/25", background: "from-emerald-950 to-[#07130f]" },
  rose: { accent: "text-rose-300", border: "border-rose-300/25", background: "from-rose-950 to-[#160a0f]" },
};

export default function PreserveCulturePage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [cards, setCards] = useState<CultureCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    void (async () => {
      try {
        const res = await fetch("/api/diaspora/preserve/cards", { headers: authHeaders() });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setCards(Array.isArray(data.cards) ? data.cards : []);
      } catch {
        toast.error("Couldn't load culture cards");
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUser]);

  const currentCard = cards[index];
  const tone = TONES[currentCard?.color ?? "amber"] ?? TONES.amber;
  const categories = useMemo(() => new Set(cards.map(card => card.category)).size, [cards]);

  async function handleQrScan() {
    const value = qrCode.trim();
    if (!value || scanning) return;
    setScanning(true);
    try {
      const res = await fetch("/api/diaspora/preserve/scan", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ qr_code: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't read QR code");

      setQrOpen(false);
      setQrCode("");
      if (data.type === "card" && data.card?.id) {
        const found = cards.findIndex(card => card.id === data.card.id);
        if (found >= 0) setIndex(found);
        setFlipped(false);
        toast.success("Card found. Your next step is to record the story.");
        return;
      }

      if (data.action === "link_memory") {
        toast.success("QR recognized. Choose a Family Space to preserve the memory.");
        navigate("/diaspora/family");
        return;
      }

      toast.success(data.message ?? "QR code recognized");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't read QR code");
    } finally {
      setScanning(false);
    }
  }

  if (!currentUser) {
    return <div className="flex min-h-screen items-center justify-center"><p className="text-sm text-muted-foreground">Sign in to preserve your culture.</p></div>;
  }

  return (
    <div className="min-h-screen bg-[#071312] pb-28 text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#071312]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 sm:px-6">
          <button onClick={() => navigate("/diaspora")} className="rounded-xl p-2 text-white/60 hover:bg-white/5 hover:text-white" aria-label="Back to Diaspora">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300/70">Preserve the Culture</p>
            <h1 className="truncate text-sm font-black">Conversation cards for living memory</h1>
          </div>
          <button onClick={() => setQrOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-teal-300/20 bg-teal-300/5 px-3 py-2 text-xs font-bold text-teal-300">
            <QrCode className="h-3.5 w-3.5" /> Scan
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 pt-6 sm:px-6">
        <section className="relative overflow-hidden rounded-[2rem] border border-amber-300/15 bg-gradient-to-br from-[#2a1907] via-[#17100a] to-[#071312] p-6 sm:p-8">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full border border-amber-300/10" />
          <div className="relative">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300/70">A family ritual</p>
            <h2 className="mt-2 text-2xl font-black">Ask. Listen. Record. Preserve.</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/55">Use a prompt to start the conversation, then send the answer directly into your Family Vault as an oral history.</p>
            <div className="mt-5 flex gap-6">
              <div><p className="text-xl font-black text-amber-300">{cards.length}</p><p className="text-[10px] text-white/35">prompts</p></div>
              <div><p className="text-xl font-black text-teal-300">{categories}</p><p className="text-[10px] text-white/35">themes</p></div>
              <div><p className="text-xl font-black text-rose-300">∞</p><p className="text-[10px] text-white/35">stories</p></div>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-teal-300" /></div>
        ) : currentCard ? (
          <>
            <div className="flex items-center justify-between text-xs text-white/40">
              <span>Prompt {index + 1} of {cards.length}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => { setIndex(i => Math.max(0, i - 1)); setFlipped(false); }} disabled={index === 0} className="rounded-lg p-2 disabled:opacity-20"><ChevronLeft className="h-4 w-4" /></button>
                <button onClick={() => { setIndex(Math.floor(Math.random() * cards.length)); setFlipped(false); }} className="rounded-lg p-2"><Shuffle className="h-4 w-4" /></button>
                <button onClick={() => { setIndex(i => Math.min(cards.length - 1, i + 1)); setFlipped(false); }} disabled={index === cards.length - 1} className="rounded-lg p-2 disabled:opacity-20"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>

            <button onClick={() => setFlipped(value => !value)} className={`relative min-h-[330px] w-full overflow-hidden rounded-[2rem] border ${tone.border} bg-gradient-to-br ${tone.background} p-6 text-left shadow-2xl sm:p-8`}>
              <div className="flex items-start justify-between gap-4">
                <div><p className={`text-[10px] font-bold uppercase tracking-[0.22em] ${tone.accent}`}>{currentCard.category}</p><h3 className="mt-2 text-2xl font-black">{currentCard.title}</h3></div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/5"><Layers className={`h-5 w-5 ${tone.accent}`} /></span>
              </div>
              <div className="mt-10 max-w-xl">
                <p className={`text-[10px] font-bold uppercase tracking-[0.22em] ${tone.accent}`}>{flipped ? "Follow-up" : "Ask this"}</p>
                <p className="mt-3 text-lg font-semibold leading-relaxed text-white/90">{flipped ? currentCard.follow_up : currentCard.prompt}</p>
              </div>
              <div className="absolute bottom-5 left-6 right-6 flex items-center justify-between text-xs text-white/25 sm:left-8 sm:right-8"><span className="flex items-center gap-1"><RotateCcw className="h-3.5 w-3.5" /> Tap to flip</span><QrCode className="h-4 w-4" /></div>
            </button>

            <div className="grid gap-3 sm:grid-cols-2">
              <button onClick={() => navigate(buildOralHistoryHref())} className="flex items-center justify-center gap-2 rounded-xl bg-rose-300 px-4 py-3 text-sm font-black text-[#260810]">
                <Mic className="h-4 w-4" /> Record this story
              </button>
              <button onClick={() => navigate("/diaspora/family")} className="flex items-center justify-center gap-2 rounded-xl border border-amber-300/25 bg-amber-300/5 px-4 py-3 text-sm font-bold text-amber-300">
                <BookHeart className="h-4 w-4" /> Open Family Vault
              </button>
            </div>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-teal-300/70">How it connects</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {["Choose a prompt", "Record an oral history", "Preserve it in your Vault"].map((label, step) => (
                  <div key={label} className="rounded-xl bg-white/[0.03] p-3"><span className="text-xs font-black text-amber-300">0{step + 1}</span><p className="mt-2 text-xs font-semibold text-white/70">{label}</p></div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-white/45">No culture prompts are available yet.</div>
        )}
      </main>

      {qrOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0c1716] p-6 shadow-2xl">
            <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-300/70">Preserve</p><h2 className="mt-1 text-lg font-black">Enter a QR code</h2></div><button onClick={() => setQrOpen(false)} className="rounded-xl p-2 text-white/50 hover:bg-white/5">×</button></div>
            <p className="mt-2 text-xs leading-relaxed text-white/45">Camera scanning can be added when the device scanner is available. For now, paste the QR payload to use the real resolver.</p>
            <input value={qrCode} onChange={event => setQrCode(event.target.value)} placeholder="Paste QR payload…" className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-teal-300/30" style={{ fontSize: "16px" }} />
            <button onClick={() => void handleQrScan()} disabled={!qrCode.trim() || scanning} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-300 py-3 text-sm font-black text-[#062421] disabled:opacity-40">{scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />} Resolve QR</button>
          </div>
        </div>
      )}
    </div>
  );
}
