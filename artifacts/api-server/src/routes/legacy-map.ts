/**
 * Niakofa — Legacy Mode Family World Map
 *
 * legacy-home.tsx's "World Map" section shows chapter progression, but its
 * "Full Map" button linked to /diaspora/timeline — a chronological, non-
 * geographic view. There was no route that actually placed the family's real
 * locations (family_places: villages, homes, schools, cemeteries, migration
 * waypoints) on a map. That's exactly the "World Map is currently a visual
 * placeholder" / "map needs to become the Family World" gap from the Legacy
 * Mode design docs — the static WORLD_STAGES concept they described doesn't
 * exist in this codebase, but a *real geographic* view didn't exist either.
 *
 * This endpoint returns the family's real family_places (with coordinates
 * where available), each annotated with:
 *   - the earliest year a family_events row ties it to (for chronological
 *     ordering — i.e. the actual migration route, oldest to newest)
 *   - which Legacy chapter(s) reference it (via legacy_chapters.chapter_data
 *     .placeIds, the same field legacy-chapters.ts already writes)
 * so the frontend can render real pins + a real migration route line instead
 * of a fabricated/static stage list.
 *
 * Consent: events tied to a living member who hasn't granted storytelling
 * consent are excluded from year-dating a place, matching the consent gate
 * already enforced in legacy.ts / legacy-chapters.ts.
 *
 * Routes:
 *   GET /api/legacy/map/:familyId — family places for the World Map, real data only
 */

import { Router } from "express";
import {
  db,
  familyMembersTable,
  familyPlacesTable,
  familyEventsTable,
  legacyWorldsTable,
  legacyChaptersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { eq, and, inArray, or, isNull, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getConsentedMemberIds } from "../lib/legacy-consent";

const router = Router();

async function isMember(userId: number, familyId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: familyMembersTable.id })
    .from(familyMembersTable)
    .where(
      and(
        eq(familyMembersTable.family_id, familyId),
        eq(familyMembersTable.user_id, userId),
        inArray(familyMembersTable.status, ["active", "invited"]),
      ),
    )
    .limit(1);
  return !!row;
}

interface MapPlace {
  id: number;
  label: string;
  placeType: string | null;
  country: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  year: number | null;
  chapterNumbers: number[];
}

// GET /api/legacy/map/:familyId
router.get(
  "/legacy/map/:familyId",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = parseInt(String(req.params.familyId), 10);
    if (isNaN(familyId)) return res.status(400).json({ error: "Invalid family ID" });

    const userId = req.authenticatedUserId!;
    if (!(await isMember(userId, familyId))) {
      return res.status(403).json({ error: "Not a member of this family" });
    }

    try {
      const consentedIdSet = await getConsentedMemberIds(familyId);
      const consentedIds = Array.from(consentedIdSet);

      const [places, events, chapters] = await Promise.all([
        db
          .select({
            id:        familyPlacesTable.id,
            label:     familyPlacesTable.label,
            placeType: familyPlacesTable.place_type,
            country:   familyPlacesTable.country,
            region:    familyPlacesTable.region,
            lat:       familyPlacesTable.lat,
            lng:       familyPlacesTable.lng,
            notes:     familyPlacesTable.notes,
          })
          .from(familyPlacesTable)
          .where(eq(familyPlacesTable.family_id, familyId)),

        // Consent gate: only events with no member attached, or attached to a
        // consented member, may date a place on the map.
        db
          .select({
            placeId:   familyEventsTable.place_id,
            eventDate: familyEventsTable.event_date,
            memberId:  familyEventsTable.member_id,
          })
          .from(familyEventsTable)
          .where(
            and(
              eq(familyEventsTable.family_id, familyId),
              or(
                isNull(familyEventsTable.member_id),
                consentedIds.length > 0
                  ? inArray(familyEventsTable.member_id, consentedIds)
                  : isNull(familyEventsTable.member_id),
              ),
            ),
          ),

        // Latest world's chapters, to tag places with the chapter(s) that
        // already reference them (chapter_data.placeIds — written by
        // legacy-chapters.ts's generateChapterSeeds()).
        db
          .select({
            chapterNumber: legacyChaptersTable.chapter_number,
            chapterData:   legacyChaptersTable.chapter_data,
          })
          .from(legacyChaptersTable)
          .innerJoin(legacyWorldsTable, eq(legacyChaptersTable.world_id, legacyWorldsTable.id))
          .where(eq(legacyChaptersTable.family_id, familyId))
          .orderBy(desc(legacyWorldsTable.created_at)),
      ]);

      // Earliest year per place, from consent-filtered events only.
      const earliestYearByPlace = new Map<number, number>();
      for (const e of events) {
        if (!e.placeId || !e.eventDate) continue;
        const year = new Date(e.eventDate).getFullYear();
        const existing = earliestYearByPlace.get(e.placeId);
        if (existing === undefined || year < existing) {
          earliestYearByPlace.set(e.placeId, year);
        }
      }

      // Chapter numbers per place, from the most recently generated world only
      // (chapters array above is already newest-world-first via the join/orderBy;
      // once we've recorded a chapter number for a placeId we skip older worlds).
      const chapterNumbersByPlace = new Map<number, Set<number>>();
      const seenWorldPlaceKeys = new Set<string>();
      for (const ch of chapters) {
        const placeIds = (ch.chapterData as { placeIds?: number[] } | null)?.placeIds ?? [];
        for (const pid of placeIds) {
          const key = `${pid}`;
          if (seenWorldPlaceKeys.has(key)) continue;
          if (!chapterNumbersByPlace.has(pid)) chapterNumbersByPlace.set(pid, new Set());
          chapterNumbersByPlace.get(pid)!.add(ch.chapterNumber);
        }
      }

      const mapPlaces: MapPlace[] = places.map((p) => ({
        id: p.id,
        label: p.label,
        placeType: p.placeType,
        country: p.country,
        region: p.region,
        lat: p.lat,
        lng: p.lng,
        notes: p.notes,
        year: earliestYearByPlace.get(p.id) ?? null,
        chapterNumbers: Array.from(chapterNumbersByPlace.get(p.id) ?? []).sort((a, b) => a - b),
      }));

      // Chronological order: dated places first (oldest to newest), then
      // undated places in the order they were added.
      mapPlaces.sort((a, b) => {
        if (a.year !== null && b.year !== null) return a.year - b.year;
        if (a.year !== null) return -1;
        if (b.year !== null) return 1;
        return a.id - b.id;
      });

      const withCoordinates = mapPlaces.filter((p) => p.lat !== null && p.lng !== null);

      // The migration route: a chronological line through every place that
      // has real coordinates. Only meaningful with 2+ points.
      const route = withCoordinates.length >= 2
        ? withCoordinates.map((p) => [p.lng as number, p.lat as number])
        : [];

      return res.json({
        places: mapPlaces,
        placesWithCoordinates: withCoordinates.length,
        placesWithoutCoordinates: mapPlaces.length - withCoordinates.length,
        route,
      });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-map: failed to load family world map");
      return res.status(500).json({ error: "Failed to load family world map" });
    }
  },
);

export default router;
