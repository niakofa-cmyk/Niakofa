# Niakofa Legacy upload manifest — August 10, 2026

This manifest preserves the exact files supplied to the build session and the
integrity checks used before implementation.

## Uploaded source files

| Uploaded file | SHA-256 | Reference copy |
| --- | --- | --- |
| `attached_assets/Pasted-Continue-to-build-the-Niakofa-Character-Asset-Engine-et_1786393578065.txt` | `e2b207ca7b5d37a6b0d8649a5e4a7715fcd06922cfcd75a058eb13a65c1117d9` | `uploaded-source/Pasted-Continue-to-build-the-Niakofa-Character-Asset-Engine-et_1786393578065.txt` |
| `attached_assets/Pasted--The-app-still-needs-more-of-the-cinematic-game-world-v_1786393566995.txt` | `e4f3b94f075af1233ab5d5a259adb3fe4efd0e651e5ae04324d33743b6afd28f` | `uploaded-source/Pasted--The-app-still-needs-more-of-the-cinematic-game-world-v_1786393566995.txt` |
| `attached_assets/generator_1786393620810.zip` | `b98843ce0ca4687b44ef4679b7137b11a9e14af88c6e901666194f442da2d64f` | `uploaded-source/generator_1786393620810.zip` (byte-identical archive) |
| `attached_assets/Pasted-6-hours-ago-Planning-GitHub-tasks-Planning-GitHub-tasks_1786371294342.txt` | `383e54137cc4bc06ff94b4914b72af6794fab3f039f3d2addca6c3eb239e13a0` | `uploaded-source/Pasted-6-hours-ago-Planning-GitHub-tasks-Planning-GitHub-tasks_1786371294342.txt` |
| `attached_assets/Pasted-One-thing-I-would-NOT-do-Don-t-simply-dump-this-ZIP-int_1786371339631.txt` | `f0f522aef06b926794987c439e407d4d5f3499ef8633bcf08dd3fe2bccbac4a3` | `uploaded-source/Pasted-One-thing-I-would-NOT-do-Don-t-simply-dump-this-ZIP-int_1786371339631.txt` |
| `attached_assets/Pasted-Continue-to-build-the-Niakofa-Character-Engine-use-the-_1786371320198.txt` | `bd4b3e092b5969e3a5c7bca2dd233d4b522013bd407cf4e348d1c30aeeba2d97` | `uploaded-source/Pasted-Continue-to-build-the-Niakofa-Character-Engine-use-the-_1786371320198.txt` |
| `attached_assets/generator_1786371386883.zip` | `b98843ce0ca4687b44ef4679b7137b11a9e14af88c6e901666194f442da2d64f` | `uploaded-source/generator_1786371386883.zip` |
| `attached_assets/Pasted-I-m-reviewing-the-current-checkpoint-and-repository-sta_1786372861277.txt` | `37c95846d7d1f6868ccc9af69b301103d8114cfb2f9b45b7aaa2145787f9338d` | `uploaded-source/Pasted-I-m-reviewing-the-current-checkpoint-and-repository-sta_1786372861277.txt` |
| `attached_assets/Pasted-One-thing-I-would-NOT-do-Don-t-simply-dump-this-ZIP-int_1786372879688.txt` | `f0f522aef06b926794987c439e407d4d5f3499ef8633bcf08dd3fe2bccbac4a3` | existing byte-identical guidance copy in `uploaded-source/` |
| `attached_assets/generator_1786372886715.zip` | `b98843ce0ca4687b44ef4679b7137b11a9e14af88c6e901666194f442da2d64f` | existing byte-identical archive in `uploaded-source/` |
| `attached_assets/Pasted--The-app-still-needs-more-of-the-cinematic-game-world-v_1786391398105.txt` | `e4f3b94f075af1233ab5d5a259adb3fe4efd0e651e5ae04324d33743b6afd28f` | existing byte-identical brief copy in `uploaded-source/` |
| `attached_assets/generator_1786391409924.zip` | `b98843ce0ca4687b44ef4679b7137b11a9e14af88c6e901666194f442da2d64f` | existing byte-identical archive in `uploaded-source/` |

The new ZIP and guidance upload are byte-for-byte identical to the previously
preserved source copies. The new filenames are retained in this manifest for
provenance, while the earlier copies remain the canonical reference files; the
application imports neither archive wholesale. `unzip -t` passes and the
inventory is:

- 4,226 PNG assets
- Face 1,138; TV 946; TVD 726; SV 744; Variation 668; gradients 4
- 4,247 macOS metadata entries are excluded from the browser runtime

The archive remains a source library. Only the explicitly curated TV sample
is delivered to the browser, and its catalog remains `review-required` until
the upstream asset license is confirmed.