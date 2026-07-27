import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireApproved } from "../middlewares/auth";
import { requireOwnership, requireAdmin } from "../middlewares/authz";
import { db, requestsTable, usersTable, transactionsTable, stripeAccountsTable, paymentTransactionsTable, requestHelpersTable, helperAvailabilityTable, userSettingsTable, businessesTable, businessMembersTable, systemSettingsTable, communityPoolLedgerTable, ratingsTable, hubCommunityLeadersTable, scheduledPaymentsTable, chatMessagesTable, reportsTable } from "@workspace/db";
import { eq, and, sql, inArray, desc } from "drizzle-orm";
import {
  GetRequestsQueryParams,
  GetRequestParams,
  CreateRequestBody,
  UpdateRequestParams,
  UpdateRequestBody,
  ClaimRequestParams,
  ClaimRequestBody,
  CompleteRequestParams,
  CompleteRequestBody,
  GetNearbyRequestsQueryParams,
  MarkEnRouteParams,
  MarkEnRouteBody,
  MarkArrivedParams,
  MarkArrivedBody,
} from "@workspace/api-zod";
import { broadcast, broadcastRequestEvent, sendToUser, sendToRequestParticipants } from "../lib/ws-hub";
import { requestCreationLimiter, adminLimiter } from "../middlewares/rate-limit";
import { enqueuePayoutRetry } from "../lib/queue";
import { sendPushToNearbyHelpers, sendPushToAllHelpers, sendPushToUser, type PushPayload } from "./push";
import { payHelperFromPool, payHelpersFromPool, getGuaranteedMinimum, isPoolEnabled, queuePendingMinimum, maybeAlertLowBalance, getHourlyMinimumRate, roundMoney } from "../lib/community-pool";
import { broadcastLeaderboardUpdate } from "./leaderboard";
import { getTrustTier, getEffectiveTier, meetsQualityGate, TIER_RANK, tierAtLeast, isSensitiveCategory, getHubLeadershipTrustBonus } from "@workspace/trust-tiers";
import type { TrustTier } from "@workspace/trust-tiers";
import { stripTags } from "../lib/sanitize";
import { logger } from "../lib/logger";
import { sendReceipt } from "../lib/mailer";
import { moderateRequestText } from "../lib/post-moderation";
import Stripe from "stripe";