# Niakofa Threads reference review

## Scope

The September 22, 2026 handoff included four uploaded Threads reference
archives:

- `threads-clone-master_1790124696455.zip`
- `Threads-Clone-Android-master_1790124699398.zip`
- `threads-app-next13-main_1790124703043.zip`
- `Threads-main_1790124705964.zip`

The archives were extracted only into a temporary directory for inspection.
They were not copied into this repository, added as dependencies, or pushed to
GitHub. The existing handoff assessment remains the source for the detailed
archive-by-archive comparison.

## Decisions

Use the archives as behavior and information-architecture references only:

- Threads-style compact post cards, author hierarchy, replies, reactions, and
  mobile-first navigation inform Community feed presentation.
- The Next.js reference informs the Community hierarchy of feed, replies,
  people, hubs, search, activity, and profiles.
- The web reference informs simple conversation, share, and message entry
  patterns.
- The Android reference informs media preview, post creation, and activity
  ergonomics.

Do not introduce any reference project's MongoDB, Firebase, Clerk, Cloudinary,
UploadThing, JWT, Socket.IO, Redux/Recoil, schemas, routing, server code,
environment files, or credentials. Niakofa remains on its canonical
PostgreSQL/Drizzle, authenticated media, WebSocket, LiveKit, and existing
session architecture.

## Applied in this checkout

- Community post sharing now carries the Hub and exact `postId`, so a shared
  link opens the relevant conversation card and briefly highlights it.
- Community notifications model Niakofa's existing Story, Hub, community, and
  message notification types, preserve durable read state, and expose
  keyboard-accessible deep links.

## Security note

One inspected archive contains a server `.env` path with
credential-shaped configuration. No values were copied into Niakofa. Any
historical credentials found in reference material must be rotated through the
provider rather than stored in source or documentation.