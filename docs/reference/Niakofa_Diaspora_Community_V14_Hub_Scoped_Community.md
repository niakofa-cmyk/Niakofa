# Niakofa V14 Hub-Scoped Community reference

This reference records the V14 integration package supplied for the canonical
`artifacts/` source tree. The package was reviewed in full before
implementation. It is an implementation reference, not a second application.

## Source package

- Archive:
  `attached_assets/Niakofa_Diaspora_Community_V14_Hub_Scoped_Community_and_Unifie_1789691283001.zip`
- Archive SHA-256:
  `34193cdc61adb83590e8e44a0e924e4cf5679d999c2ef846ce1e359cec1a66f7`
- Assessment:
  `attached_assets/Pasted-Yes-A-selected-Diaspora-Hub-should-show-its-own-Communi_1789691275043.txt`
- Assessment SHA-256:
  `9ba7b4ff24a3a2cd888e2039b585e5df78316061edced94f2ddaf8e07d4f8a0c`
- Reviewed baseline:
  `00f2c9b442f3dedf4a58309eaa269f380414f510`

The archive contains the V14 README, audit, architecture, acceptance checklist,
five patches, and one contract test. All archive files were read before the
canonical tree was changed.

## V14 decisions applied

- A selected canonical country or U.S. state Hub opens a genuinely scoped
  Community gratitude feed through `/api/gratitude?hub_id=<id>`.
- The API validates that the requested Hub is an approved canonical root:
  `status = approved` and `primary_hub_id IS NULL`.
- Scoped posts must be approved, authored by a non-suspended approved account,
  and assigned to that Hub through durable `users.diaspora_hub_id`.
- Unscoped `/community` keeps the ordinary approved Community feed.
- Scoped realtime gratitude events carry the durable Hub assignment and are
  ignored by a Community page showing a different Hub.
- `/messages` remains the one messaging product with All, Direct, Requests, and
  Hubs modes.
- Primary navigation points to `/messages`; `/diaspora/messages` remains a
  compatibility doorway to the same `MessagesPage` in Hub mode.
- Community's “Message people” entry remains the direct person-to-person path.
- The Hub selector no longer presents “Home Hub” as a separate visible identity.
- Source-Hub membership is still required when opening and sending Hub messages.
  Target-Hub membership is not required.
- GPS and physical presence never grant Hub membership.

## Intentionally unchanged

- Existing direct-message approval, block, report, read-state, WebSocket, and
  reconnect behavior.
- Existing Hub membership governance, automatic ordinary membership, and
  send-time source authorization.
- Globe-first Diaspora geography and canonical country/state root behavior.
- Community Pool, ledger, county, impact, resource, Skills, Spirals, and Griot
  capabilities.
- The legacy `diaspora-hub-messages.tsx` source remains available for historical
  compatibility, but it is not the visible route target.

## Verification contract

The repository contract runner includes
`tests/diaspora-community-v14.contract.test.mjs`, covering the API scope,
client request, realtime scope guard, navigation, unified route, visible Hub
identity, and Hub authorization boundaries. Release verification must also run
typechecks, backend tests, Diaspora contracts, frontend build, lint, and the
production deployment gate.