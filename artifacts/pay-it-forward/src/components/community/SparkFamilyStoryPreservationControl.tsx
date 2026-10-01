import { useEffect, useState } from "react";
import { storiesClient } from "../family/stories-client";
import {
  canCopyStudioFilesToFamily,
  FAMILY_STORY_CANDIDATE_DURATION_MS,
  FAMILY_STORY_MAX_FILE_BYTES,
} from "./community-spark-family-archive";

type FamilyChoice = { id: number; name: string; my_role: string; status: string };

export function SparkFamilyStoryPreservationControl({
  durationMs,
  files,
  checked,
  familyId,
  onCheckedChange,
  onFamilyChange,
}: {
  durationMs: number;
  files: File[];
  checked: boolean;
  familyId: number | null;
  onCheckedChange: (checked: boolean) => void;
  onFamilyChange: (familyId: number | null) => void;
}) {
  const [families, setFamilies] = useState<FamilyChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const supported = canCopyStudioFilesToFamily(files);
  const oversized = files.find((file) => file.size > FAMILY_STORY_MAX_FILE_BYTES);

  useEffect(() => {
    if (!checked || loaded || loading) return;
    let active = true;
    setLoading(true);
    setLoadError("");
    void storiesClient.mine().then(({ families: available }) => {
      if (!active) return;
      setFamilies(available.filter((family) => (
        family.status === "active"
        && ["owner", "curator", "contributor"].includes(family.my_role)
      )));
      setLoaded(true);
    }).catch((reason: unknown) => {
      if (active) setLoadError(reason instanceof Error ? reason.message : "Could not load Family Spaces.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [checked, loaded, loading]);

  if (durationMs <= FAMILY_STORY_CANDIDATE_DURATION_MS) return null;

  return (
    <section className="nia-story-family-copy" aria-labelledby="spark-family-copy-title" data-testid="spark-family-copy">
      <div className="nia-story-family-copy__intro">
        <span aria-hidden="true">60+</span>
        <div>
          <h3 id="spark-family-copy-title">Keep a private Family Story copy?</h3>
          <p>Your selected videos add up to more than 60 seconds. Moments still follow the normal 24-hour limit; the Story is private to you, while Family Space managers may access linked private media.</p>
        </div>
      </div>
      <label className="nia-story-family-copy__consent">
        <input
          type="checkbox"
          checked={checked}
          disabled={!supported}
          onChange={(event) => {
            onCheckedChange(event.target.checked);
            if (!event.target.checked) onFamilyChange(null);
          }}
          data-testid="input-save-private-family-story"
        />
        <span><strong>Save the selected media in Family Stories</strong><small>The private Story stays in your Family Vault until you delete it.</small></span>
      </label>
      {!supported && (
        <p className="nia-story-family-copy__notice" role="note">
          {oversized
            ? `${oversized.name} is over Family Vault’s 20 MB per-item limit. Publish without the private copy or choose smaller media.`
            : "The private copy supports JPG, PNG, WebP, GIF, MP4, and WebM files up to 20 MB each."}
        </p>
      )}
      {checked && (
        <div className="nia-story-family-copy__family">
          <label htmlFor="spark-family-copy-family">Family Space</label>
          {loading ? <p role="status">Loading Family Spaces…</p> : loadError ? (
            <p role="alert">{loadError} <button type="button" onClick={() => { setLoaded(false); setLoadError(""); }}>Retry</button></p>
          ) : families.length ? (
            <select
              id="spark-family-copy-family"
              value={familyId ?? ""}
              onChange={(event) => onFamilyChange(event.target.value ? Number(event.target.value) : null)}
              data-testid="select-private-family-story-space"
            >
              <option value="">Choose a Family Space</option>
              {families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}
            </select>
          ) : (
            <p>No writable Family Space is available. <a href="/family">Manage Family Spaces</a>.</p>
          )}
        </div>
      )}
    </section>
  );
}