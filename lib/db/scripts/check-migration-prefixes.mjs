import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";

const migrationDirectories = [
  "lib/db/migrations",
  "artifacts/api-server/migrations",
  "artifacts/nia-service/migrations",
];

// The shared migration runner records the complete filename as its primary key,
// so these historical pairs remain distinguishable and must not be renamed
// after deployment. Keep the exact legacy set here so any new collision fails.
const legacyDuplicates = new Map([
  ["lib/db/migrations:0009", ["0009_helper_availability.sql", "0009_schema_hardening.sql"]],
  ["lib/db/migrations:0052", ["0052_griot_stories.sql", "0052_postgis_sync_and_gist.sql"]],
  ["lib/db/migrations:0059", ["0059_no_show_count.sql", "0059_stripe_pool_webhook_audit.sql"]],
  ["lib/db/migrations:0063", ["0063_dedupe_brazil_hubs.sql", "0063_diaspora_hub_geography.sql"]],
  ["lib/db/migrations:0079", ["0079_family_spaces_core.sql", "0079_spirit_animal.sql"]],
  ["lib/db/migrations:0118", ["0118_community_pool_financial_integrity.sql", "0118_pool_pending_scope.sql"]],
  ["lib/db/migrations:0119", ["0119_circle_recordings_archive.sql", "0119_diaspora_preserve_links.sql"]],
  ["lib/db/migrations:0121", ["0121_diaspora_research_workspace.sql", "0121_family_dna_profiles.sql"]],
  ["lib/db/migrations:0122", ["0122_diaspora_research_workspace_checks.sql", "0122_dna_matching_consent_and_results.sql"]],
  ["lib/db/migrations:0123", ["0123_dna_derived_marker_sketch.sql", "0123_dna_matching_shared_cm_nullable.sql"]],
  ["lib/db/migrations:0124", ["0124_diaspora_preserve_scan_idempotency.sql", "0124_dna_match_estimate_boundary.sql"]],
  ["lib/db/migrations:0125", ["0125_active_neighborhood_spiral_visibility.sql", "0125_payment_refund_watermark.sql"]],
  ["lib/db/migrations:0133", ["0133_neighborhood_source_provenance.sql", "0133_neighborhood_spiral_provisioning.sql"]],
  ["lib/db/migrations:0148", ["0148_direct_message_context_attachments.sql", "0148_messages_social_hardening.sql"]],
  ["lib/db/migrations:0150", ["0150_community_stories.sql", "0150_diaspora_hub_geography_reconcile.sql"]],
  ["lib/db/migrations:0168", ["0168_account_deletion_lifecycle.sql", "0168_exchange_spatial_discovery_index.sql"]],
  ["lib/db/migrations:0178", ["0178_exchange_sparks_listing_restrict.sql", "0178_media_asset_moment_contexts.sql"]],
]);

const observedDuplicates = new Map();
for (const directory of migrationDirectories) {
  const files = readdirSync(path.resolve(directory)).filter((file) => file.endsWith(".sql"));
  const prefixes = new Map();
  for (const file of files) {
    const prefix = /^(\d+)[_-]/.exec(file)?.[1];
    if (!prefix) continue;
    const key = `${directory}:${prefix}`;
    prefixes.set(key, [...(prefixes.get(key) ?? []), file]);
  }

  for (const [key, names] of prefixes) {
    if (names.length > 1) observedDuplicates.set(key, names.sort());
  }
}

assert.deepEqual(
  Object.fromEntries([...observedDuplicates].sort(([a], [b]) => a.localeCompare(b))),
  Object.fromEntries(
    [...legacyDuplicates]
      .map(([key, names]) => [key, [...names].sort()])
      .sort(([a], [b]) => a.localeCompare(b)),
  ),
  "Migration prefix collisions changed. Add a new migration with a unique prefix; only update the legacy allowlist after an explicit migration-order review.",
);

console.log("PASS: no new migration prefix collisions.");
