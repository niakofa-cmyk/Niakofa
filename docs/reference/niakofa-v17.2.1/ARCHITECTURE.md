# Niakofa V17.2.1 architecture reference

Globe answers where a person is exploring. A Hub describes what is happening
there. Community is participation, Messages handles relationships and workflow
communication, and Spirals provide live participation.

The canonical paths remain:

- Community “Message people” → `/messages?mode=direct`
- Diaspora “Message hub” → `/messages?mode=hub&sourceHub=<id>`
- Community-to-Spirals discovery → `/audio-spirals?hubId=<id>` when Hub context exists

Requests remain workflow objects rather than a second chat system. Location,
membership, and representation remain separate concepts. Passing a selected
`hubId` into Community or Spiral discovery provides context only; it never
grants membership or creates a GPS gate.