---
name: Moment audio mix duration
description: FFmpeg duration rules for adding looped background music to video Moments.
---

When background music is looped for a video mix, use a longest-duration audio mix and let the video stream bound the final output. Using the original audio stream as the mix duration can truncate a video when that stream ends early and `-shortest` is enabled.

**Why:** A source video can contain an audio stream shorter than its video stream. Ending the mix with that audio can make the mixed variant shorter than the original video.

**How to apply:** For looped music, mix through the longer input and use the video duration as the output limit; preserve the original video as the fallback if the mix fails.