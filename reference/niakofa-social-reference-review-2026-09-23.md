# Niakofa social reference review

**Reviewed:** 2026-09-23  
**Purpose:** Preserve the evaluation of the four newly uploaded social-app
archives and the independent implementation boundaries used for Niakofa.

## Source material reviewed

All four archives were listed, extracted into temporary directories outside the
workspace, and read as source/reference material. They were not copied into the
Niakofa source tree or staged for commit.

| Archive | Approx. files reviewed | Best use in Niakofa |
| --- | ---: | --- |
| `linkedin-clone-master_1790166038361.zip` | 301 | Feed, notification, media, realtime, and observability patterns |
| `Social-Networking-Microservices-Platform-main_1790166032335.zip` | 128 | Event boundaries and notification delivery separation |
| `twitter-clone-laravel-main_1790166024892.zip` | 83 | Simple social-feed interaction model and focused UI behavior |
| `NetworkingPlatform-master_1790166041801.zip` | 145 | Feature/API primitive checklist and ownership audit prompts |

The uploaded evaluation memo is the product-level source of truth for the
ranking and confirms that Niakofa must remain a TypeScript/web monorepo.

## Decisions for Niakofa

### Keep Niakofa's architecture

Niakofa remains a single TypeScript/web platform with its existing
authentication, Express API, PostgreSQL/PostGIS data model, Hub membership,
Community moderation, realtime, Messages, Diaspora, Requests, Services,
Spirals, Payments, and Nia boundaries. The reference systems must not replace
those boundaries with Spring services, Laravel routes, Firebase/Supabase,
Kafka, Eureka, Neo4j, or a second auth provider.

### Borrow patterns, not source

- Keep Community's familiar social shell: feed, stories, people, messages,
  notifications, profile, and a smaller More surface.
- Treat post, reaction, comment, mention, share/repost, save, and story
  activity as distinct domain events with durable server ownership.
- Persist canonical state before realtime delivery and notification fan-out.
- Keep one Niakofa media pipeline: validate, store, generate metadata/variants,
  attach to the domain object, and serve only through the owning authorization
  boundary.
- Use batch reads, bounded pagination, uniqueness constraints, and
  authorization checks at the API boundary; do not reproduce the prototypes'
  N+1 reads, missing ownership checks, or generic error leakage.
- Prefer Postgres/PostGIS and the existing relationship model for People, Hubs,
  Family, Diaspora, Requests, Helpers, Circles, and Legacy. A conventional
  professional-network graph does not model these relationships well enough to
  justify a new graph database.

## Reference-specific findings

### LinkedIn clone

The strongest architectural reference. Its useful concepts are separate post
and reaction/comment/hashtag/mention/repost/save concerns, batch DTO
construction, connection-bounded feed reads, an outbox-shaped notification
fan-out, pluggable media storage, and traceable event delivery. Its
microservice/deployment stack is not a drop-in fit for Niakofa.

### Social microservices platform

Useful for the sequence `persist event → notification → realtime update`.
Niakofa should strengthen internal domain/event contracts without importing the
gateway, service discovery, Kafka, JWT, or per-service databases.

### Twitter/Laravel clone

Useful because the interaction model is intentionally small:
home → post → like/comment/save/profile. This supports keeping Community's
primary actions obvious instead of exposing every Niakofa subsystem in the
feed UI.

### Networking platform

Useful as a checklist for profile, skills, education, experience, companies,
jobs, applications, connections, chat, posts, comments, likes, and
administration. It is a prototype and should not supply Niakofa's
authentication, schema, authorization, or error-handling implementation.

## Security and licensing boundary

These archives are reference-only. Do not copy source, proprietary assets,
credentials, environment files, authentication/session code, database schemas,
media configuration, or backend infrastructure. Recreate any desired
behavior independently in Niakofa and re-check licenses before reusing an
asset or source fragment.