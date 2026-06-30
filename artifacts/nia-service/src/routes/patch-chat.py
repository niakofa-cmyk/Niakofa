import pathlib, re

p = pathlib.Path("artifacts/nia-service/src/routes/chat.ts")
if not p.exists():
    print("SKIP: chat.ts not found at expected path — check your nia-service routes folder and apply manually.")
    exit()

src = p.read_text()

# Add middleware import
if "injectLocation" not in src:
    src = 'import { injectLocation, buildLocationPrefix, LocationContext } from "../middleware/location";\n' + src
    print("+ Added location import")

# Add middleware to router
src = src.replace(
    'router.post("/chat"',
    'router.post("/chat", injectLocation,'
)
print("+ Wired injectLocation middleware")

# Inject location prefix into system prompt construction
old = 'const systemPrompt = NIA_SYSTEM_PROMPT;'
new = '''const locationCtx = (req as any).locationContext as LocationContext | undefined;
  const locationPrefix = buildLocationPrefix(locationCtx);
  const systemPrompt = locationPrefix + NIA_SYSTEM_PROMPT;'''

if old in src:
    src = src.replace(old, new)
    print("+ Location prefix injected into system prompt")
elif "NIA_SYSTEM_PROMPT" in src:
    # Fallback: wrap however the prompt is used
    src = src.replace(
        "NIA_SYSTEM_PROMPT",
        "(buildLocationPrefix((req as any).locationContext) + NIA_SYSTEM_PROMPT)"
    )
    print("+ Location prefix injected (fallback mode)")

p.write_text(src)
print("OK: chat.ts patched with location awareness")
