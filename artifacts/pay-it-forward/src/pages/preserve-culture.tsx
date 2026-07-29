/**
 * Preserve the Culture — Conversation card game + QR story linking
 * Route: /diaspora/preserve
 *
 * Card game mechanic:
 *  1. Draw a card with a conversation prompt
 *  2. Record a response as an oral history
 *  3. QR code links physical card → digital memory in vault
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Layers, Mic, ChevronRight, Loader2,
  QrCode, ArrowRight, BookHeart, X, RotateCcw,
  Shuffle, Share2, ChevronLeft,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";

interface CultureCard {
  id: string;
  title: string;
  category: string;
  prompt: string;
  follow_up: string;
  color: string;
}

const COLOR_STYLES: Record<string, { bg: string; text: string; border: string; cardBg: string }> = {
  amber:   { bg: "bg-amber-500/10",  text: "text-amber-300",  border: "border-amber-500/30",  cardBg: "from-amber-900/80 to-amber-950/90"  },
  teal:    { bg: "bg-teal-500/10",   text: "text-teal-300",   border: "border-teal-500/30",   cardBg: "from-teal-900/80 to-teal-950/90"   },
  purple:  { bg: "bg-purple-500/10", text: "text-purple-300", border: "border-purple-500/30", cardBg: "from-purple-900/80 to-purple-950/90" },
  gold:    { bg: "bg-yellow-500/10", text: "text-yellow-300", border: "border-yellow-500/30", cardBg: "from-yellow-900/80 to-yellow-950/90" },
  emerald: { bg: "bg-emerald-500/10",text: "text-emerald-300",border: "border-emerald-500/30",cardBg: "from-emerald-900/80 to-emerald-950/90"},
  red:     { bg: "bg-red-500/10",    text: "text-red-300",    border: "border-red-500/30",    cardBg: "from-red-900/80 to-red-950/90"    },
  blue:    { bg: "bg-blue-500/10",   text: "text-blue-300",   border: "border-blue-500/30",   cardBg: "from-blue-900/80 to-blue-950/90"   },
  orange:  { bg: "bg-orange-500/10", text: "text-orange-300", border: "border-orange-500/30", cardBg: "from-orange-900/80 to-orange-950/90"},
};

export default function PreserveCulturePage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [cards, setCards] = useState<CultureCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    loadCards();
  }, [currentUser]);

  async function loadCards() {
    setLoading(true);
    try {
      const res = await fetch("/api/diaspora/preserve/cards", { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCards(data.cards ?? []);
    } catch {
      toast.error("Couldn't load culture cards");
    } finally {
      setLoading(false);
    }
  }

  function shuffle() {
    setCurrentIdx(Math.floor(Math.random() * cards.length));
    setFlipped(false);
  }

  async function handleQrScan() {
    if (!qrCode.trim()) return;
    setScanning(true);
    try {
      const res = await fetch("/api/diaspora/preserve/scan", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ qr_code: qrCode.trim() }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.type === "card") {
        const idx = cards.findIndex(c => c.id === data.card?.id);
        if (idx !== -1) {
          setCurrentIdx(idx);
          setShowQrScanner(false);
          setQrCode("");
          toast.success("Card found! Read the prompt and record your story.");
        }
      } else {
        toast.success("QR code recognized. Link it to a memory in your vault.");
        setShowQrScanner(false);
        navigate("/family");
      }
    } catch {
      toast.error("Couldn't read QR code");
    } finally {
      setScanning(false);
    }
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Sign in to play Preserve the Culture</p>
      </div>
    );
  }

  const currentCard = cards[currentIdx];
  const colors = currentCard ? (COLOR_STYLES[currentCard.color] ?? COLOR_STYLES.amber) : COLOR_STYLES.amber;

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/diaspora")} className="p-2 -ml-2 rounded-lg active:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-bold flex items-center gap-2">
              <Layers className="w-4 h-4 text-orange-400" />
              Preserve the Culture
            </h1>
            <p className="text-xs text-muted-foreground">Card Game & Story Recording</p>
          </div>
          <button
            onClick={() => setShowQrScanner(true)}
            className="flex items-center gap-1.5 border border-orange-500/30 text-orange-400 px-3 py-1.5 rounded-lg text-sm font-medium active:opacity-70"
          >
            <QrCode className="w-3.5 h-3.5" /> Scan QR
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className="bg-gradient-to-br from-[#1a0a00] via-[#2a1200] to-[#1a0a00] border-b border-orange-800/30">
        <div className="max-w-lg mx-auto px-4 py-8">
          <h2 className="text-xl font-bold text-orange-100 mb-2">Spark the Conversation</h2>
          <p className="text-sm text-orange-300/70 leading-relaxed">
            Use these conversation cards to unlock stories from your elders. Record their answers directly to your Family Vault.
          </p>
          <div className="flex items-center gap-4 mt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-300">{cards.length}</p>
              <p className="text-xs text-orange-400/60">Cards</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-300">{[...new Set(cards.map(c => c.category))].length}</p>
              <p className="text-xs text-orange-400/60">Categories</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-300">∞</p>
              <p className="text-xs text-orange-400/60">Stories</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-5">

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : cards.length > 0 && currentCard ? (
          <>
            {/* Card counter */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Card {currentIdx + 1} of {cards.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setCurrentIdx(i => Math.max(0, i - 1)); setFlipped(false); }}
                  disabled={currentIdx === 0}
                  className="p-1.5 rounded-lg disabled:opacity-30 active:bg-muted"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={shuffle}
                  className="p-1.5 rounded-lg active:bg-muted"
                  title="Random card"
                >
                  <Shuffle className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setCurrentIdx(i => Math.min(cards.length - 1, i + 1)); setFlipped(false); }}
                  disabled={currentIdx === cards.length - 1}
                  className="p-1.5 rounded-lg disabled:opacity-30 active:bg-muted"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* The Card */}
            <div
              className={`relative rounded-3xl overflow-hidden border ${colors.border} cursor-pointer select-none`}
              style={{ minHeight: 280 }}
              onClick={() => setFlipped(f => !f)}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${colors.cardBg}`} />
              <div className="relative p-6 flex flex-col justify-between h-full" style={{ minHeight: 280 }}>
                {/* Card header */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className={`text-xs font-semibold uppercase tracking-wider ${colors.text}`}>
                      {currentCard.category}
                    </span>
                    <h3 className="text-xl font-bold text-white mt-1">{currentCard.title}</h3>
                  </div>
                  <div className={`w-10 h-10 rounded-xl ${colors.bg} flex items-center justify-center`}>
                    <Layers className={`w-5 h-5 ${colors.text}`} />
                  </div>
                </div>

                {/* Card body */}
                {!flipped ? (
                  <div className="mt-6">
                    <p className="text-white/90 text-base leading-relaxed font-medium">{currentCard.prompt}</p>
                    <div className="mt-4 flex items-center gap-1.5">
                      <RotateCcw className={`w-3.5 h-3.5 ${colors.text} opacity-60`} />
                      <p className={`text-xs ${colors.text} opacity-60`}>Tap for follow-up question</p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6">
                    <p className={`text-xs font-semibold ${colors.text} uppercase tracking-wider mb-2`}>Follow-up</p>
                    <p className="text-white/90 text-base leading-relaxed font-medium">{currentCard.follow_up}</p>
                    <div className="mt-4 flex items-center gap-1.5">
                      <RotateCcw className={`w-3.5 h-3.5 ${colors.text} opacity-60`} />
                      <p className={`text-xs ${colors.text} opacity-60`}>Tap to see main prompt</p>
                    </div>
                  </div>
                )}

                {/* Card ID / QR reference */}
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs text-white/30 font-mono">{currentCard.id}</span>
                  <QrCode className="w-4 h-4 text-white/20" />
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => navigate("/family")}
                className="flex items-center justify-center gap-2 bg-red-500 text-white rounded-xl py-3 text-sm font-semibold active:opacity-80"
              >
                <Mic className="w-4 h-4" /> Record Story
              </button>
              <button
                onClick={() => navigate("/family")}
                className="flex items-center justify-center gap-2 border border-orange-500/30 text-orange-400 rounded-xl py-3 text-sm font-semibold active:opacity-70"
              >
                <BookHeart className="w-4 h-4" /> Add to Vault
              </button>
            </div>

            {/* How it works */}
            <div className="bg-orange-500/5 border border-orange-500/20 rounded-2xl p-4">
              <h3 className="text-sm font-semibold mb-3">How it works</h3>
              <div className="space-y-2.5">
                {[
                  { step: "1", label: "Draw a card", desc: "Pick a card or scan a physical card's QR code" },
                  { step: "2", label: "Ask the question", desc: "Read the prompt to an elder at a family gathering" },
                  { step: "3", label: "Record the answer", desc: "Tap 'Record Story' to capture their voice" },
                  { step: "4", label: "Save to Vault", desc: "The recording is preserved in your Family Vault forever" },
                ].map(s => (
                  <div key={s.step} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center text-xs font-bold text-orange-400 flex-shrink-0 mt-0.5">
                      {s.step}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{s.label}</p>
                      <p className="text-xs text-muted-foreground">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* All categories */}
            <div>
              <h3 className="text-sm font-semibold mb-3">All Cards</h3>
              <div className="space-y-2">
                {cards.map((c, i) => {
                  const cs = COLOR_STYLES[c.color] ?? COLOR_STYLES.amber;
                  return (
                    <button
                      key={c.id}
                      onClick={() => { setCurrentIdx(i); setFlipped(false); window.scrollTo(0, 0); }}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border ${
                        i === currentIdx ? `${cs.bg} ${cs.border}` : "bg-card border-border"
                      } active:opacity-70 text-left`}
                    >
                      <div className={`w-8 h-8 rounded-lg ${cs.bg} flex items-center justify-center flex-shrink-0`}>
                        <Layers className={`w-4 h-4 ${cs.text}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.title}</p>
                        <p className={`text-xs ${cs.text}`}>{c.category}</p>
                      </div>
                      {i === currentIdx && (
                        <span className="text-xs text-muted-foreground">Current</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-16">
            <Layers className="w-12 h-12 text-orange-400/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No cards loaded</p>
          </div>
        )}
      </div>

      {/* ── QR Scanner Modal ──────────────────────────────────────────── */}
      {showQrScanner && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-2xl p-5 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-orange-400" />
                <h2 className="text-lg font-bold">Scan Card QR Code</h2>
              </div>
              <button onClick={() => setShowQrScanner(false)} className="p-1 rounded-lg active:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              Enter the QR code text from a physical Preserve the Culture card to link it to your digital vault.
            </p>

            {/* QR code area */}
            <div className="w-full aspect-square bg-muted/30 rounded-2xl flex items-center justify-center mb-4 border-2 border-dashed border-border">
              <div className="text-center space-y-2">
                <QrCode className="w-12 h-12 text-muted-foreground/40 mx-auto" />
                <p className="text-xs text-muted-foreground">Camera QR scanning coming soon</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="text-sm font-medium block mb-1">Or enter code manually:</label>
              <input
                value={qrCode}
                onChange={e => setQrCode(e.target.value)}
                placeholder="e.g. card-001 or QR code text"
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                style={{ fontSize: "16px" }}
              />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowQrScanner(false)} className="flex-1 border border-input rounded-xl py-2.5 text-sm font-medium active:opacity-70">
                Cancel
              </button>
              <button
                onClick={handleQrScan}
                disabled={!qrCode.trim() || scanning}
                className="flex-1 bg-orange-500 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                {scanning ? "Scanning…" : "Link Card"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
