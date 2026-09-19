# Niakofa Messages V25 Production-Hardening Package

This package completes the Messages social/communication hardening layer around the existing Direct, Request, Hub, Community and Nia architecture.

## Implemented
1. **People / Active Now**
   - \`GET /api/messages/people\`
   - approved + non-suspended users only
   - WebSocket-backed online state
   - live \`presence_update\` updates in the mobile People view

2. **Stories**
   - durable \`message_stories\` storage
   - 24-hour expiration
   - real Story composer/viewer
   - conversation avatars are not used as Story data

3. **Notifications**
   - durable \`message_notifications\` storage
   - direct-message, call and Hub notification creation
   - authenticated WebSocket notification delivery
   - read / read-all persistence
   - Messages no longer inject seeded notifications

4. **Ask Nia**
   - Messages search surface invokes the existing authenticated \`/api/nia/chat\` proxy
   - streamed SSE response is rendered inline

5. **Continuity**
   - Community/Hub links open the canonical Messages routes
   - Direct, Hub and call notifications deep-link to the corresponding conversation

6. **Evidence**
   - durable notification rows provide server-side evidence for direct sends, call-token creation and Hub messages
   - physical execution is still required to establish evidence of real user sends/calls/media/community interactions

7. **Device certification**
   - see \`DEVICE_QA.md\`
   - physical iPhone Safari and Android Chrome certification is deliberately not claimed until executed

8. **Visual pass**
   - mobile layout retains the supplied reference's hierarchy: header, search, Stories, conversation list, dedicated bottom navigation
   - safe-area-aware mobile navigation and 16px search input prevent common iOS layout failures

## Verification
Run the repository CI/typecheck/test pipeline before release. Then execute \`DEVICE_QA.md\` against the exact deployed commit.
