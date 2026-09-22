# Niakofa Community — Social Architecture Redesign Package

## Purpose
A Facebook-class social architecture for Niakofa Community, redesigned around Niakofa's existing
identity, Hubs, Requests, Services, Diaspora, Circles, Messages, and real-time infrastructure.

## Core navigation
Home · People · Hubs · Stories · Circles · Requests · Services · Media · Notifications · Messages · Profile

## Architecture layers
1. Social Layer — posts, comments, reactions, stories, media, shares, connections, follows, saved items.
2. Community Layer — Hubs, hub feeds, stories, events, people, media, membership.
3. Niakofa Service Layer — Requests, Helpers, Routing, Skills, Services, Civic Resources, Community Pool, Gratitude, Spirals.
4. Identity Layer — Profiles, Users, Hub Membership, Circles, Diaspora.
5. Real-Time Infrastructure — WebSockets, presence, push notifications, live location, RTC.

## Critical design rule
Do NOT merge Firebase/NextAuth/Flask backend architecture from the reference ZIPs into Niakofa.
Use the strongest ZIP primarily as a UI/interaction reference. Preserve Niakofa's existing backend
contracts and infrastructure (Postgres/PostGIS, Redis, durable media, existing Community Hub APIs,
and the unified Messages product).

## Request → Help → Community loop
Discover Request → Message → Route → Help → Complete → Gratitude → Story → Community

## Suggested frontend organization
components/community-shell/
  CommunityShell
  CommunityHeader
  CommunitySidebar
  CommunityMobileNav
  CommunityComposer
  CommunityFeed
  CommunityStories
  CommunityPost
  CommunityComments
  CommunityPeople
  CommunityHubs
  CommunityRequests
  CommunityServices
  CommunityMedia
  CommunityNotifications
  CommunityMessages
  CommunityProfile

## Suggested routes
/community
/community/people
/community/hubs
/community/stories
/community/circles
/community/requests
/community/services
/community/media
/community/notifications
/messages
/profile/:id

These may be implemented as route views/tabs if Niakofa's existing router favors a single shell.

## Package contents
- docs/niakofa-community-social-architecture-redesign.png
- docs/architecture.md
- components/community-shell/README.md
- services/community-api-contracts.md
- styles/community-theme.css
