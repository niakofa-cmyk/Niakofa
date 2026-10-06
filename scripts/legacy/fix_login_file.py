import json, re, os

# Read the big file content (it's a JSON wrapper around the actual file content)
file_path = "/workspace/niakofa/artifacts/pay-it-forward/src/pages/login.tsx"
with open(file_path, 'r') as f:
    content = f.read()

# The file is wrapped in a JSON object with "content" field. Let's check.
if content.startswith('{'):
    data = json.loads(content)
    actual_content = data.get('content', content)
else:
    actual_content = content

# Now let's write the actual content back as a proper TSX file
with open(file_path, 'w') as f:
    f.write(actual_content)

print(f"File size: {len(actual_content)} chars")
print("First 200 chars:", actual_content[:200])
print("Last 200 chars:", actual_content[-200:])
