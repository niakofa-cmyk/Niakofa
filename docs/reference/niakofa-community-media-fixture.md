# Niakofa Community Media fixture

This reference preserves the generated image used for the authenticated
Community Media acceptance check. It is intentionally synthetic and contains
no user photo, personal information, credential, or licensed donor asset.

![Synthetic Community Media acceptance fixture](./assets/niakofa-community-media-test-fixture.png)

## Fixture record

| Field | Value |
| --- | --- |
| Hub | Hub 1 |
| Post | `1` |
| Media | `1` |
| Media type | Synthetic PNG gradient |
| Alt text | Generated Niakofa Community Media privacy test fixture |
| Post label | Niakofa production acceptance fixture: Community Media privacy test |

## Verified behavior

- Account A and Account B were approved disposable accounts in the same Hub.
- Both accounts could load the Community Media page.
- Account A could save the fixture and see it in the private Saved view.
- Account B could not see Account A's saved item.
- Both browser Saved filters activated successfully.
- Account A's original save state was restored after the check.

## API boundaries

- Media listing is authenticated and restricted to approved Hub members.
- Media delivery remains bearer-authenticated; clients must fetch the media
  URL with the caller's authorization header and render the returned object
  URL.
- Save visibility is private to the saving user.
- Unsave is owner-scoped so a private save can be removed even if later
  moderation or membership changes make the media unavailable to read.

## Reuse guidance

This fixture is for local review and explicitly approved disposable-account
acceptance only. Do not use it as customer content, do not attach credentials
to it, and do not import unrelated reference archives into the product.