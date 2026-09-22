# Niakofa Unlicensed Reference / Independent Recreation Boundary

## Purpose
This memory entry establishes the permanent rule for third-party ZIPs and repositories that do not provide an explicit license granting reuse rights.

## Core distinction
REFERENCE ONLY means reference only.

If a supplied ZIP or public repository has no explicit license granting reuse, Niakofa must NOT copy, transplant, vendor, embed, or adapt its source code into the Niakofa application.

Public GitHub availability does not by itself grant permission to incorporate copyrighted source code.

Niakofa may study unlicensed reference material for product ideas, interaction patterns, information architecture, visual composition, UX behavior, feature concepts, accessibility ideas, responsive behavior, state-machine concepts, and performance ideas.

Niakofa must then recreate the desired behavior independently, using Niakofa's own source, naming, architecture, APIs, data models, styling system, and media pipeline.

## Current reference sources
- fb-clone-main
- sociobook-main
- WigsStar-main

Unless a source is separately verified to have an applicable license, treat these as unlicensed reference material.

## Independent recreation rule
1. Do not paste or port source files.
2. Do not copy source functions, hooks, components, CSS, database schemas, API routes, authentication code, or proprietary assets.
3. Do not preserve source-specific identifiers merely to disguise a port.
4. Do not import the source application's backend, auth, database, storage, realtime, or deployment configuration.
5. Write a new Niakofa implementation from product requirements and observed behavior.
6. Use Niakofa's existing architecture and contracts as the implementation authority.
7. Record provenance as independent Niakofa recreation inspired by reference behavior.
8. Verify licenses separately for every third-party asset, library, font, image, audio track, or other artifact.

## Niakofa architecture boundary
Preserve Niakofa authentication/authorization, OpenAPI contracts, PostgreSQL/Drizzle, Redis/BullMQ, MediaAsset lifecycle, object storage, FFmpeg/FFprobe, Conversation Engine, realtime authority, LiveKit RTC, and production release gates.

Do not import reference-specific Firebase, Supabase, Prisma/MongoDB, Clerk, UploadThing, source-specific realtime signaling, credentials, deployment configuration, signing keys, or keystores.

## Feature recreation targets
Reference material may inform independent Niakofa implementations for Community Stories, Story viewer/composer/gallery/effects/music picker, reactions/comments, notifications, relationship/request UX, chat/group-chat interaction patterns, and voice/video call UI/state presentation.

## RTC rule
Reference WebRTC signaling may be studied for UX/state behavior, but Niakofa production RTC remains LiveKit-based. Never replace the canonical LiveKit boundary with copied Supabase/WebRTC signaling.

## Music/media rule
A reference music picker does not grant Niakofa rights to redistribute or mix referenced music. Use licensed/authorized catalog assets and preserve the MediaAsset/FFmpeg production boundary.

## Verification rule
Before merging a recreation: run relevant lint/typecheck/tests; verify no reference imports or paths; scan for reference credentials, URLs, project IDs, signing keys and vendor configuration; verify Niakofa API/auth/media boundaries; document third-party dependencies and licenses; do not claim production certification from local/reference behavior.

## Release rule
Reference inspiration never changes Niakofa production gates. Deployment success is not media certification, RTC certification, or authenticated acceptance.

This document is the durable MemoryMD record for the distinction between reference-only unlicensed material and independently recreated Niakofa functionality.