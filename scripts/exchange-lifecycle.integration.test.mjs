#!/usr/bin/env node
/**
 * Migration-backed Exchange API handoff lifecycle tests.
 *
 * Runs the real Exchange Express router and database against disposable local
 * PostgreSQL fixtures. It intentionally refuses non-local DATABASE_URLs.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve4 } from "node:dns/promises";
import { createRequire } from "node:module";
import { tsImport } from "tsx/esm/api";

const requireFromApiServer = createRequire(new URL("../artifacts/api-server/package.json", import.meta.url));
const requireFromDatabase = createRequire(new URL("../lib/db/package.json", import.meta.url));
const express = requireFromApiServer("express");
const request = requireFromApiServer("supertest");
const { Pool } = requireFromDatabase("pg");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for Exchange lifecycle integration.");
const databaseHost = new URL(databaseUrl).hostname.replace(/^\[|\]$/g, "");
const privateV4 = (ip) => {
  const octets = ip.split(".").map(Number);
  return octets.length === 4 && (
    octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
  );
};
let privateLocalService = false;
if (["helium", "postgres", "db"].includes(databaseHost)) {
  try {
    privateLocalService = (await resolve4(databaseHost)).some(privateV4);
  } catch {
    // Fail closed below if a disposable local service name does not resolve.
  }
}
if (!["localhost", "127.0.0.1", "::1"].includes(databaseHost) && !privateLocalService) {
  throw new Error(`Refusing Exchange lifecycle fixtures on non-local database host "${databaseHost}".`);
}

process.env.SESSION_SECRET ??= `exchange-test-${randomUUID()}`;
const pool = new Pool({ connectionString: databaseUrl, max: 4 });
const fixtureKey = randomUUID();
const fixtureUsers = [];
const fixtureListings = [];
let appPool;

const expectStatus = (response, status, label) => {
  assert.equal(response.status, status, `${label}: ${response.status} ${JSON.stringify(response.body)}`);
};

try {
  await pool.query("SELECT 1 FROM exchange_listings LIMIT 0");
  await pool.query("SELECT 1 FROM exchange_pickup_requests LIMIT 0");
  await pool.query("SELECT 1 FROM exchange_pickup_disputes LIMIT 0");
  await pool.query("SELECT 1 FROM message_notifications LIMIT 0");

  const { default: exchangeRouter } = await tsImport("../artifacts/api-server/src/routes/community-exchange.ts", import.meta.url);
  const { default: reportsRouter } = await tsImport("../artifacts/api-server/src/routes/reports.ts", import.meta.url);
  const { parseAuth, signTokenById } = await tsImport("../artifacts/api-server/src/middlewares/auth.ts", import.meta.url);
  const { expireAbandonedExchangePickups } = await tsImport("../artifacts/api-server/src/lib/scheduler.ts", import.meta.url);
  ({ pool: appPool } = await tsImport("@workspace/db", import.meta.url));

  const app = express();
  app.use(express.json());
  app.use(parseAuth);
  app.use("/api", exchangeRouter);
  app.use("/api", reportsRouter);

  const addUser = async (label, lat = 32.7555, lng = -97.3308, isAdmin = false) => {
    const result = await pool.query(`
      INSERT INTO users(name,email,approval_status,lat,lng,is_admin)
      VALUES($1,$2,'approved',$3,$4,$5)
      RETURNING id, token_version
    `, [`Exchange fixture ${label}`, `exchange-${fixtureKey}-${label}@example.invalid`, lat, lng, isAdmin]);
    const user = result.rows[0];
    fixtureUsers.push(user.id);
    return { ...user, token: signTokenById(user.id, user.token_version) };
  };
  const seller = await addUser("seller");
  const buyerA = await addUser("buyer-a");
  const buyerB = await addUser("buyer-b");
  const buyerC = await addUser("buyer-c");
  const moderator = await addUser("moderator", null, null, true);
  const legacySeller = await addUser("legacy-seller");
  const legacyBuyer = await addUser("legacy-buyer");
  const moderationReporter = await addUser("moderation-reporter");

  const api = (user) => ({
    post: (path) => request(app).post(`/api${path}`).set("Authorization", `Bearer ${user.token}`),
    patch: (path) => request(app).patch(`/api${path}`).set("Authorization", `Bearer ${user.token}`),
    get: (path) => request(app).get(`/api${path}`).set("Authorization", `Bearer ${user.token}`),
  });
  const newListing = async (owner = seller, throughApi = false) => {
    let id;
    let response = null;
    if (throughApi) {
      response = await api(owner).post("/community/exchange/listings").send({
        listing_type: "offer",
        resource_type: "goods",
        title: "Neighborhood garden tools",
        description: "A clean set of garden tools available for a neighbor.",
        category: "household",
        condition: "good",
        neighborhood: "Downtown",
        pickup_location_type: "library",
        pickup_notes: "Meet at the public library entrance.",
      });
      expectStatus(response, 201, "create listing");
      id = response.body.listing.id;
    } else {
      const result = await pool.query(`
        INSERT INTO exchange_listings(
          seller_id,listing_type,resource_type,title,description,category,condition,
          neighborhood,pickup_location_type,pickup_notes,latitude,longitude
        ) VALUES($1,'offer','goods','Neighborhood garden tools',
          'A clean set of garden tools available for a neighbor.','household','good',
          'Downtown','library','Meet at the public library entrance.',32.7555,-97.3308)
        RETURNING id
      `, [owner.id]);
      id = result.rows[0].id;
    }
    fixtureListings.push(id);
    return { id, response };
  };
  const pickupBody = {
    note: "I can use these for a community garden.",
    pickup_area: "Downtown public library",
    pickup_location_type: "library",
    pickup_note: "Meet by the main public entrance.",
    proposed_window: "Saturday afternoon",
  };
  const createPickup = async (listingId, buyer) => api(buyer)
    .post(`/community/exchange/listings/${listingId}/pickup-requests`)
    .send(pickupBody);
  const participantPickup = async (viewer, pickupId) => {
    const response = await api(viewer).get("/community/exchange/pickup-requests");
    expectStatus(response, 200, "participant pickup history");
    return response.body.pickup_requests.find((pickup) => pickup.id === pickupId);
  };
  const actionCounts = async (listingId) => {
    const result = await pool.query(`
      SELECT metadata->>'action' AS action, count(*)::int AS count
      FROM message_notifications
      WHERE metadata->>'exchange_listing_id' = $1
      GROUP BY metadata->>'action'
    `, [String(listingId)]);
    return Object.fromEntries(result.rows.map((row) => [row.action, row.count]));
  };
  const waitForActions = async (listingId, expected) => {
    const until = Date.now() + 4000;
    let found = {};
    while (Date.now() < until) {
      found = await actionCounts(listingId);
      if (Object.entries(expected).every(([action, count]) => found[action] === count)) return found;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return found;
  };
  const listingState = async (listingId) => {
    const result = await pool.query(
      "SELECT status, moderation_status FROM exchange_listings WHERE id=$1",
      [listingId],
    );
    return result.rows[0];
  };
  const visibleListingIds = async (viewer) => {
    const response = await api(viewer).get("/community/exchange/listings");
    expectStatus(response, 200, "load public Exchange listings");
    return response.body.listings.map((listing) => listing.id);
  };
  const createModerationReport = async (listingId) => {
    const result = await pool.query(`
      INSERT INTO reports(reporter_id,reported_user_id,reported_exchange_listing_id,type,description)
      VALUES($1,$2,$3,'other','Disposable fixture report for Exchange moderation lifecycle.')
      RETURNING id
    `, [moderationReporter.id, seller.id, listingId]);
    return result.rows[0].id;
  };
  const reviewReport = async (reportId, status) => api(moderator)
    .patch(`/reports/${reportId}/review`)
    .send({ status, admin_notes: "Disposable integration-test moderation action." });
  const assertNotPublic = async (listingId, viewer, label) => {
    assert.equal((await visibleListingIds(viewer)).includes(listingId), false, `${label}: listing feed must hide it`);
    expectStatus(await api(viewer).get(`/community/exchange/listings/${listingId}`), 404, `${label}: public detail must hide it`);
  };
  const pickupState = async (pickupId) => {
    const result = await pool.query(
      "SELECT status FROM exchange_pickup_requests WHERE id=$1",
      [pickupId],
    );
    return result.rows[0]?.status;
  };
  const dueAcceptedSnapshot = async (now, excludedPickupId) => {
    const result = await pool.query(`
      SELECT pickup.id AS pickup_id, pickup.status AS pickup_status,
             listing.id AS listing_id, listing.status AS listing_status,
             listing.moderation_status
      FROM exchange_pickup_requests pickup
      JOIN exchange_listings listing ON listing.id = pickup.listing_id
      WHERE pickup.status = 'accepted'
        AND pickup.coordination_expires_at <= $1
        AND pickup.id <> $2
      ORDER BY pickup.id
    `, [now, excludedPickupId]);
    return result.rows;
  };

  // Public listing and request payloads must keep coordinates private, and
  // precise addresses/contact details must fail closed.
  const privacyListing = await newListing(seller, true);
  for (const privateValue of ["123 Main Street", "Call me at 817-555-0199"]) {
    const invalid = await api(seller).post("/community/exchange/listings").send({
      listing_type: "offer",
      resource_type: "goods",
      title: "Neighborhood garden tools",
      description: `A clean set available. ${privateValue}`,
      category: "household",
      condition: "good",
      neighborhood: "Downtown",
      pickup_location_type: "library",
      pickup_notes: "Meet at the public library entrance.",
    });
    expectStatus(invalid, 400, "reject precise listing location/contact detail");
  }
  assert.equal("latitude" in privacyListing.response.body.listing, false);
  assert.equal("longitude" in privacyListing.response.body.listing, false);
  assert.equal(privacyListing.response.body.listing.pickup_location_type, "library");
  const storedCoordinates = await pool.query(
    "SELECT latitude, longitude FROM exchange_listings WHERE id=$1",
    [privacyListing.id],
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(storedCoordinates.rows[0]).map(([key, value]) => [key, Math.round(value * 100) / 100])),
    { latitude: 32.76, longitude: -97.33 },
    "matching coordinates are rounded at rest while remaining absent from API output",
  );
  const publicDetails = await api(buyerA).get(`/community/exchange/listings/${privacyListing.id}`);
  expectStatus(publicDetails, 200, "public listing detail");
  assert.equal("latitude" in publicDetails.body.listing, false);
  assert.equal("longitude" in publicDetails.body.listing, false);
  const invalidPickup = await api(buyerA)
    .post(`/community/exchange/listings/${privacyListing.id}/pickup-requests`)
    .send({ ...pickupBody, pickup_area: "123 Main Street" });
  expectStatus(invalidPickup, 400, "reject precise pickup location");
  const invalidStructuredLocation = await api(buyerA)
    .post(`/community/exchange/listings/${privacyListing.id}/pickup-requests`)
    .send({ ...pickupBody, pickup_location_type: "private_home" });
  expectStatus(invalidStructuredLocation, 400, "reject non-public structured pickup location");
  const privatePickupNote = await api(buyerA)
    .post(`/community/exchange/listings/${privacyListing.id}/pickup-requests`)
    .send({ ...pickupBody, pickup_note: "Meet at 123 Main Street." });
  expectStatus(privatePickupNote, 400, "reject precise address in pickup notes");
  const structuredPickup = await createPickup(privacyListing.id, buyerA);
  expectStatus(structuredPickup, 201, "create structured pickup request");
  assert.equal(structuredPickup.body.pickup_request.pickup_location_type, "library");
  assert.equal(structuredPickup.body.pickup_request.pickup_note, "Meet by the main public entrance.");
  const pickupRequests = await api(buyerA).get("/community/exchange/pickup-requests");
  expectStatus(pickupRequests, 200, "get pickup requests");
  const listedStructuredPickup = pickupRequests.body.pickup_requests
    .find((pickup) => pickup.id === structuredPickup.body.pickup_request.id);
  assert.equal(listedStructuredPickup.pickup_location_type, "library");
  assert.equal(listedStructuredPickup.pickup_note, "Meet by the main public entrance.");

  // Older clients omit the newly structured location enum. Both listing and
  // pickup creation remain compatible and persist the safe public-place default.
  const legacyListingResponse = await api(legacySeller)
    .post("/community/exchange/listings")
    .send({
      listing_type: "offer",
      resource_type: "goods",
      title: "Legacy client garden supplies",
      description: "A safe default location for an older client listing.",
      category: "household",
      condition: "good",
      neighborhood: "Downtown",
      pickup_notes: "Meet at the public library entrance.",
    });
  expectStatus(legacyListingResponse, 201, "legacy listing without pickup_location_type");
  const legacyListingId = legacyListingResponse.body.listing.id;
  fixtureListings.push(legacyListingId);
  assert.equal(legacyListingResponse.body.listing.pickup_location_type, "other_public");
  const legacyPickupResponse = await api(legacyBuyer)
    .post(`/community/exchange/listings/${legacyListingId}/pickup-requests`)
    .send({
      note: "I can use these for a community garden.",
      pickup_area: "Downtown public library",
      proposed_window: "Saturday afternoon",
    });
  expectStatus(legacyPickupResponse, 201, "legacy pickup request without pickup_location_type");
  assert.equal(legacyPickupResponse.body.pickup_request.pickup_location_type, "other_public");

  // A buyer cannot create a second active pickup request for one listing.
  const duplicateListing = await newListing();
  expectStatus(await createPickup(duplicateListing.id, buyerC), 201, "create first pickup request");
  expectStatus(await createPickup(duplicateListing.id, buyerC), 409, "reject duplicate active pickup request");
  const duplicateRows = await pool.query(
    "SELECT count(*)::int AS count FROM exchange_pickup_requests WHERE listing_id=$1 AND buyer_id=$2",
    [duplicateListing.id, buyerC.id],
  );
  assert.equal(duplicateRows.rows[0].count, 1, "duplicate attempts must not create another row");

  // Two buyers can request the same listing, but concurrent seller acceptance
  // must reserve it for exactly one buyer.
  const raceListing = await newListing();
  const [requestA, requestB] = await Promise.all([
    createPickup(raceListing.id, buyerA),
    createPickup(raceListing.id, buyerB),
  ]);
  expectStatus(requestA, 201, "buyer A pickup request");
  expectStatus(requestB, 201, "buyer B pickup request");
  const concurrentAccepts = await Promise.all([
    api(seller).post(`/community/exchange/pickup-requests/${requestA.body.pickup_request.id}/accept`),
    api(seller).post(`/community/exchange/pickup-requests/${requestB.body.pickup_request.id}/accept`),
  ]);
  assert.deepEqual(concurrentAccepts.map((r) => r.status).sort(), [200, 409]);
  const acceptedListingState = await listingState(raceListing.id);
  assert.equal(acceptedListingState.status, "reserved");
  const concurrentRows = await pool.query(
    "SELECT status,count(*)::int AS count FROM exchange_pickup_requests WHERE listing_id=$1 GROUP BY status",
    [raceListing.id],
  );
  assert.equal(concurrentRows.rows.filter((r) => r.status === "accepted").reduce((n, r) => n + r.count, 0), 1);
  const winner = concurrentAccepts.find((r) => r.status === 200).body.pickup_request;
  const raceActions = await waitForActions(raceListing.id, { request_created: 2, request_accepted: 1 });
  assert.equal(raceActions.request_accepted, 1, "only the winning acceptance notifies its buyer");

  // Cancellation and acceptance serialize on the pickup row. The only valid
  // terminal outcomes are an active/cancelled handoff or a reserved/accepted
  // handoff; mixed listing/request states are invalid.
  const cancelListing = await newListing();
  const cancelRequest = await createPickup(cancelListing.id, buyerC);
  expectStatus(cancelRequest, 201, "create cancellation-race pickup");
  const [acceptRace, cancelRace] = await Promise.all([
    api(seller).post(`/community/exchange/pickup-requests/${cancelRequest.body.pickup_request.id}/accept`),
    api(buyerC).post(`/community/exchange/pickup-requests/${cancelRequest.body.pickup_request.id}/cancel`),
  ]);
  assert.ok([200, 409].includes(acceptRace.status), `accept race returned ${acceptRace.status}`);
  expectStatus(cancelRace, 200, "cancel-vs-accept race");
  const cancelTerminal = await pickupState(cancelRequest.body.pickup_request.id);
  const cancelListingTerminal = await listingState(cancelListing.id);
  assert.equal(cancelTerminal, "cancelled");
  assert.equal(cancelListingTerminal.status, "active", "cancelled coordination releases the listing hold");

  // Confirm-vs-cancel races also leave no dangling listing hold. If the
  // confirmation gets the row first, cancellation can still safely terminate
  // the not-yet-completed handoff.
  const confirmCancelListing = await newListing();
  const confirmCancelRequest = await createPickup(confirmCancelListing.id, buyerA);
  expectStatus(confirmCancelRequest, 201, "create confirm/cancel pickup");
  const confirmCancelId = confirmCancelRequest.body.pickup_request.id;
  expectStatus(await api(seller).post(`/community/exchange/pickup-requests/${confirmCancelId}/accept`), 200, "accept confirm/cancel pickup");
  const [confirmRace, cancelAfterConfirmRace] = await Promise.all([
    api(buyerA).post(`/community/exchange/pickup-requests/${confirmCancelId}/confirm-complete`),
    api(buyerA).post(`/community/exchange/pickup-requests/${confirmCancelId}/cancel`),
  ]);
  assert.ok([200, 409].includes(confirmRace.status), `confirmation race returned ${confirmRace.status}`);
  expectStatus(cancelAfterConfirmRace, 200, "confirm-vs-cancel race");
  assert.equal(await pickupState(confirmCancelId), "cancelled");
  assert.equal((await listingState(confirmCancelListing.id)).status, "active");

  // An accepted handoff can be placed on hold by either participant and only
  // an admin can resolve it. A cancellation outcome releases the listing;
  // repeated opening/resolution attempts cannot add duplicate notifications.
  const disputeListing = await newListing();
  const disputeRequest = await createPickup(disputeListing.id, buyerB);
  expectStatus(disputeRequest, 201, "create disputed pickup");
  const disputeId = disputeRequest.body.pickup_request.id;
  expectStatus(await api(seller).post(`/community/exchange/pickup-requests/${disputeId}/accept`), 200, "accept disputed pickup");
  const privateDisputeReason = "Private grievance: the agreed handoff changed after arrival.";
  const privateDisputeEvidence = "Confidential supporting detail marker: EVIDENCE-ALPHA-4429.";
  const openedDispute = await api(buyerB)
    .post(`/community/exchange/pickup-requests/${disputeId}/dispute`)
    .send({ reason: privateDisputeReason, evidence: privateDisputeEvidence });
  expectStatus(openedDispute, 201, "open pickup dispute");
  assert.equal(openedDispute.body.pickup_request.status, "disputed");
  assert.equal((await listingState(disputeListing.id)).status, "reserved", "dispute preserves the listing hold");
  const participantDispute = await participantPickup(buyerB, disputeId);
  assert.ok(participantDispute);
  assert.ok(participantDispute.dispute);
  for (const privateField of ["reason", "evidence", "resolution"]) {
    assert.equal(privateField in participantDispute.dispute, false,
      `participant GET must not expose private dispute ${privateField}`);
  }
  const sellerDisputeView = await participantPickup(seller, disputeId);
  for (const privateField of ["reason", "evidence", "resolution"]) {
    assert.equal(privateField in sellerDisputeView.dispute, false,
      `other participant GET must not expose private dispute ${privateField}`);
  }
  expectStatus(await api(buyerB).get("/community/exchange/disputes"), 403, "participants cannot access moderator dispute queue");
  const moderatorDisputes = await api(moderator).get("/community/exchange/disputes");
  expectStatus(moderatorDisputes, 200, "admin gets private dispute details");
  const moderatorDispute = moderatorDisputes.body.disputes.find((dispute) => dispute.pickup_request_id === disputeId);
  assert.ok(moderatorDispute);
  assert.equal(moderatorDispute.reason, privateDisputeReason);
  assert.equal(moderatorDispute.evidence, privateDisputeEvidence);
  expectStatus(
    await api(buyerB).post(`/community/exchange/pickup-requests/${disputeId}/dispute`)
      .send({ reason: "A repeated dispute should be rejected." }),
    409,
    "reject duplicate active dispute",
  );
  expectStatus(
    await api(seller).post(`/community/exchange/pickup-requests/${disputeId}/resolve-dispute`)
      .send({ outcome: "cancel", resolution: "Reviewed the report and cancelled this coordination." }),
    403,
    "require admin for dispute resolution",
  );
  const privateResolution = "Moderator confidential note: cancellation was the safe outcome.";
  const cancelledDispute = await api(moderator)
    .post(`/community/exchange/pickup-requests/${disputeId}/resolve-dispute`)
    .send({ outcome: "cancel", resolution: privateResolution });
  expectStatus(cancelledDispute, 200, "admin resolves dispute as cancellation");
  assert.equal(cancelledDispute.body.dispute.status, "resolved");
  assert.equal(cancelledDispute.body.dispute.outcome, "cancel");
  // Resolution response is moderator-only; participant history only carries
  // non-sensitive lifecycle state and never the private narrative.
  assert.equal(cancelledDispute.body.dispute.resolution, privateResolution);
  assert.equal(await pickupState(disputeId), "cancelled");
  assert.equal((await listingState(disputeListing.id)).status, "active");
  const resolvedParticipantView = await participantPickup(buyerB, disputeId);
  for (const privateField of ["reason", "evidence", "resolution"]) {
    assert.equal(privateField in resolvedParticipantView.dispute, false,
      `participant GET must not expose resolved dispute ${privateField}`);
  }
  expectStatus(
    await api(moderator).post(`/community/exchange/pickup-requests/${disputeId}/resolve-dispute`)
      .send({ outcome: "cancel", resolution: "A second resolution must not change terminal state." }),
    409,
    "reject repeat dispute resolution",
  );
  const disputeActions = await waitForActions(disputeListing.id, {
    request_created: 1,
    request_accepted: 1,
    dispute_opened: 1,
    dispute_resolved: 2,
  });
  assert.deepEqual(disputeActions, {
    request_created: 1,
    request_accepted: 1,
    dispute_opened: 1,
    dispute_resolved: 2,
  });

  // The moderator's completion outcome also closes the request and listing
  // atomically, rather than releasing an item already adjudicated complete.
  const disputeCompleteListing = await newListing();
  const disputeCompleteRequest = await createPickup(disputeCompleteListing.id, buyerC);
  expectStatus(disputeCompleteRequest, 201, "create completion dispute pickup");
  const disputeCompleteId = disputeCompleteRequest.body.pickup_request.id;
  expectStatus(await api(seller).post(`/community/exchange/pickup-requests/${disputeCompleteId}/accept`), 200, "accept completion dispute pickup");
  expectStatus(
    await api(seller).post(`/community/exchange/pickup-requests/${disputeCompleteId}/dispute`)
      .send({ reason: "The participants disagree about whether the handoff was completed." }),
    201,
    "seller opens completion dispute",
  );
  const completedDispute = await api(moderator)
    .post(`/community/exchange/pickup-requests/${disputeCompleteId}/resolve-dispute`)
    .send({ outcome: "complete", resolution: "Available evidence confirms that the handoff was completed." });
  expectStatus(completedDispute, 200, "admin resolves dispute as complete");
  assert.equal(await pickupState(disputeCompleteId), "completed");
  assert.equal((await listingState(disputeCompleteListing.id)).status, "completed");

  // Race the fixture-scoped expiry worker against the participant dispute
  // request. Each operation locks the same pickup before the listing; exactly
  // one terminal path may win, and the worker must not expire any other due row.
  const expiryRaceListing = await newListing();
  const expiryRacePickup = await createPickup(expiryRaceListing.id, buyerA);
  expectStatus(expiryRacePickup, 201, "create expiry/dispute race pickup");
  const expiryRacePickupId = expiryRacePickup.body.pickup_request.id;
  expectStatus(await api(seller).post(`/community/exchange/pickup-requests/${expiryRacePickupId}/accept`), 200,
    "accept expiry/dispute race pickup");
  const simulatedExpiryTime = new Date(Date.now() + 49 * 60 * 60 * 1000);
  const otherDuePickupsBefore = await dueAcceptedSnapshot(simulatedExpiryTime, expiryRacePickupId);
  const [expiredPickups, disputeRaceResponse] = await Promise.all([
    expireAbandonedExchangePickups(simulatedExpiryTime, expiryRacePickupId),
    api(buyerA).post(`/community/exchange/pickup-requests/${expiryRacePickupId}/dispute`)
      .send({ reason: "The participant is disputing this handoff before expiry." }),
  ]);
  assert.deepEqual(await dueAcceptedSnapshot(simulatedExpiryTime, expiryRacePickupId), otherDuePickupsBefore,
    "fixture-scoped expiry leaves all other eligible pickups and listings unchanged");
  assert.ok([201, 409].includes(disputeRaceResponse.status),
    `dispute/expiry race returned ${disputeRaceResponse.status}`);
  const expiredIds = expiredPickups.map((pickup) => pickup.id);
  const racePickupTerminal = await pickupState(expiryRacePickupId);
  const raceListingTerminal = await listingState(expiryRaceListing.id);
  if (disputeRaceResponse.status === 201) {
    assert.deepEqual(expiredIds, [], "expiry must lose after a dispute opens");
    assert.equal(racePickupTerminal, "disputed");
    assert.equal(raceListingTerminal.status, "reserved");
  } else {
    assert.deepEqual(expiredIds, [expiryRacePickupId], "the scoped worker can return only its fixture pickup");
    assert.equal(racePickupTerminal, "expired");
    assert.equal(raceListingTerminal.status, "active");
  }

  // Cancelling an accepted pickup while its listing is held archives it. The
  // moderation release alone must not republish it; the owner explicitly
  // renews the approved archive.
  const heldCancelListing = await newListing();
  const heldCancelPickup = await createPickup(heldCancelListing.id, buyerA);
  expectStatus(heldCancelPickup, 201, "create held-cancel pickup");
  const heldCancelPickupId = heldCancelPickup.body.pickup_request.id;
  expectStatus(await api(seller).post(`/community/exchange/pickup-requests/${heldCancelPickupId}/accept`), 200, "accept held-cancel pickup");
  const heldCancelReportId = await createModerationReport(heldCancelListing.id);
  expectStatus(await reviewReport(heldCancelReportId, "under_review"), 200, "moderator holds listing");
  assert.equal((await listingState(heldCancelListing.id)).moderation_status, "held");
  await assertNotPublic(heldCancelListing.id, buyerC, "held reserved listing");
  expectStatus(await api(buyerA).post(`/community/exchange/pickup-requests/${heldCancelPickupId}/cancel`), 200, "cancel accepted pickup on held listing");
  assert.equal(await pickupState(heldCancelPickupId), "cancelled");
  const heldCancelState = await listingState(heldCancelListing.id);
  assert.equal(heldCancelState.status, "archived");
  assert.equal(heldCancelState.moderation_status, "held");
  await assertNotPublic(heldCancelListing.id, buyerC, "cancelled pickup still held for review");
  expectStatus(await reviewReport(heldCancelReportId, "resolved_dismissed"), 200, "moderator releases cancelled listing");
  const releasedCancelState = await listingState(heldCancelListing.id);
  assert.deepEqual(releasedCancelState, { status: "archived", moderation_status: "approved" });
  await assertNotPublic(heldCancelListing.id, buyerC, "approved archive remains hidden until owner renewal");
  expectStatus(await api(seller).post(`/community/exchange/listings/${heldCancelListing.id}/renew`), 200,
    "seller renews approved listing after held cancellation");
  assert.deepEqual(await listingState(heldCancelListing.id), { status: "active", moderation_status: "approved" });
  assert.ok((await visibleListingIds(buyerC)).includes(heldCancelListing.id),
    "only explicit seller renewal makes the held-cancellation listing discoverable");

  // A held listing whose disputed pickup is resolved as cancelled stays
  // undiscoverable until moderator release, then returns to a consistent,
  // active/approved state rather than remaining reserved or leaking early.
  const heldDisputeListing = await newListing();
  const heldDisputePickup = await createPickup(heldDisputeListing.id, buyerB);
  expectStatus(heldDisputePickup, 201, "create held-dispute pickup");
  const heldDisputePickupId = heldDisputePickup.body.pickup_request.id;
  expectStatus(await api(seller).post(`/community/exchange/pickup-requests/${heldDisputePickupId}/accept`), 200, "accept held-dispute pickup");
  expectStatus(
    await api(buyerB).post(`/community/exchange/pickup-requests/${heldDisputePickupId}/dispute`)
      .send({ reason: "The participants cannot agree on the safe handoff outcome." }),
    201,
    "open dispute before moderation hold",
  );
  const heldDisputeReportId = await createModerationReport(heldDisputeListing.id);
  expectStatus(await reviewReport(heldDisputeReportId, "under_review"), 200, "moderator holds disputed listing");
  await assertNotPublic(heldDisputeListing.id, buyerC, "disputed held listing");
  expectStatus(
    await api(moderator).post(`/community/exchange/pickup-requests/${heldDisputePickupId}/resolve-dispute`)
      .send({ outcome: "cancel", resolution: "Reviewed the case and cancelled the disputed handoff." }),
    200,
    "resolve dispute while listing is held",
  );
  assert.equal(await pickupState(heldDisputePickupId), "cancelled");
  assert.equal((await listingState(heldDisputeListing.id)).moderation_status, "held");
  await assertNotPublic(heldDisputeListing.id, buyerC, "dispute cancellation cannot bypass moderation hold");
  expectStatus(await reviewReport(heldDisputeReportId, "resolved_dismissed"), 200, "moderator releases dispute-resolved listing");
  const releasedDisputeState = await listingState(heldDisputeListing.id);
  assert.deepEqual(releasedDisputeState, { status: "archived", moderation_status: "approved" });
  await assertNotPublic(heldDisputeListing.id, buyerC,
    "moderator release does not automatically republish a dispute-archived listing");
  expectStatus(await api(seller).post(`/community/exchange/listings/${heldDisputeListing.id}/renew`), 200,
    "seller explicitly renews an approved dispute-archived listing");
  assert.deepEqual(await listingState(heldDisputeListing.id), { status: "active", moderation_status: "approved" });
  assert.ok((await visibleListingIds(buyerC)).includes(heldDisputeListing.id),
    "only explicit seller renewal republishes the dispute-archived listing");

  // Expiry while a listing is moderation-held archives it. Approving the
  // moderation report alone must not put the expired handoff's listing back
  // into discovery; only explicit owner renewal may do that.
  const heldExpiryListing = await newListing();
  const heldExpiryPickup = await createPickup(heldExpiryListing.id, buyerC);
  expectStatus(heldExpiryPickup, 201, "create held-expiry pickup");
  const heldExpiryPickupId = heldExpiryPickup.body.pickup_request.id;
  expectStatus(await api(seller).post(`/community/exchange/pickup-requests/${heldExpiryPickupId}/accept`), 200,
    "accept held-expiry pickup");
  const heldExpiryReportId = await createModerationReport(heldExpiryListing.id);
  expectStatus(await reviewReport(heldExpiryReportId, "under_review"), 200, "moderator holds expiry listing");
  assert.deepEqual(
    (await expireAbandonedExchangePickups(simulatedExpiryTime, heldExpiryPickupId)).map((pickup) => pickup.id),
    [heldExpiryPickupId],
    "scoped scheduler expires the held fixture pickup",
  );
  assert.equal(await pickupState(heldExpiryPickupId), "expired");
  assert.deepEqual(await listingState(heldExpiryListing.id), { status: "archived", moderation_status: "held" });
  await assertNotPublic(heldExpiryListing.id, buyerA, "expired pickup on moderation-held listing");
  expectStatus(await reviewReport(heldExpiryReportId, "resolved_dismissed"), 200, "moderator approves expired listing");
  assert.deepEqual(await listingState(heldExpiryListing.id), { status: "archived", moderation_status: "approved" });
  await assertNotPublic(heldExpiryListing.id, buyerA, "moderation approval does not republish expired listing");
  expectStatus(await api(seller).post(`/community/exchange/listings/${heldExpiryListing.id}/renew`), 200,
    "owner explicitly renews approved expired listing");
  assert.deepEqual(await listingState(heldExpiryListing.id), { status: "active", moderation_status: "approved" });
  assert.ok((await visibleListingIds(buyerA)).includes(heldExpiryListing.id),
    "owner renewal makes the approved expired listing discoverable");

  // Normal two-party completion is terminal; further confirmations are
  // rejected and cannot emit duplicate handoff-completed notifications.
  const completionListing = await newListing();
  const completionRequest = await createPickup(completionListing.id, buyerB);
  expectStatus(completionRequest, 201, "create completion pickup");
  const completionId = completionRequest.body.pickup_request.id;
  expectStatus(await api(seller).post(`/community/exchange/pickup-requests/${completionId}/accept`), 200, "accept completion pickup");
  const buyerConfirmed = await api(buyerB).post(`/community/exchange/pickup-requests/${completionId}/confirm-complete`);
  expectStatus(buyerConfirmed, 200, "buyer confirms handoff");
  assert.equal(buyerConfirmed.body.awaiting_other_confirmation, true);
  const repeatedBuyerConfirmation = await api(buyerB)
    .post(`/community/exchange/pickup-requests/${completionId}/confirm-complete`);
  assert.ok([200, 409].includes(repeatedBuyerConfirmation.status),
    `repeated confirmation returned ${repeatedBuyerConfirmation.status}`);
  assert.deepEqual(
    await waitForActions(completionListing.id, {
      request_created: 1,
      request_accepted: 1,
      handoff_confirmation_recorded: 1,
    }),
    { request_created: 1, request_accepted: 1, handoff_confirmation_recorded: 1 },
    "retrying one participant's confirmation does not emit another notification",
  );
  const sellerConfirmed = await api(seller).post(`/community/exchange/pickup-requests/${completionId}/confirm-complete`);
  expectStatus(sellerConfirmed, 200, "seller confirms handoff");
  assert.equal(sellerConfirmed.body.pickup_request.status, "completed");
  const notificationsBeforeRepeat = await waitForActions(completionListing.id, {
    request_created: 1,
    request_accepted: 1,
    handoff_confirmation_recorded: 1,
    handoff_completed: 1,
  });
  assert.deepEqual(notificationsBeforeRepeat, {
    request_created: 1,
    request_accepted: 1,
    handoff_confirmation_recorded: 1,
    handoff_completed: 1,
  });
  expectStatus(
    await api(seller).post(`/community/exchange/pickup-requests/${completionId}/confirm-complete`),
    409,
    "reject repeated confirmation after completion",
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.deepEqual(await actionCounts(completionListing.id), notificationsBeforeRepeat);
  assert.equal((await listingState(completionListing.id)).status, "completed");

  console.log("Exchange lifecycle integration passed against the migrated database and actual API router.");
} finally {
  if (fixtureListings.length) {
    await pool.query("DELETE FROM message_notifications WHERE metadata->>'exchange_listing_id' = ANY($1::text[])", [
      fixtureListings.map(String),
    ]).catch(() => {});
    await pool.query(`
      DELETE FROM exchange_pickup_disputes
      WHERE pickup_request_id IN (
        SELECT id FROM exchange_pickup_requests WHERE listing_id = ANY($1::int[])
      )
    `, [fixtureListings]).catch(() => {});
    await pool.query("DELETE FROM exchange_moderation_review_history WHERE listing_id = ANY($1::int[])", [fixtureListings]).catch(() => {});
    await pool.query("DELETE FROM reports WHERE reported_exchange_listing_id = ANY($1::int[])", [fixtureListings]).catch(() => {});
    await pool.query("DELETE FROM exchange_pickup_requests WHERE listing_id = ANY($1::int[])", [fixtureListings]).catch(() => {});
    await pool.query("DELETE FROM exchange_listings WHERE id = ANY($1::int[])", [fixtureListings]).catch(() => {});
  }
  if (fixtureUsers.length) {
    await pool.query("DELETE FROM users WHERE id = ANY($1::int[])", [fixtureUsers]).catch(() => {});
  }
  await pool.end();
  if (appPool && appPool !== pool) await appPool.end();
}