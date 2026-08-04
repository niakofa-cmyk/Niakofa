---
name: Niakofa login token
description: Login route was issuing email-based tokens incompatible with HMAC verifier — fixed to use signTokenById.
---

# Problem
`users.ts` login route issued tokens as `${userId}.${Buffer.from(email).toString("base64url")}` but `auth.ts verifyToken` expects `${userId}.${hmac-sha256(userId, SESSION_SECRET)}`. All authenticated route calls would silently fail.

# Fix
Import `signTokenById` from `../middlewares/auth` in `users.ts` and use it: `const token = signTokenById(user.id);`

**Why:** The two token formats are incompatible — verifyToken does a timing-safe HMAC compare, not email compare.

**How to apply:** Any new login/register endpoint must use `signTokenById` — never construct token strings manually.
