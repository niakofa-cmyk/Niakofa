import { Router, type IRouter } from "express";
import healthRouter from "./health";
import verificationRouter from "./verification";
import usersRouter from "./users";
import requestsRouter from "./requests";
import helpersRouter from "./helpers";
import navigationRouter from "./navigation";
import pushRouter from "./push";
import stripeRouter from "./stripe";
import leaderboardRouter from "./leaderboard";
import gratitudeRouter from "./gratitude";
import reportsRouter from "./reports";
import civicRouter from "./civic";
import adminAnalyticsRouter from "./admin-analytics";
import adminCommunitiesRouter from "./admin-communities";
import communitiesRouter from "./communities";
import crisisRouter from "./crisis";
import recurringRouter from "./recurring";
import communityNeighborhoodsRouter from "./community-neighborhoods";
import regionCrisisResourcesRouter from "./region-crisis-resources";
import niaContextRouter from "./nia-context";
import niaVoiceRouter from "./nia-voice";
import niaProxyRouter from "./nia-proxy";
import poolRouter from "./pool";
import poolStripeReconciliationRouter from "./pool-stripe-reconciliation";
import adminPoolSettlementsRouter from "./admin-pool-settlements";
import businessesRouter from "./businesses";
import govSponsorsRouter from "./gov-sponsors";
import backgroundChecksRouter from "./background-checks";
import walletRouter from "./wallet";
import googleAuthRouter from "./google-auth";
import checkinRouter from "./checkin";
import disputesRouter from "./disputes";
import impactRouter from "./impact";
import griotRouter from "./griot";
import audioCirclesRouter from "./audio-circles";
import circleLocationRouter from "./circle-location";
import circleRecordingsRouter from "./circle-recordings";
import circleHeartbeatRouter from "./circle-heartbeat";
import circleMediaTokenRouter from "./circle-media-token";
import circleLiveKitHealthRouter from "./circle-livekit-health";
import webrtcIceRouter from "./webrtc-ice";
import coverageInterestRouter from "./coverage-interest";
import familyRouter from "./family";
import familyConsentRouter from "./family-consent";
import dnaMatchingRouter from "./dna-matching";
import diasporaResearchRouter from "./diaspora-research";
import diasporaConnectionsRouter from "./diaspora-connections";
import diasporaCompletionRouter from "./diaspora-completion";
import diasporaRouter from "./diaspora";
import legacyLaunchRouter from "./legacy-launch";

const router: IRouter = Router();

// Normalize the public Spirals compatibility prefixes once, before every
// Circle-related router below. This keeps lifecycle, LiveKit token, heartbeat,
// recording, and location routes on their existing implementations.
router.use((req, _res, next) => {
  req.url = req.url
    .replace(/^\/audio-spiral-sessions(?=\/|$)/, "/audio-circle-sessions")
    .replace(/^\/audio-spirals(?=\/|$)/, "/audio-circles");
  next();
});

router.use(healthRouter);
router.use(verificationRouter);
router.use(usersRouter);
router.use(requestsRouter);
router.use(helpersRouter);
router.use(navigationRouter);
router.use(pushRouter);
router.use(stripeRouter);
router.use(leaderboardRouter);
router.use(gratitudeRouter);
router.use(reportsRouter);
router.use(civicRouter);
router.use(adminAnalyticsRouter);
router.use(adminCommunitiesRouter);
router.use(communitiesRouter);
router.use(crisisRouter);
router.use(recurringRouter);
router.use(communityNeighborhoodsRouter);
router.use(regionCrisisResourcesRouter);
router.use(niaContextRouter);
router.use(niaVoiceRouter);
router.use(niaProxyRouter);
router.use(poolRouter);
router.use(poolStripeReconciliationRouter);
router.use(adminPoolSettlementsRouter);
router.use(businessesRouter);
router.use(govSponsorsRouter);
router.use(backgroundChecksRouter);
router.use(walletRouter);
router.use(googleAuthRouter);
router.use("/checkin", checkinRouter);
router.use(disputesRouter);
router.use(impactRouter);
router.use(griotRouter);
router.use(audioCirclesRouter);
router.use(circleLocationRouter);
router.use(circleRecordingsRouter);
router.use(circleHeartbeatRouter);
router.use(circleMediaTokenRouter);
router.use(circleLiveKitHealthRouter);
router.use(webrtcIceRouter);
router.use(coverageInterestRouter);
router.use(familyRouter);
router.use(familyConsentRouter);
router.use(dnaMatchingRouter);
router.use(diasporaResearchRouter);
router.use(diasporaConnectionsRouter);

// Must precede diasporaRouter so the corrected aggregate dashboard and durable Preserve endpoints win over older bounded implementations.
router.use(diasporaCompletionRouter);
router.use(diasporaRouter);
router.use(legacyLaunchRouter);

export default router;
