# Synthetic media fixtures

`exchange-upload.synthetic.png` is a small synthetic graphic moved out of the
tracked API runtime incoming-upload directory. It contains no real user media.
It is reference/test input only, not an uploaded or published production asset.

Browser/runtime suites generate their own media under disposable temporary
directories. Never place their output in this directory. API runtime uploads
remain excluded by both `.gitignore` and `.replitignore`.
