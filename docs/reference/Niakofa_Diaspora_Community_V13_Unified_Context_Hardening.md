# Niakofa V13 Unified Context Hardening reference

This reference records the V13 integration package supplied for the canonical
`artifacts/` source tree. The package was reviewed before implementation; it is
not a second application and it does not require a database migration.

## Source package

- Archive: `attached_assets/Niakofa_Diaspora_Community_V13_Unified_Context_Hardening_1789688760943.zip`
- SHA-256: `efc2159e24ce8db1f5a08f3adf6718fb6a3f2a0ea64acaa749cdd7c5fbf07e4b`
- Reference assessment: `attached_assets/Pasted-Yes-After-re-checking-the-current-main-branch-and-curre_1789688749245.txt`
- Reviewed baseline: `f82d9957ff2a22205da243f5aa59071a8b31adf7`

The archive contains `README.md`, four design/audit documents, four targeted
patches, and `components/HubMessagesPanel.tsx`.

## V13 decisions applied

- `/messages` is the only visible messaging product with Direct, Requests, and
  Hubs modes.
- Hub conversation rows remain inside `/messages?mode=hub`; they no longer
  navigate to the legacy full-page composer.
- `/diaspora/messages` remains as a compatibility doorway to the canonical
  `MessagesPage` component.
- Hub composer state uses the existing Hub API and its server-side source-Hub
  membership checks. Target membership is not required.
- Globe links preserve the selected source Hub context.
- Community links remain compact and direct users to Direct mode.
- `/community?hubId=` now displays explicit selected-Hub context. It does not
  claim that the existing local feed is filtered by that Hub.
- Location/presence remains separate from membership, representation, and
  leadership.

## Intentionally unchanged

- Existing direct-message approval, block, report, read-state, websocket, and
  reconnect behavior.
- Existing request chat authorization and navigation.
- Existing Hub membership governance and send-time authorization.
- Globe-first Diaspora landing behavior and data-backed geography model.
- Legacy `/diaspora/messages` source file remains in the tree for compatibility
  and historical reference, but is no longer the route target.

## Verification requirements

Run the configured frontend tests, V13/V12 contract suites, frontend and API
typechecks, targeted lint, and the production web build. Validate the assigned
managed preview port rather than assuming port 5000.