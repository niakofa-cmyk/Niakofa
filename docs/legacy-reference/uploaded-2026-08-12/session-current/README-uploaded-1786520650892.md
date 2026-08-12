# Exact current upload snapshot

This directory preserves the six files supplied for the August 12, 2026
Niakofa Legacy production-readiness pass. The ZIP archives remain reference
material; their contents are not copied wholesale into the browser bundle.

## Integrity manifest

The SHA-256 values below make it possible to confirm that this snapshot still
matches the uploaded inputs:

```text
14a803f7d60e5810ce8a4689f9aecedfde562e192b89d5914a987433080010cf  APPLY_1786509321695.md
0c5da755f9204c0475b559a5790d7aed711ce02d11f2143093710c0bfa03962b  legacy-character-engine_1786509321696.patch
ed20b0024e6b75522a5658ab2da39aa7bd87a32e0f3b2298878317529121923c  niakofa-engine-patch_1786509321694.zip
3ba0641923317f26c5aade009730902297e518ddd160f9d50b11f860c8c3ec5b  niakofa-engine-patch_2_1786509321692.zip
1025628a0a7ece2e4274c84e434d82d31aa3f6b287b36b77801df9b551a1d6e9  Pasted--For-the-House-of-Mensah-demo-specifically-We-need-far-_1786509306937.txt
11b9ed0cfcab194ed69403fb7cfa033ac1fc35e42ff55e5acb91ab10aa124d89  Pasted-I-wouldn-t-simply-dump-rpg-core-js-rpg-objects-js-rpg-s_1786509289680.txt
```

The current implementation keeps the Niakofa runtime authoritative, uses
explicit character appearance data, and promotes only the curated original-art
layers under `artifacts/pay-it-forward/public/legacy-world-assets/`.