# GPS Pinpoint replacement

Spirals must reuse the working Map Locator position already held by
`AppContext.myLocation`. The browser supplies the shared GPS fix; the server
matches the point against verified neighborhood geometry.

## Required behavior

- Discovery uses a recent GPS Map Locator fix, with a tolerant freshness and
  accuracy policy.
- Host Signal and host start use that same fix with a stricter policy.
- Joining a Spiral never requires location.
- If no Map Locator fix exists, direct the user to the Map tab instead of
  launching a second Pinpoint flow.
- If a fix exists but no verified neighborhood Spiral is active, explain that
  an admin must Promote → Host Signal for the neighborhood.

The server remains authoritative for city and neighborhood matching. Raw
coordinates are not exposed in the UI.