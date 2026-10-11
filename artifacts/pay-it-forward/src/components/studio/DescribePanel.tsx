import { useEffect, useRef, useState } from "react";
import { validateMomentStudioWebVtt } from "../community/moment-studio-accessibility";
import { ALT_TEXT_MAX } from "./studio-accessibility";
import { formatClock } from "./studio-media";
import type { StudioItem } from "./studio-policy";

type Props = {
  item: StudioItem;
  position: number;
  url: string;
  /** Moments need a description; Exchange Sparks and private Family copies do not. */
  altRequired: boolean;
  onAlt: (text: string) => void;
  onCaptions: (vtt: string) => void;
  onCover: (timeMs: number) => void;
  onClose: () => void;
};

/** Description, captions and cover frame for one item — a drawer over the preview, so the work stays in view. */
export function DescribePanel({ item, position, url, altRequired, onAlt, onCaptions, onCover, onClose }: Props) {
  const alt = item.altText ?? "";
  const vtt = item.captionsVtt ?? "";
  const vttProblem = item.kind === "video" && vtt.trim() ? validateMomentStudioWebVtt(vtt.trim(), item.durationMs) : null;
  const altRef = useRef<HTMLTextAreaElement>(null);
  const coverVideo = useRef<HTMLVideoElement>(null);
  const [coverPct, setCoverPct] = useState(() => (item.durationMs ? Math.min(100, (item.coverTimeMs / item.durationMs) * 100) : 0));
  useEffect(() => { altRef.current?.focus(); }, [item.id]);
  useEffect(() => { const v = coverVideo.current; if (v && Number.isFinite(item.coverTimeMs)) v.currentTime = item.coverTimeMs / 1000; }, [item.coverTimeMs]);
  const label = `${item.kind === "video" ? "video" : "photo"} ${position}`;

  return (
    <section className="nk-studio__describe" role="group" aria-label={`Details for ${label}`}>
      <header><h2>Details · {label}</h2><button type="button" className="nk-studio__pill" onClick={onClose}>Done</button></header>
      <label className="nk-studio__field">
        <span>Description{altRequired ? " (required)" : ""}</span>
        <textarea ref={altRef} value={alt} maxLength={ALT_TEXT_MAX} rows={3} aria-required={altRequired} aria-invalid={altRequired && !alt.trim()}
          placeholder={item.kind === "video" ? "What happens in this video?" : "What is in this photo?"} onChange={(e) => onAlt(e.target.value)} />
        <small>{alt.length}/{ALT_TEXT_MAX} · Read aloud to people using screen readers.</small>
      </label>
      {item.kind === "video" && (
        <>
          <label className="nk-studio__field">
            <span>Cover frame · {formatClock(item.coverTimeMs)}</span>
            <div className="nk-studio__cover">
              <video ref={coverVideo} src={url} muted playsInline preload="metadata" aria-hidden="true" />
              <input type="range" min={0} max={100} step={0.5} value={coverPct} aria-label="Cover frame position" disabled={!item.durationMs}
                onChange={(e) => { const pct = Number(e.target.value); setCoverPct(pct); onCover(Math.round(((item.durationMs ?? 0) * pct) / 100)); }} />
            </div>
          </label>
          <label className="nk-studio__field">
            <span>Captions (optional, WebVTT)</span>
            <textarea value={vtt} rows={4} spellCheck={false} aria-invalid={Boolean(vttProblem)} placeholder={"WEBVTT\n\n00:00.000 --> 00:02.000\nHello!"} onChange={(e) => onCaptions(e.target.value)} />
            {vttProblem && <small role="alert" className="is-error">{vttProblem}</small>}
          </label>
        </>
      )}
    </section>
  );
}
