# Niakofa Messages V25 — Physical Device Certification Checklist

This checklist is intentionally execution-based. A code change or CI pass does **not** certify a physical device.

## Target
- Production: https://niakofa.com/messages
- Reference: supplied 720×1600 Messenger-style screenshot
- Devices:
  - iPhone Safari, physical device
  - Android Chrome, physical device

## iPhone Safari
- [ ] \`/messages\` opens without an error
- [ ] Messages header renders within safe area
- [ ] Back to Niakofa works
- [ ] Community action opens \`/community\`
- [ ] Search field does not trigger iOS zoom
- [ ] Ask Nia opens and streams a response
- [ ] People tab loads approved members
- [ ] Active Now dot matches live WebSocket presence
- [ ] Stories row contains only real Story records
- [ ] Create Story publishes and appears without reload
- [ ] Story viewer opens and closes
- [ ] Direct conversation opens from People/Chats
- [ ] Direct send persists after refresh
- [ ] Request conversation opens and remains authorized
- [ ] Hub conversation opens from Community/Hub
- [ ] Hub send persists after refresh
- [ ] Attachments render using authenticated media routes
- [ ] Voice call can be initiated/received
- [ ] Video call can be initiated/received
- [ ] Notifications load from durable API, not seed data
- [ ] Notification read and Mark all read persist
- [ ] Bottom navigation stays above the iOS safe-area inset
- [ ] Keyboard does not cover the composer
- [ ] No horizontal page overflow

## Android Chrome
- [ ] \`/messages\` opens without an error
- [ ] Header/search/story/list spacing matches the reference
- [ ] Ask Nia streams
- [ ] People presence updates live
- [ ] Story create/view works
- [ ] Direct/request/hub messaging works
- [ ] Attachments work
- [ ] Voice/video calling works
- [ ] Durable notifications work
- [ ] Bottom navigation remains above the navigation gesture area
- [ ] Keyboard does not cover the composer
- [ ] No horizontal page overflow

## Production evidence to capture
For each successful workflow record:
- exact production URL
- UTC timestamp
- device/browser
- logged-in test account role
- conversation/request/Hub identifier
- action performed
- expected result
- observed result
- screenshot/video where appropriate
- relevant server response or durable record identifier

Do not mark a physical-device item complete until it has actually been executed on the named device.
