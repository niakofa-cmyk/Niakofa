# Niakofa reference materials

This file records the external reference package used while hardening Niakofa's
realtime, messaging, and Nia boundaries. The uploaded originals remain in
`attached_assets/` in the workspace for local reference. They are intentionally
not copied into the product source tree or merged wholesale.

## Source package

| Material | Workspace filename | SHA-256 |
| --- | --- | --- |
| Messenger desktop reference | `Messenger-for-Desktop-master_1789875264751.zip` | `e72644e2b6cfdf3e6eab5659aca9522f4cf1712c8f6b4f20a3053a217d50c8` |
| Nia/chat-quality reference | `chat-quality-agent-main_1789875271613.zip` | `3bbeeadec3554472bf54c5a3b9555087327c8fe4debfed4f271ca0d5ea78a7f2` |
| Architectural assessment | `Pasted-Yes-Both-ZIPs-are-potentially-useful-to-Niakofa-but-in-_1789875255006.txt` | `46910145e2e0f8a0ea7882dfcaa25a2a943d0498abbfad178eef2e30a7cdfad8` |

Both archives were reviewed as references. Their top-level MIT notices do not
automatically cover bundled dependencies or assets, so any future source reuse
must preserve applicable notices and pass a dependency/license review.

## Adaptation boundary

### Messenger-for-Desktop

Use selectively for:

- notification policy separated from platform notification delivery;
- desktop/background lifecycle and tray concepts;
- keyboard shortcut and preference organization;
- client-side realtime diagnostics.

Do not import its Electron application architecture or old Messenger-specific
conversation model into Niakofa.

### chat-quality-agent

Use selectively for the Nia service's future:

- provider abstraction;
- usage and cost accounting;
- durable jobs and scheduling;
- quality/evaluation workflows;
- activity and audit records.

Keep Niakofa's user-facing Messages model and canonical realtime event log as
the product authority. Nia remains a separate authenticated service boundary,
not a replacement for the app's conversation or event storage.

## Current application decision

The immediate implementation priority from these references is state
convergence: persist canonical realtime events before delivery, use durable
event identities and idempotency keys, serialize replay against live delivery,
reject invalid replay cursors, and publish read transitions after authoritative
database updates. UI state, unread summaries, and local cursors remain
projections or recovery caches rather than competing authorities.