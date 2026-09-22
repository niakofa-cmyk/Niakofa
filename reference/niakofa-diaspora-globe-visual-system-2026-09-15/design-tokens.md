# Visual and interaction tokens

These are reference tokens extracted from the supplied concept boards and the
current Niakofa Diaspora implementation. They are guidance for future native
or web surfaces, not a replacement for the shared application theme.

## Color roles

| Role | Reference |
| --- | --- |
| Night canvas | `#071312` |
| Deep panel | `#0A1918` |
| Teal primary | `#74E0C5` |
| Teal surface | `rgba(116, 224, 197, 0.10)` |
| Amber memory | `#F5C96A` |
| Crisis | `#FDA4AF` |
| Primary text | `#FFFFFF` |
| Secondary text | `rgba(255, 255, 255, 0.55)` |

## Component rules

- Globe markers are teal by default and rose for active crisis state.
- Do not use amber to imply Home geography.
- Marker pulses are decorative and pointer-transparent.
- Hub drawers use a dark translucent surface with a teal border accent.
- Primary actions use teal; secondary actions use low-contrast bordered
  surfaces.
- Details and local communities stay collapsed until requested.

## Accessibility

- Every marker has an accessible Hub label.
- Every icon-only control has an accessible name.
- Dialogs use `role="dialog"` and `aria-modal="true"`.
- Text and controls must remain usable with increased text size.
- Decorative map layers never intercept pointer or keyboard interaction.