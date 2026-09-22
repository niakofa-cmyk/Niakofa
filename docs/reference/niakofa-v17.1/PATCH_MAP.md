# V17.1 Patch Map

| Current main file | V17.1 change |
|---|---|
| `artifacts/api-server/src/routes/index.ts` | Register `communityHubFeedRouter` |
| `artifacts/api-server/src/routes/community-hub-feed.ts` | New authenticated canonical Hub feed read model |
| `artifacts/pay-it-forward/src/pages/messages.tsx` | Replace only Direct-mode JSX with `MetaStyleDirectPane` |
| `artifacts/pay-it-forward/src/components/messages/MetaStyleDirectPane.tsx` | New Meta-style Direct UI |
| `artifacts/pay-it-forward/src/pages/community.tsx` | Mount Hub feed panel when `hubId` is present |
| `artifacts/pay-it-forward/src/components/community/HubCommunityFeedPanel.tsx` | New Hub-scoped Community surface |
| `artifacts/pay-it-forward/src/lib/hubCommunityFeed.ts` | Typed feed client |
| `artifacts/pay-it-forward/src/lib/spirals.ts` | Merge Hub-aware route helpers |
| `artifacts/pay-it-forward/src/components/diaspora/DiasporaGlobeFirst.tsx` | Use shared Spiral path helper |

The package intentionally does not include a replacement `messages.tsx`, `community.tsx`, or `DiasporaGlobeFirst.tsx`; those files are large production surfaces and should be modified through the guarded apply script.
