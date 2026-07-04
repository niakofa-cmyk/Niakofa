/**
 * Niakofa — Google OAuth Sign-In/Join
 *
 * POST /api/auth/google
 *   Body: { id_token: string }
 *
 * Verifies the Google ID token server-side (google-auth-library), then:
 *   1. Finds by google_id  → repeat sign-in (fastest path)
 *   2. Finds by email      → account linking (email+password account gains Google)
 *   3. Creates new account → individual, auto-approved, no password needed
 *
 * Returns { user, token, created: boolean, linked: boolean }
 *   created = true  → new account was just created (route to onboarding)
 *   linked  = true  → existing email-only account now has Google linked
 *
 * Security:
 *   - ID tokens are short-lived (~1 h) and signed with Google's RSA keys.
 *   - We verify the `aud` claim against our CLIENT_ID to prevent token reuse
 *     from other Google apps pointing at the same Google account.
 *   - google_id is NEVER returned to the client (stripped from safeUser).
 *   - password_reset_code / password_reset_expires_at are also stripped.
 */
import { Router, type Request, type Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { signTokenById } from "../middlewares/auth";
import { authLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { broadcast } from "../lib/ws-hub";

const router = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// Lazy singleton — only instantiated when GOOGLE_CLIENT_ID is present.
// Avoids a crash on startup when the env var isn't set yet.
let _oauthClient: OAuth2Client | null = null;
function getOAuthClient(): OAuth2Client {
  if (!_oauthClient) _oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID);
  return _oauthClient;
}

router.post("/auth/google", authLimiter, async (req: Request, res: Response) => {
  const { id_token } = req.body as { id_token?: string };

  if (!id_token) {
    return res.status(400).json({ error: "id_token is required" });
  }

  if (!GOOGLE_CLIENT_ID) {
    logger.warn("google-auth: GOOGLE_CLIENT_ID not configured on this server");
    return res.status(503).json({
      error: "Google Sign-In is not configured on this server yet. Please use email + password to sign in.",
      error_code: "GOOGLE_NOT_CONFIGURED",
    });
  }

  // ── Verify the ID token with Google's public keys ─────────────────────────
  let googleSub: string;
  let googleEmail: string;
  let googleName: string;
  let googlePicture: string | null;

  try {
    const ticket = await getOAuthClient().verifyIdToken({
      idToken: id_token,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) throw new Error("Payload missing email");

    if (!payload.email_verified) {
      return res.status(401).json({
        error: "Your Google account email is not verified. Please verify it in Google Account settings first.",
        error_code: "EMAIL_NOT_VERIFIED",
      });
    }

    googleSub     = payload.sub;
    googleEmail   = payload.email.toLowerCase().trim();
    googleName    = (payload.name ?? payload.email.split("@")[0]).trim();
    googlePicture = payload.picture ?? null;
  } catch (err) {
    logger.warn({ err }, "google-auth: ID token verification failed");
    return res.status(401).json({
      error: "Could not verify your Google sign-in. The token may have expired — please try again.",
      error_code: "INVALID_GOOGLE_TOKEN",
    });
  }

  // ── Find or create the Niakofa account (race-safe) ───────────────────────
  //
  // Three-path flow with explicit race handling:
  //   Path 1: repeat sign-in   — find by google_id (no mutation, fastest)
  //   Path 2: account linking  — find by email, check suspension BEFORE mutating,
  //                              then atomically link google_id
  //   Path 3: new user         — INSERT with unique-violation retry so concurrent
  //                              first-time sign-ins converge to the same row
  //                              instead of both crashing with a 500
  //
  // Suspension is enforced in the earliest possible moment on each path so
  // blocked accounts are never mutated (linked) before the check fires.

  let created = false;
  let linked   = false;

  // ── Path 1: repeat sign-in ────────────────────────────────────────────────
  let [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.google_id, googleSub))
    .limit(1);

  if (!user) {
    // ── Path 2: first Google sign-in for an existing email+password account ──
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${googleEmail}`)
      .limit(1);

    if (existing) {
      // SUSPENSION CHECK before any mutation: do not link google_id to a
      // blocked account — access is denied AND the account must not gain a
      // new authentication method while suspended.
      if (existing.is_suspended) {
        return res.status(403).json({
          error: "Your account has been suspended. Please contact support@niakofa.app for help.",
          error_code: "ACCOUNT_SUSPENDED",
        });
      }

      // Link Google to the existing account.
      // Only backfill avatar_url when the account has no existing one.
      const [updated] = await db
        .update(usersTable)
        .set({
          google_id:      googleSub,
          oauth_provider: "google",
          ...(existing.avatar_url ? {} : { avatar_url: googlePicture }),
          updated_at: new Date(),
        })
        .where(eq(usersTable.id, existing.id))
        .returning();

      user   = updated;
      linked = true;
      logger.info(
        { user_id: user.id, email: googleEmail },
        "google-auth: linked Google account to existing email+password user"
      );
    } else {
      // ── Path 3: brand-new user ─────────────────────────────────────────────
      // Race-safe: concurrent first-time sign-ins (e.g. double-tap) can both
      // miss the SELECT above and reach INSERT simultaneously. The second one
      // will hit the unique constraint on `email` or `users_google_id_idx`.
      // We catch that violation and re-fetch the row that won the race,
      // returning a successful login rather than a 500.
      try {
        const [created_user] = await db
          .insert(usersTable)
          .values({
            name:            googleName,
            email:           googleEmail,
            google_id:       googleSub,
            oauth_provider:  "google",
            avatar_url:      googlePicture,
            approval_status: "approved", // Google-verified email = trusted identity
            account_type:    "individual",
            // password_hash intentionally NULL — OAuth accounts never need a password
          })
          .returning();

        user    = created_user;
        created = true;

        logger.info(
          { user_id: user.id, email: googleEmail },
          "google-auth: created new account via Google Sign-In"
        );

        // Non-blocking side-effects — fire-and-forget; never throw here
        broadcast({
          type: "new_account_pending",
          payload: {
            user_id:        user.id,
            name:           user.name,
            email:          user.email,
            account_type:   "individual",
            oauth_provider: "google",
            created_at:     user.created_at,
          },
        });

        import("../lib/mailer.js")
          .then(({ sendAlertEmail }) =>
            sendAlertEmail({
              to:      user.email,
              subject: `Welcome to Niakofa, ${user.name}! 💙`,
              title:   "Welcome to Niakofa",
              body: [
                `Hi ${user.name},`,
                "",
                "Thank you for joining Niakofa — a community where neighbors help neighbors and everyone pays it forward.",
                "",
                "You signed in with Google, so there's no password to remember. Just tap \"Continue with Google\" any time to get back in.",
                "",
                "With community love,",
                "The Niakofa Team",
              ].join("\n"),
            }).catch(() => {})
          )
          .catch(() => {});

      } catch (err: unknown) {
        // PostgreSQL unique-constraint violation code = '23505'
        // This means a concurrent request created the row first.
        // Re-fetch whichever row won (prefer by google_id, fall back to email)
        // so both concurrent requests converge to a successful login.
        const pgCode = (err as { code?: string }).code;
        if (pgCode === "23505") {
          logger.warn({ email: googleEmail, googleSub }, "google-auth: unique violation on insert — concurrent sign-in race, re-fetching winner");

          const [byGoogleId] = await db.select().from(usersTable).where(eq(usersTable.google_id, googleSub)).limit(1);
          const [byEmail]    = await db.select().from(usersTable).where(sql`lower(${usersTable.email}) = ${googleEmail}`).limit(1);
          user = byGoogleId ?? byEmail;

          if (!user) {
            // Should never happen — the unique violation proves the row exists
            logger.error({ email: googleEmail }, "google-auth: unique violation but row not found — DB inconsistency");
            throw err;
          }
        } else {
          throw err; // unexpected DB error — propagate to the 500 handler
        }
      }
    }
  }

  // ── Safety check (covers Path 1 + Path 3 re-fetch) ────────────────────────
  // Path 2 checks suspension before mutating (above). Paths 1 and 3 land here.
  // A new user (Path 3) cannot be suspended at creation, but a repeat sign-in
  // (Path 1) or a race-recovered row might have been suspended between sign-ins.
  if (user.is_suspended) {
    return res.status(403).json({
      error: "Your account has been suspended. Please contact support@niakofa.app for help.",
      error_code: "ACCOUNT_SUSPENDED",
    });
  }

  // ── Issue JWT — same as email login ───────────────────────────────────────
  const token = signTokenById(user.id, user.token_version);

  // Strip all sensitive and internal-only fields before sending to client
  const {
    password_hash,
    password_reset_code,
    password_reset_expires_at,
    google_id: _gid, // internal — never expose to clients
    ...safeUser
  } = user;

  return res.json({ user: safeUser, token, created, linked });
});

export default router;
