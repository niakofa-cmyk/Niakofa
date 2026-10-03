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
  destination,
  checked,
  familyId,
  disabled = false,
  allowMomentCutdown = true,
  onDestinationChange,
  onCheckedChange,
  onFamilyChange,
}: {
  durationMs: number;
  files: File[];
  destination: "family-only" | "moment" | null;
  checked: boolean;
  familyId: number | null;
  disabled?: boolean;
  allowMomentCutdown?: boolean;
  onDestinationChange: (destination: "family-only" | "moment") => void;
  onCheckedChange: (checked: boolean) => void;
  onFamilyChange: (familyId: number | null) => void;
}) {
  const [families, setFamilies] = useState<FamilyChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const supported = canCopyStudioFilesToFamily(files);
  const oversized = files.find((file) => file.size > FAMILY_STORY_MAX_FILE_BYTES);
  const needsFamily = destination === "family-only" || (destination === "moment" && checked);

  useEffect(() => {
    if (!needsFamily || loaded || loading) return;
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
  }, [loaded, loading, needsFamily]);

  if (durationMs <= FAMILY_STORY_CANDIDATE_DURATION_MS) return null;

  return (
    <section className="nia-story-family-copy" aria-labelledby="spark-family-copy-title" data-testid="spark-family-copy">
      <div className="nia-story-family-copy__intro">
          <span aria-hidden="true">3m+</span>
        <div>
          <h3 id="spark-family-copy-title">Choose where this recording goes</h3>
          <p>Your selected videos add up to {Math.ceil(durationMs / 1000)} seconds. Shared videos are limited to 180 seconds. Save the full original privately before publishing any shorter Moment.</p>
        </div>
      </div>
      <fieldset className="nia-story-family-copy__choices" disabled={disabled}>
        <legend className="sr-only">Choose a destination for the full recording</legend>
        <label className="nia-story-family-copy__consent">
          <input
            type="radio"
            name="spark-family-story-destination"
            value="family-only"
            checked={destination === "family-only"}
            disabled={!supported || disabled}
            onChange={() => onDestinationChange("family-only")}
            data-testid="input-family-story-only"
          />
          <span><strong>Save the full original as a Family Story only</strong><small>No Moment is published. The original media and caption are saved privately.</small></span>
        </label>
        {allowMomentCutdown && (
          <label className="nia-story-family-copy__consent">
            <input
              type="radio"
              name="spark-family-story-destination"
              value="moment"
              checked={destination === "moment"}
              disabled={disabled}
              onChange={() => onDestinationChange("moment")}
              data-testid="input-family-story-moment"
            />
            <span><strong>Create a Moment from up to 180 seconds</strong><small>Uses the first complete video clips that fit; clips are not shortened. The full original must also be saved privately.</small></span>
          </label>
        )}
      </fieldset>
      {destination === "moment" && (
        <label className="nia-story-family-copy__consent nia-story-family-copy__optional">
          <input
            type="checkbox"
            required
            checked={checked}
            disabled={!supported || disabled}
            onChange={(event) => {
              onCheckedChange(event.target.checked);
              if (!event.target.checked) onFamilyChange(null);
            }}
            data-testid="input-save-private-family-story"
          />
          <span><strong>Save the full original privately (required)</strong><small>The Family Story is saved before the Moment is published.</small></span>
        </label>
      )}
      {!supported && (
        <p className="nia-story-family-copy__notice" role="note">
          {oversized
            ? `${oversized.name} is over Family Vault’s 20 MB per-item limit. Publish without the private copy or choose smaller media.`
            : "The private copy supports JPG, PNG, WebP, GIF, MP4, and WebM files up to 20 MB each."}
        </p>
      )}
      {needsFamily && (
        <div className="nia-story-family-copy__family">
          <label htmlFor="spark-family-copy-family">Family Space</label>
          {loading ? <p role="status">Loading Family Spaces…</p> : loadError ? (
            <p role="alert">{loadError} <button type="button" onClick={() => { setLoaded(false); setLoadError(""); }}>Retry</button></p>
          ) : families.length ? (
            <select
              id="spark-family-copy-family"
              value={familyId ?? ""}
              onChange={(event) => onFamilyChange(event.target.value ? Number(event.target.value) : null)}
              disabled={disabled}
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