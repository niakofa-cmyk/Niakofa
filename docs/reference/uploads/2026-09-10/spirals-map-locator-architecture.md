# Spirals Map Locator architecture

```text
Map Locator → AppContext.myLocation → Spiral location adapter
                         │
                         ├─ discovery → location-context
                         └─ host start / Host Signal → location-check / start
                                                        │
                                                        └─ server geometry
```

The client must not run a separate Spiral GPS request when the Map Locator
stream has a usable fix. Discovery may accept a recent, less precise fix for
neighborhood ordering; hosting must use a fresher, more accurate fix. The API
must continue to fail closed for unverified geometry and to allow joining
without location.