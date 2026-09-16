# Production Hub Geography Audit

## Release evidence

- **Production database:** Railway Postgres
- **Railway environment:** `production`
- **Database service:** `PostGIS (Postgres)`
- **Database:** `railway`
- **Verified table:** `public.diaspora_hubs`
- **Connection:** SSL/TLS 1.3
- **Executed:** 2026-09-16; exact operator timestamp was not included in the supplied terminal transcript
- **Audit source:** `sql/diaspora-globe-geography-audit.sql`
- **Evidence source:** operator-provided Railway terminal transcript attached during the production audit

The operator first confirmed that the selected Railway service was `PostGIS (Postgres)` and that:

```text
to_regclass('public.diaspora_hubs') = diaspora_hubs
```

## Result sets

All five read-only checks returned zero rows.

### Query 1 — Invalid canonical geography

```text
 id | name | status | hub_scope | country_code | subdivision_code | primary_hub_id
----+------+--------+-----------+--------------+------------------+----------------
(0 rows)
```

No approved canonical root violates the country/state contract:

- Non-US roots use `hub_scope = country`, a country code, and no subdivision.
- U.S. roots use `hub_scope = us_state`, `country_code = US`, and a subdivision.

### Query 2 — Duplicate canonical countries

```text
 country_code | hub_scope | canonical_count
--------------+-----------+-----------------
(0 rows)
```

No non-US country has more than one approved canonical root.

### Query 3 — Duplicate canonical U.S. states

```text
 subdivision_code | canonical_count
------------------+-----------------
(0 rows)
```

No U.S. state has more than one approved canonical root.

### Query 4 — Self-parenting Hub rows

```text
 id | name | primary_hub_id
----+------+----------------
(0 rows)
```

No Hub has `primary_hub_id = id`.

### Query 5 — Home-shaped canonical roots

```text
 id | name | display_name | hub_scope | country_code | subdivision_code | tag
----+------+--------------+-----------+--------------+------------------+-----
(0 rows)
```

No canonical Globe root is named or tagged `Home` or `Home Hub`.

## Determination

**Task #6 — Production row-level Hub geography audit: PASS**

The supplied Railway production result sets satisfy all row-level geography invariants in `sql/diaspora-globe-geography-audit.sql`. No remediation SQL or production data repair is required.