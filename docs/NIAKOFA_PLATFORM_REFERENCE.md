# Niakofa Platform Reference

This checkout is the production platform for mutual aid, family history, Diaspora
connections, Circles, Community Pool payments, and Nia. It is not the playable
Legacy RPG runtime.

## Product boundary

The platform owns:

- authenticated mutual-aid requests, helpers, Mapbox activity, and trust/safety;
- Community Pool, Stripe settlement, wallet, and payout infrastructure;
- Circles audio/video sessions, LiveKit tokens, recordings, and summaries;
- Family Vault memories, interviews, family tree, Diaspora research, and the
  family-history timeline;
- Nia's platform chat and family-memory assistance.

The standalone RPG repository owns its playable game runtime, PixiJS scenes,
movement, collision, combat, NPCs, quests, maps, game sessions, and RPG-specific
world evolution:

<https://github.com/niakofa-cmyk/niakofa-legacy-rpg>

No RPG launch bridge, playable scene, RPG Nia endpoint, game-world service, or RPG
design board is served by this platform artifact.

## Reference material

The four RPG boards supplied on September 2, 2026 were classified as standalone
RPG references and removed from this platform checkout:

1. living-world map and gameplay;
2. legacy onboarding;
3. family progression and chapters;
4. live story gameplay and family legacy dashboard.

The original uploaded text reports and historical migration SQL remain available
as provenance/compatibility records where they document platform history. They are
not active product routes or client assets. Family-history features must continue
to use the platform's Family Vault and Diaspora APIs rather than RPG session,
quest, or world-state APIs.