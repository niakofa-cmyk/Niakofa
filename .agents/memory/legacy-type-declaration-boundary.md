---
name: Legacy type declaration boundary
description: How Window extension types are organized for the pay-it-forward artifact, and the correct speech/openNia declaration file.
---

All Window extension types for `artifacts/pay-it-forward` live in a **single file**:
`artifacts/pay-it-forward/src/speech-recognition.d.ts`

This file declares:
- Full `SpeechRecognition` interface tree (not in TS DOM lib)
- `Window.SpeechRecognition`, `Window.webkitSpeechRecognition`
- `Window.webkitAudioContext`
- `Window.openNia?: (seedQuestion?: string) => void`  ← includes the seed question arg

**Why:** The split `src/types/speech.d.ts` + `src/types/window.d.ts` caused duplicate `interface Window` augmentations with conflicting `openNia` signatures (`() => void` vs `(seedQuestion?: string) => void`). Consolidated into one file at the src root to avoid merge conflicts.

**How to apply:** If you ever need to add another `Window` extension, add it to `speech-recognition.d.ts`, not to a new file in `types/`.
