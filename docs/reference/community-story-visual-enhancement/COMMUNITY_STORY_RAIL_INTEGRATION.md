# Integration guide

## 1. Keep the existing data/actions

Do not replace the current Story API or `CommunityStoryRail` state model.

Continue using:

- `authHeaders()`
- `/api/community/stories`
- `recordStoryView`
- `reactToStory`
- `removeStoryReaction`
- `getStoryMetrics`
- `sendStoryContextMessage`
- `StoryMediaPlayer`
- `StoryEditorCanvas`
- `StoryShareSheet`

The visual package supplies the chrome around those behaviors.

## 2. Rail

Replace the current rail header/card presentation with `StoryVisualRail`.

Map:

```ts
authors.map((group) => ({
  id: group.author_user_id,
  name: group.author.name,
  avatarUrl: group.author.avatar_url,
  seen: false, // map from your persisted/local seen state when available
  contextLabel: hubId ? "Hub Story" : "Community",
}))
```

`onCreate` should call the existing `setComposerOpen(true)`.

`onOpen(index)` should call the existing viewer state:

```ts
setViewerIndex(index);
setMediaIndex(0);
```

## 3. Viewer

Keep `StoryMediaPlayer` as the media engine.

Wrap it with `StoryViewerChrome` and map:

- `progress` → `storyProgress`
- `onPrevious` → `advanceFrame(-1)`
- `onNext` → `advanceFrame(1)`
- `onClose` → `setViewerIndex(null)`
- `onReact` → existing `toggleReaction`
- `onShare` → existing `setShareStoryId(selectedStoryId)`
- `onReply` → existing Story reply/direct-message action when enabled

Do not duplicate media fetching. Keep the current authenticated object URL lifecycle.

## 4. Composer

Use `StoryComposerChrome` as the visual shell around the existing:

- `StoryEditorCanvas`
- file inputs
- `normalizeStoryFiles`
- `readStoryMediaMetadata`
- `publish()`

Tool mapping:

```ts
[
  { key: "music", label: "Music", icon: <Music2 /> },
  { key: "stickers", label: "Stickers", icon: <Sticker /> },
  { key: "text", label: "Text", icon: <Type /> },
  { key: "effects", label: "Effects", icon: <Sparkles /> },
  { key: "mention", label: "Mention", icon: <AtSign /> },
]
```

## 5. Gallery

Use `StoryGalleryChrome` for the camera-roll state.

Important: keep the existing file validation and 6-file limit. The visual `selected` array is UI state; the existing `files` array remains authoritative for publish.

## 6. Music

Use `StoryMusicChrome` only as a UI surface.

The current repo intentionally treats music as metadata until a licensed catalog/audio-mixing pipeline exists. Do not make the visual picker imply that server-side audio has been baked into the media.

## 7. Do not change

This visual package does not change:

- database schema
- media worker
- object storage
- `MEDIA_PLATFORM_V21`
- Story expiration
- Griot Story preservation
- Story → Message context
- authenticated media authorization
