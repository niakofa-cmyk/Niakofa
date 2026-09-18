# V17.1 Architecture

```text
DIASPORA GLOBE
    │
    └─ Select canonical Hub
         │
         ├─ Community
         │    └─ /api/community/hubs/:hubId/feed
         │         ├─ Hub identity
         │         ├─ membership count
         │         ├─ gratitude count + latest posts
         │         └─ open-request count + latest requests
         │
         ├─ Messages
         │    └─ /messages?mode=hub&sourceHub=...
         │
         └─ Spirals
              └─ /audio-spirals?hubId=...
                    │
                    └─ curated city/neighborhood discovery

MESSAGES
    │
    ├─ All
    ├─ Direct → Meta-style inbox | thread
    ├─ Requests
    └─ Hubs
```

## Invariants

`Location ≠ Membership ≠ Representation ≠ Leadership`

`/messages` remains the single messaging product.

Hub feed access does not create membership.

Hub-to-Hub messaging authorization remains governed by the existing source-Hub representation rules.

Spiral Hub context does not become a GPS gate.
