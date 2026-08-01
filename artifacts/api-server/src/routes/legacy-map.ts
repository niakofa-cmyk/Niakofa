import { Router } from "express";
import { eq, and, inArray, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  familyPlacesTable,
  familyEventsTable,
  familyMembersTable,
  legacyWorldsTable,
  legacyChaptersTable,
  legacyPlaceDiscoveriesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { getConsentedMemberIds } from "../lib/legacy-consent";
import { distanceMeters } from "../lib/geo";
import { syncAchievements } from "./legacy-achievements";

const CHECKIN_RADIUS_METERS = 500;

const router = Router();

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
  discovered: boolean;
  discoveredAt: string | null;
  discoveredBy: string | null;
}

async function isMember(userId: number, familyId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: familyMembersTable.id })
    .from(familyMembersTable)
    .where(and(
      eq(familyMembersTable.family_id, familyId),
      eq(familyMembersTable.user_id, userId),
      inArray(familyMembersTable.status, ["active", "invited"]),
    ))
    .limit(1);
  return !!row;
}

router.get(
  "/legacy/map/:familyId",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = parseInt(String(req.params.familyId), 10);
    if (isNaN(familyId)) {
      return res.status(400).json({ error: "Invalid family ID" });
    }

    try {
      const consentedIdSet = await getConsentedMemberIds(familyId);
      const consentedIds = Array.from(consentedIdSet);

      const [places, events, chapters, discoveries] = await Promise.all([
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
            createdAt: familyPlacesTable.created_at,
          })
          .from(familyPlacesTable)
          .where(eq(familyPlacesTable.family_id, familyId))
          .orderBy(desc(familyPlacesTable.created_at)),
        consentedIds.length > 0
          ? db
            .select({
              placeId: familyEventsTable.place_id,
              eventDate: familyEventsTable.event_date,
            })
            .from(familyEventsTable)
            .where(and(
              eq(familyEventsTable.family_id, familyId),
              inArray(familyEventsTable.member_id, consentedIds),
            ))
          : Promise.resolve([]),
        db
          .select({
            chapterId: legacyChaptersTable.id,
            chapterNumber: legacyChaptersTable.chapter_number,
            chapterData: legacyChaptersTable.chapter_data,
            worldId: legacyWorldsTable.id,
          })
          .from(legacyChaptersTable)
          .innerJoin(legacyWorldsTable, eq(legacyChaptersTable.world_id, legacyWorldsTable.id))
          .where(eq(legacyChaptersTable.family_id, familyId))
          .orderBy(desc(legacyWorldsTable.created_at)),
        db
          .select({
            placeId:      legacyPlaceDiscoveriesTable.place_id,
            createdAt:    legacyPlaceDiscoveriesTable.created_at,
            userId:       legacyPlaceDiscoveriesTable.discovered_by_user_id,
            memberName:   familyMembersTable.display_name,
          })
          .from(legacyPlaceDiscoveriesTable)
          .leftJoin(
            familyMembersTable,
            and(
              eq(familyMembersTable.family_id, familyId),
              eq(familyMembersTable.user_id, legacyPlaceDiscoveriesTable.discovered_by_user_id),
            ),
          )
          .where(eq(legacyPlaceDiscoveriesTable.family_id, familyId)),
      ]);

      const earliestYearByPlace = new Map<number, number>();
      for (const e of events) {
        if (e.placeId == null) continue;
        const year = e.eventDate ? new Date(e.eventDate).getFullYear() : null;
        if (year !== null) {
          const existing = earliestYearByPlace.get(e.placeId);
          if (existing === undefined || year < existing) {
            earliestYearByPlace.set(e.placeId, year);
          }
        }
      }

      const discoveryByPlace = new Map<number, { createdAt: Date; label: string | null }>();
      for (const d of discoveries) {
        discoveryByPlace.set(d.placeId, { createdAt: d.createdAt, label: d.memberName });
      }

      const chapterNumbersByPlace = new Map<number, Set<number>>();
      for (const c of chapters) {
        const data = c.chapterData as Record<string, unknown> | null;
        const placeIds = Array.isArray(data?.placeIds) ? (data!.placeIds as number[]) : [];
        for (const pid of placeIds) {
          if (!chapterNumbersByPlace.has(pid)) {
            chapterNumbersByPlace.set(pid, new Set());
          }
          chapterNumbersByPlace.get(pid)!.add(c.chapterNumber);
        }
      }

      const mapPlaces: MapPlace[] = places.map((p) => {
        const discovery = discoveryByPlace.get(p.id) ?? null;
        return {
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
          discovered: discovery !== null,
          discoveredAt: discovery?.createdAt.toISOString() ?? null,
          discoveredBy: discovery?.label ?? null,
        };
      });

      mapPlaces.sort((a, b) => {
        if (a.year !== null && b.year !== null) return a.year - b.year;
        if (a.year !== null) return -1;
        if (b.year !== null) return 1;
        return 0;
      });

      const withCoordinates = mapPlaces.filter((p) => p.lat !== null && p.lng !== null);
      const route: [number, number][] = withCoordinates.map((p) => [p.lat!, p.lng!]);

      return res.json({
        places: mapPlaces,
        placesWithCoordinates: withCoordinates.length,
        placesWithoutCoordinates: mapPlaces.length - withCoordinates.length,
        placesDiscovered: mapPlaces.filter((p) => p.discovered).length,
        route,
      });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-map: read failed");
      return res.status(500).json({ error: "Failed to load world map" });
    }
  },
);

router.post(
  "/legacy/map/:familyId/places/:placeId/checkin",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = parseInt(String(req.params.familyId), 10);
    const placeId = parseInt(String(req.params.placeId), 10);
    if (isNaN(familyId) || isNaN(placeId)) {
      return res.status(400).json({ error: "Invalid family or place ID" });
    }

    const { lat, lng, accuracyMeters } = req.body ?? {};
    if (typeof lat !== "number" || typeof lng !== "number" || Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: "lat and lng (numbers) are required" });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: "lat/lng out of range" });
    }

    const userId = req.authenticatedUserId!;
    if (!(await isMember(userId, familyId))) {
      return res.status(403).json({ error: "Not a member of this family" });
    }

    try {
      const [place] = await db
        .select({ id: familyPlacesTable.id, lat: familyPlacesTable.lat, lng: familyPlacesTable.lng, label: familyPlacesTable.label })
        .from(familyPlacesTable)
        .where(and(eq(familyPlacesTable.id, placeId), eq(familyPlacesTable.family_id, familyId)))
        .limit(1);

      if (!place) return res.status(404).json({ error: "Place not found" });
      if (place.lat === null || place.lng === null) {
        return res.status(422).json({ error: "This place doesn't have coordinates yet — add them in the Family Vault before checking in." });
      }

      const [existing] = await db
        .select()
        .from(legacyPlaceDiscoveriesTable)
        .where(and(eq(legacyPlaceDiscoveriesTable.family_id, familyId), eq(legacyPlaceDiscoveriesTable.place_id, placeId)))
        .limit(1);

      if (existing) {
        return res.json({ discovered: true, alreadyDiscovered: true, discoveredAt: existing.created_at });
      }

      const distance = distanceMeters(lat, lng, place.lat, place.lng);
      if (distance > CHECKIN_RADIUS_METERS) {
        return res.status(422).json({
          error: `You're too far from ${place.label} to check in (${Math.round(distance)}m away, need to be within ${CHECKIN_RADIUS_METERS}m).`,
          distanceMeters: Math.round(distance),
          radiusMeters: CHECKIN_RADIUS_METERS,
        });
      }

      const [inserted] = await db
        .insert(legacyPlaceDiscoveriesTable)
        .values({
          family_id: familyId,
          place_id: placeId,
          discovered_by_user_id: userId,
          lat,
          lng,
          accuracy_meters: typeof accuracyMeters === "number" ? accuracyMeters : null,
          distance_meters: distance,
        })
        .onConflictDoNothing()
        .returning();

      if (!inserted) {
        const [winner] = await db
          .select()
          .from(legacyPlaceDiscoveriesTable)
          .where(and(eq(legacyPlaceDiscoveriesTable.family_id, familyId), eq(legacyPlaceDiscoveriesTable.place_id, placeId)))
          .limit(1);
        return res.json({ discovered: true, alreadyDiscovered: true, discoveredAt: winner?.created_at ?? new Date() });
      }

      await syncAchievements(familyId).catch((err) =>
        logger.error({ err, familyId }, "legacy-map: achievement sync after checkin failed"),
      );

      return res.status(201).json({
        discovered: true,
        alreadyDiscovered: false,
        place: place.label,
        distanceMeters: Math.round(distance),
        discoveredAt: inserted.created_at,
      });
    } catch (err) {
      logger.error({ err, familyId, placeId }, "legacy-map: checkin failed");
      return res.status(500).json({ error: "Failed to check in" });
    }
  },
);

export default router;
