# Niakofa uploaded production reports — 2026-09-06

These references preserve the two reports supplied during the Niakofa recovery
and Host Signal continuation work:

- `Pasted-Fix-the-Broken-Repo-and-Railway-My-railway-is-conneced-_1788680552251.txt`
  — repository recovery, Mapbox place-only reverse geocoding, production
  validation, and the GitHub/Railway sync boundary.
- `Pasted-Push-Landed-but-Host-signal-is-still-Blocked-The-Host-e_1788680573637.txt`
  — the requested automatic Host Signal behavior and its GPS/Spiral
  neighborhood UX requirements.

## Requirements retained from the reports

- Review and verify the actual Niakofa application before editing.
- Keep Spirals as the public product language while retaining Circle-era API
  and storage identifiers for compatibility.
- Use the shared, verified user GPS stream as the location source for the
  local Spiral; do not use another person's raw coordinates as a host
  authorization substitute.
- Resolve the city on the server, promote the matching local Spiral, and show
  one compact green verification check at the top-right of that card.
- Refresh the Host Signal automatically when the GPS signal is stale,
  unavailable, or cannot be verified; keep the final host decision
  server-authoritative and fail closed.
- Keep joining available without GPS.
- Preserve the corrected Mapbox behavior: a ranked address is never treated as
  a city, and neighborhood output is an informational hint rather than a
  geofence until reviewed boundary data exists.
- Before publication, compare local `main` with the authenticated GitHub
  remote and independently verify the resulting remote commit.

The original uploaded files were read in full before this reference was
created. No tokens or credentials from those reports are retained here.