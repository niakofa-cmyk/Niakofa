# Moments and Sparks reference package

These are unchanged copies of the materials supplied for the Niakofa
Community vocabulary and Moments migration. The original uploads remain in
`attached_assets/` as well.

| File | Purpose |
| --- | --- |
| `product-decision.txt` | Defines Moments as the short-form destination and Sparks as its individual posts. |
| `implementation-package.zip` | Reference implementation notes, proposed components, and contract test. |
| `enhancement-package.docx` | Broader Community, Moments, Sparks, and Spirals enhancement requirements. |

The ZIP is retained as a reference, not copied into the application source.
The app keeps its existing community-story API, media pipeline, identifiers,
and authorization behavior behind the user-facing Moments/Sparks vocabulary.

## Independent implementation record

Niakofa now supports creator-uploaded background audio on Community and Hub
video Moments. A creator must attest that they made the recording or have the
rights to reproduce and distribute it; licensed tracks also require an HTTPS
license/source link. The server stores that declaration, binds the soundtrack
to an owned media-asset ID, and never accepts a client storage key or
`licensed: true` flag as authorization. This is an attestation, not independent
license verification or a licensed music catalog.

The audio-mix worker writes a separate video variant so a ready video remains
playable while mixing runs or if mixing fails. The soundtrack remains attached
to the Moment for cleanup, is not exposed as a visible Moment frame, and cannot
be deleted by itself after publication; deleting the Moment removes the linked
media together. Exchange listing Sparks remain unsupported for music.

These are local implementation changes only. They do not certify production
storage, worker tooling, device playback, or rights clearance, and they did not
change the production media flag or operational configuration.

SHA-256 checksums:

- `product-decision.txt`: `37f2abee91165d32a24d52ed1e6b1208521577f4bb023aa6adac5dc48dea3f41`
- `implementation-package.zip`: `4e2a1af38d171bb91ce47a9f5116f1dd5510e8b26da068e3b05f64f503e553af`
- `enhancement-package.docx`: `154f9a2a125cbb85585bcae51d7c33d1a5467b1bf08ec924dbb441fad75ab672`