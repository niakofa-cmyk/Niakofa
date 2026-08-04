import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, X, Image as ImageIcon, Megaphone, MapPinned, Sparkles } from "lucide-react";
import { authHeaders } from "@/lib/auth";

type PostType = "offer" | "resource" | "update";

const TYPE_OPTIONS: { value: PostType; label: string; icon: typeof Megaphone; placeholder: string }[] = [
  { value: "offer", label: "Offer help", icon: Sparkles, placeholder: "What can you offer your neighbors? e.g. \"Free ride to medical appointments this week\"" },
  { value: "resource", label: "Share a resource", icon: MapPinned, placeholder: "What's worth sharing? e.g. \"Food pantry on 5th St is open Saturdays 9-1\"" },
  { value: "update", label: "Community update", icon: Megaphone, placeholder: "What's happening in the neighborhood?" },
];

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // matches server-side cap (base64 data URL length)

export interface NewCommunityPost {
  id: number;
  post_type: PostType;
  message: string;
  photo_url: string | null;
  moderation_status: "approved" | "pending" | "rejected";
  author_name: string;
  author_avatar?: string | null;
  likes: number;
  created_at: string;
}

interface CommunityPostComposerProps {
  onPosted: (post: NewCommunityPost) => void;
}

export function CommunityPostComposer({ onPosted }: CommunityPostComposerProps) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<PostType>("offer");
  const [message, setMessage] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const activeOption = TYPE_OPTIONS.find(o => o.value === type)!;

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      setError("Image too large — max 5 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (!message.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${base}/api/community-posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          post_type: type,
          message: message.trim(),
          photo_url: photoDataUrl,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to post");
      }
      const post = (await res.json()) as NewCommunityPost;
      onPosted(post);
      setMessage("");
      setPhotoDataUrl(null);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post right now. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-card border border-border rounded-2xl p-3.5 flex items-center gap-2.5 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors text-left"
      >
        <Sparkles className="w-4 h-4 text-primary shrink-0" />
        Offer help, share a resource, or post a community update…
      </button>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        className="bg-card border border-border rounded-2xl p-4 space-y-3 overflow-hidden"
      >
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {TYPE_OPTIONS.map(opt => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  onClick={() => setType(opt.value)}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
                    type === opt.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={activeOption.placeholder}
          maxLength={500}
          rows={3}
          className="w-full bg-background border border-border rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
        />

        {photoDataUrl && (
          <div className="relative w-fit">
            <img src={photoDataUrl} alt="" className="h-24 rounded-lg border border-border object-cover" />
            <button
              onClick={() => setPhotoDataUrl(null)}
              className="absolute -top-1.5 -right-1.5 bg-background border border-border rounded-full p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {error && <div className="text-xs text-destructive">{error}</div>}

        {/* Photo posts are held for admin review before appearing in the live feed — see post-moderation.ts */}
        {photoDataUrl && (
          <div className="text-[10px] text-muted-foreground">📋 Photos are reviewed before they appear publicly.</div>
        )}

        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ImageIcon className="w-4 h-4" />
            Add photo
          </button>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handlePhotoSelect} className="hidden" />

          <button
            onClick={handleSubmit}
            disabled={!message.trim() || submitting}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" />
            {submitting ? "Posting…" : "Post"}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
