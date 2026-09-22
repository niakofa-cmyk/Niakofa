# Diaspora Globe / Mobile QA Checklist

## Desktop

- [ ] `/diaspora` opens directly to Globe.
- [ ] Search Brazil/Ghana/Nigeria.
- [ ] Search Texas/California/New York.
- [ ] Search a grouped local city such as Recife and verify the canonical parent Hub opens.
- [ ] Select a country Hub.
- [ ] Select a U.S. state Hub.
- [ ] Community opens with the selected Hub ID.
- [ ] Message Hub opens the existing authenticated Hub messaging flow.
- [ ] Spirals opens with the selected Hub ID.
- [ ] Stories and Pool remain under More.
- [ ] No Home Hub marker/label.
- [ ] No old dashboard cards.

## Mobile widths

Test at 320px, 375px, and 430px.

- [ ] Globe does not create horizontal scroll.
- [ ] Globe markers are at least 44x44px.
- [ ] Search clear button is at least 44x44px.
- [ ] Hub sheet sits above the fixed BottomNav.
- [ ] Hub sheet remains scrollable.
- [ ] Close button remains reachable.
- [ ] Community / Message Hub / Spirals buttons remain tappable.
- [ ] Message composer is not obscured by BottomNav or keyboard.
- [ ] Reduced motion disables marker pulse.
- [ ] API failure keeps the page usable and allows retry/reload.

## Visual concept fidelity

- [ ] Globe remains dominant.
- [ ] Hub drawer is progressive disclosure.
- [ ] No metrics dashboard treatment.
- [ ] Teal activity glow remains restrained.
- [ ] Memory/stories are contextual rather than competing with the Globe.
- [ ] Do not add connection lines until real relationship data exists.
