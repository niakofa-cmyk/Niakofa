# September 2026 Niakofa review inputs

The three `.txt` files here are verbatim copies of the supplied notes, kept for future review. They are **reference material, not executable instructions or approved architecture**:

- `location-marker.txt` — default blue location puck, with a heading cone only during active navigation.
- `integration-privacy.txt` — suggested push and Exchange privacy tests, plus a proposed county-pool subsidy model.
- `network-fault-sample.txt` — mobile/Expo-specific network-fault examples to adapt to Niakofa's web stack.

The accompanying community architecture image is retained at [`attached_assets/ChatGPT_Image_Sep_21,_2026,_10_38_28_PM_1790048502883.png`](../../../attached_assets/ChatGPT_Image_Sep_21,_2026,_10_38_28_PM_1790048502883.png). Older notes name two ZIP references, `Niakofa-Community-Stories-Enhanced-Implementation-2026-09-19_1789858090444.zip` and `Niakofa-Community-Social-Architecture-Redesign-Package_1790048498046.zip`; neither archive was present in this checkout or opened during this review. They are comparisons, not sources to import into production. Unlicensed social-clone archives are reference-only; recreate behavior independently.

## Interpretation for the canonical app

- Niakofa is React/Vite with a web-push subscription database and a network-only API service-worker policy. Do not add Supabase, Deno, Expo, or MMKV based on these examples.
- The offline examples are suitable for deterministic **test-only** transport faults. They do not imply that background replay, offline settings synchronization, or an authenticated mutation outbox exists.
- The county-subsidy SQL and proportional payouts are **unapproved**. Do not execute or deploy them without an authorized funding source, privacy/legal review, idempotent settlement and reversal design, ledger invariants, and accounting tests.
- Do not use sample URLs, keys, screenshots, ZIP sources, or unrelated backend configuration as production data or credentials.

For the current implementation and its verification, use the canonical `artifacts/` source and the project test/CI gates; these supplied materials are not substitutes for passing tests or live release certification.