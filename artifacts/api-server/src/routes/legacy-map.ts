import { Router } from "express";
import { eq, and, inArray, desc } from "drizzle-orm";
import { z } from "zod";
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
import { stripTags } from "../lib/sanitize";
import { logWorldEvolution } from "../lib/legacy-world-evolution";
import { broadcast } from "../lib/ws-hub";

const CHECKIN_RADIUS_METERS = 500;
const CAN_WRITE_ROLES: string[] = ["owner", "curator", "contributor"];

const router = Router();

const CreatePlaceSchema = z.object({
  label: z.string().min(1).max(200).transform((s) => stripTags(s)),
  placeType: z.enum(["village", "town", "city", "school", "church", "cemetery", "business", "landmark"]).optional(),
  country: z.string().max(100).optional().transform((s) => (s ? stripTags(s) : s)),
  region: z.string().max(100).optional().transform((s) => (s ? stripTags(s) : s)),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  notes: z.string().max(2000).optional().transform((s) => (s ? stripTags(s) : s)),
});

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

// POST /legacy/map/:familyId/places — tag a new family landmark
//
// This is the write path family_places never had: the schema, the map read
// side (above), and even the GPS check-in flow all assumed places existed,
// but nothing let a family actually add one. "A tagged family landmark
// expands the exploration map" only becomes true once this exists.
router.post(
  "/legacy/map/:familyId/places",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = parseInt(String(req.params.familyId), 10);
    if (isNaN(familyId)) return res.status(400).json({ error: "Invalid family ID" });

    const userId = req.authenticatedUserId!;
    const [membership] = await db
      .select({ role: familyMembersTable.role })
      .from(familyMembersTable)
      .where(and(
        eq(familyMembersTable.family_id, familyId),
        eq(familyMembersTable.user_id, userId),
        eq(familyMembersTable.status, "active"),
      ))
      .limit(1);

    if (!membership || !CAN_WRITE_ROLES.includes(membership.role as string)) {
      return res.status(403).json({ error: "Contributor access or higher required to tag a landmark" });
    }

    const parsed = CreatePlaceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    }

    const { label, placeType, country, region, lat, lng, notes } = parsed.data;

    try {
      const [place] = await db
        .insert(familyPlacesTable)
        .values({
          family_id: familyId,
          label,
          place_type: placeType ?? null,
          country: country ?? null,
          region: region ?? null,
          lat: lat ?? null,
          lng: lng ?? null,
          notes: notes ?? null,
        })
        .returning();

      broadcast({ type: "family_place_created", payload: { family_id: familyId, place_id: place.id, created_by: userId } });

      logger.info({ familyId, placeId: place.id, userId }, "legacy-map: place created");
      logWorldEvolution(familyId, "place_added", `${label} was added to the family world map`).catch(() => {});

      return res.status(201).json({ place });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-map: place creation failed");
      return res.status(500).json({ error: "Failed to tag landmark" });
    }
  },
);

export default router;
