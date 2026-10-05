---
name: Spark mobile preview verification
description: Mobile canvas sizing and overlay visibility checks for the Spark editor.
---

When changing Spark Studio's editor layout, do not treat a visible overlay node as proof of a usable canvas. A custom root class can replace the editor's default portrait ratio, and shared flex alignment can persist after a parent switches to grid. Preserve the 9:16 canvas and verify the rendered surface and overlay text bounds on mobile.

**Why:** During a composer redesign, caption text existed and passed a DOM visibility assertion while its canvas measured only 2×2 pixels; after restoring canvas sizing, lower-third text could still overlap helper copy or clip on phone viewports.

**How to apply:** For source-to-edit flows, run an authenticated local phone-size browser pass, assert portrait dimensions and full caption containment, and inspect the actual rendered preview.
