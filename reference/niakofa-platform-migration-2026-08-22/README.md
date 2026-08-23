# Niakofa platform migration reference

This directory preserves the migration boundary used for the August 22, 2026
platform cleanup. The standalone RPG source archive was supplied as a
verification and recovery reference, not as part of the core Niakofa runtime.

## Platform boundary

Niakofa owns:

- Community mutual aid, live map, help requests, and Helper Mode
- Nia / Niakofa Helper
- Family Vault, Family Tree, memories, and oral history
- Voice, video, circles, wallet, and the core platform

The Legacy RPG owns its own repository and runtime. It must not be imported by
the platform.

## Migration checklist

- [x] Remove active Legacy routes and navigation.
- [x] Remove the platform legacy runtime and game-only source trees.
- [x] Remove Pixi and game-only frontend test commands.
- [x] Remove RPG public assets from the platform bundle.
- [x] Preserve Family Vault and Family Tree source files.
- [x] Preserve core mutual-aid navigation and app context.
- [ ] Verify every production integration with its configured service secrets
      before release (database, Mapbox, payments, notifications, voice/video,
      and Nia).

## Supplied source reference

The accompanying archive README is retained as `archive-readme.md`. It
documents the original platform structure, setup commands, environment
variables, product screens, and architecture decisions. The archive itself is
not copied into the application bundle.

## Verification commands

From the repository root:

```bash
pnpm --filter @workspace/pay-it-forward run typecheck
pnpm --filter @workspace/pay-it-forward run build
pnpm --filter @workspace/pay-it-forward run test
pnpm run verify:platform
```

The core family and mutual-aid features remain platform-owned; any future RPG
work should happen in the separate `niakofa-legacy-rpg` repository.