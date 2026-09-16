Yes. I reviewed the actual Niakofa Diaspora Globe Concept Board and Diaspora Mobile Experience concepts, including the visual states shown in the images. The important thing is that these are not merely “screens”; together they describe a visual interaction system.

The intended behavior can be understood as:

Globe → Hub → Community → Action → Memory → Connection → back to Globe

The concepts consistently make the Globe the geographic entry point, while the Hub becomes the doorway into everything happening in that place.

1. Overall visual language

The entire experience has a consistent visual identity.

Background

The primary application environment is:

deep navy/near-black
subtle blue/teal gradients
glowing geographic elements
translucent/dark cards
bright green, gold, blue and occasional purple accents
high contrast white typography

The visual effect is intended to feel alive, rather than like a conventional administrative dashboard.

The globe is particularly important because it is not presented as a static map. It visually communicates:

movement
geographic relationships
activity
diaspora connectivity
people being distributed around the world
countries/states functioning as nodes in one network.

The concept board explicitly describes the globe as an interactive 3D globe with country and U.S. state hubs.

2. The hero/header behavior

At the top of the desktop concept is a large branded introduction.

It contains:

NIAKOFA

Our People • Our Roots • Our Future

followed by:

Diaspora Globe

One Global Family. Many Homes.

Then:

Explore our global community, connect with your hubs, share stories, and keep our heritage alive.

Underneath is a five-stage conceptual navigation:

Globe → Hub → Community → Action → Memory

with:

Globe — Where we are
Hub — Your community
Community — Our people
Action — Build, support, grow
Memory — Our legacy.
Visual behavior

This establishes a very important mental model.

The user isn't being told:

"Here are six unrelated features."

They're being shown:

Find where your people are → enter that community → interact with people → do something → preserve what matters.

That should remain the fundamental visual grammar of Diaspora.

3. The animated/glowing Earth behavior

The hero Earth shows:

illuminated continents
glowing hub points
curved connection arcs
multiple geographic nodes
bright points of activity
a cinematic nighttime/global appearance.

The visual implication is that the Earth is networked.

The concept specifically shows glowing connection lines and hub dots around the planet.

Intended interaction behavior

A production implementation should make this feel alive through subtle motion:

hub points gently pulse
active hubs can brighten
connection paths can softly animate
the globe can slowly rotate when idle
interaction stops or slows rotation
selected locations become brighter
the selected hub becomes visually dominant
other hubs remain visible but recede slightly.

Importantly, the concept communicates this behavior visually, even though the static image itself cannot prove that these animations were implemented.

4. Desktop Diaspora Globe

This is the central visual state.

The desktop layout contains:

Left navigation

The sidebar has:

Niakofa logo
Diaspora
Communities
Spirals
Stories
Messages
More

Diaspora is visually selected/highlighted.

The user's identity is shown near the bottom:

Amina Johnson
Global Member

The sidebar is persistent application chrome rather than part of the globe itself.

Main globe

The globe occupies the majority of the screen.

Visible hub examples include:

United States / State Hubs
Jamaica
Brazil
Ghana
Nigeria
UK
South Africa.

The markers are visually different from ordinary map labels because they are interactive objects.

5. Hub markers

A Hub marker consists visually of:

glowing point
flag/icon
geographic label
rounded/dark information bubble
bright outline/glow.

Examples:

Ghana

Brazil

Nigeria

Jamaica

United States
(State Hubs)

The concept uses flags/colors to make the geographic identity immediately recognizable.

Intended behavior

A marker should have several visual states:

Idle

Small glowing marker.

Hover

marker enlarges slightly
glow increases
label becomes more prominent.

Focus

globe centers the selected location
marker becomes the dominant visual element
surrounding markers remain visible but visually subordinate.

Selected

marker gets a stronger ring/glow
Hub information appears
the rest of the UI transitions into Hub context.

Crisis/live state

The marker can use a different visual treatment when there is a live event or crisis.

Your actual implementation already uses crisis-specific visual treatment rather than inventing fake network data.

6. Globe rotation behavior

The concept is visually presenting a true globe rather than a flat world map.

Therefore the expected interaction is:

Drag

User drags the globe.

The Earth rotates naturally.

Scroll/pinch

Zoom in/out.

Zoom

As the user zooms:

Global view

→ countries/hubs

→ region

→ selected country/state

→ potentially local hub context.

The visual hierarchy should change with zoom.

You don't want every city marker visible simultaneously.

7. Globe search behavior

The concept places search directly above the globe:

Search countries, states, or hubs...

The mobile version similarly says:

Search country, state or hub…

This is an important interaction.

The search isn't supposed to navigate away to an unrelated search page.

Instead:

User types

Brazil

Results

Brazil appears.

User selects Brazil

The globe:

rotates/focuses toward Brazil
centers Brazil
highlights its marker
opens the Brazil Hub context.

Likewise:

Texas

should locate the Texas state Hub.

And importantly:

Recife

can locate a local community associated with the Brazil Hub.

Your current implementation already added merged/local Hub names to search so a local name such as Recife can resolve to its canonical Brazil marker.

8. Global Diaspora information panel

Desktop concept shows a right-side information panel:

Global Diaspora

with:

124 Countries & States
2.4M Members
1.2K Active Now

and:

Featured Hubs

Ghana
Nigeria
Brazil
Texas
California

followed by:

Explore All Hubs →

Behavior

This panel acts as the Globe's contextual information layer.

It should update based on global state.

For example:

total number of canonical Hubs
total members
active members
featured/popular hubs.

Clicking a Featured Hub should produce the same result as clicking that Hub on the globe.

That is important:

The list and globe should be two interfaces into the same Hub object.

They should never represent separate data.

9. Globe controls

The concept shows:

−
globe/compass/location control
layer/control button.

These are not decorative.

Plus

Zoom in.

Minus

Zoom out.

Globe/compass

Return to global/default geographic orientation.

Layer/control

Potentially control:

Hub types
activity
connections
local communities
geographic layers.

The mobile concept carries the same pattern with right-side map controls.

10. Country Hub behavior — Ghana example

Once Ghana is selected, the experience changes from:

Where is the community?

to:

What is happening in this community?

The Ghana Hub visual contains:

Ghana imagery
Ghana flag
Ghana
Country Hub label
member count
story count
Spiral count
active-now indicator
Community button
Message Hub button
Spirals
Stories
Family Memory
Local Communities
Pool.

The concept shows:

12,482 Members
8 Stories
3 Spirals
126 People Active Now.

11. Hub imagery behavior

The Hub drawer/card has a photographic header.

For Ghana, the concept uses a recognizable Ghanaian landmark.

This creates a visual transition:

Globe = geography

Photo = identity

So when Ghana is opened, the user doesn't just see another database record.

They see:

This place has a culture and identity.

The image acts as an emotional bridge between the geographic map and the community.

12. Hub statistics

The numbers are presented horizontally:

12,482
Members

8
Stories

3
Spirals

and:

🟢 126 People Active Now

The statistics are intentionally compact.

They answer:

How large is this Hub?
How much cultural content exists?
How much community activity exists?
Is anyone there right now?
13. Active-now visual behavior

The green dot is a live-state indicator.

It should communicate:

People are here now.

It shouldn't behave like a static icon.

A production implementation can:

pulse subtly
update counts
transition when activity changes
disappear when no longer active.

This same visual language appears in the Live Presence concept, where the globe is paired with:

Live Now
24 members online

and location-based counts.

14. Community button

The large green Community button is the primary social action.

Selecting it transitions:

Hub

→ Community Feed

rather than leaving the Hub context entirely.

The user enters a feed containing:

posts
people
events
projects.
15. Message Hub behavior

The blue Message Hub button represents a different action.

It moves from:

geographic discovery

to:

cross-community communication.

The user can message the Hub rather than an individual person.

This distinction is important because Niakofa is modeling communities as first-class entities.

16. Spirals button

The Spiral action opens the interest/community layer.

Examples from the concept:

African Heritage & Culture
Business & Innovation
Youth Leadership
Arts & Creativity
Family & Genealogy.

A Spiral is therefore visually represented as:

a community organized around a shared interest.

17. More from Hub

The concept places additional capabilities underneath the primary actions:

Stories
Family Memory
Local Communities
Pool.

This is important UX architecture.

These capabilities don't disappear.

They are contextualized by the Hub.

So instead of:

"Stories"

the experience becomes:

"Stories from Ghana."

Instead of:

"Pool"

it becomes:

"Ghana Community Pool."

That creates a much stronger sense of place.

18. Local Communities behavior

The Ghana concept shows:

Accra (Primary)
Kumasi
Tamale
Cape Coast

with:

4 Local Hubs →

The Globe therefore has two levels:

Level 1

Country/state Hub.

Level 2

Local communities.

This matches the current database architecture where local Hub records can be grouped under a canonical Globe Hub. The grouping is intended for Globe presentation and preserves the local records.

Interaction

Selecting:

Accra

should transition the Hub context toward Accra.

But the Globe should not suddenly treat Accra as an independent top-level global country marker.

That's the distinction between:

canonical Globe geography

and:

local community geography.

19. U.S. State Hub behavior

The concept deliberately treats the United States differently.

Texas is shown as:

Texas
U.S. State Hub

with:

Texas flag
Texas-specific statistics
active people
Community
Message Hub
Stories
Family Memory
Local Communities
Pool.

The surrounding map highlights Texas itself.

This establishes the visual rule:

Global

Country = Hub

United States

State = Hub

So:

Ghana → Ghana Hub
Brazil → Brazil Hub
Jamaica → Jamaica Hub
Texas → Texas Hub
California → California Hub
Georgia → Georgia Hub.
20. U.S. state switching behavior

The Texas concept also shows:

Other U.S. State Hubs

with:

California
Georgia
New York
Florida

and:

View All States →

This creates a geographic sibling-navigation mechanism.

The user can move:

Texas → California

without returning to the global Globe first.

That should feel like moving laterally between related Hubs.

21. Hub-to-Hub messaging

This is one of the most important concepts.

The messaging screen contains:

New Message

and:

Select Hubs

with selected recipients:

Ghana
Texas
UK.

The user writes a message to multiple communities:

Let's explore a cultural exchange program between Ghana, Texas and the UK...

Then:

Send Message

The concept also shows recent Hub chats.

Visual behavior

The recipient isn't just:

Person A

It's:

Ghana ↔ Texas

or:

Ghana ↔ Nigeria.

This makes the Hub itself a communication identity.

22. Hub message list behavior

The mobile concept makes this especially clear.

The list contains:

Ghana ↔ Texas
Nigeria ↔ UK
Brazil ↔ California
Jamaica ↔ Florida
UK ↔ Canada
Ghana ↔ Nigeria.

Each row has:

geographic identifiers/flags
message preview
timestamp
unread indicator when appropriate.

Unread behavior

The green dot represents unread/new activity.

The timestamp communicates recency.

Opening the conversation should clear the unread state.

23. Hub Network

The mobile concept explicitly introduces three messaging tabs:

Chats | Hub Network | Requests

This implies that messaging isn't just a traditional inbox.

Chats

Existing conversations.

Hub Network

Discover/manage relationships between Hubs.

Requests

Incoming/outgoing Hub connection requests.

This is an important future visual behavior if the feature is implemented fully.

24. Live Presence & Connections

The concept has another Globe state dedicated to real-time activity.

Instead of simply showing:

Ghana

the globe becomes a living network.

There are:

glowing nodes
animated-looking arcs
active Hub counts
Live Now panel
live gathering card
Hub Connections legend.

Example:

Accra, Ghana — 12
Lagos, Nigeria — 8
London, UK — 4.

25. Live gathering popup

The concept shows a small contextual card:

Live Gathering
Ghana • 12 online
Cultural Exchange

with an image.

This means activity can become an object attached to geography.

The visual behavior should be:

Hub becomes active

→ marker changes appearance

→ user can see activity

→ activity card appears

→ selecting it opens the live gathering.

This is much richer than merely displaying an "online" number.

26. Connection lines

The concept shows arcs such as:

Ghana → Texas
Ghana → UK
Nigeria → Brazil
US State → Country.

These are visual representations of relationships.

But this is one area where the concept must be treated carefully.

Do not make fake lines.

A production implementation should only render these when backed by actual data such as:

messages
active collaboration
events
partnerships
shared projects
community relationships.

Otherwise the Globe is visually claiming relationships that may not exist.

That distinction matters considerably for Niakofa.

27. Stories & Memory visual behavior

The Stories section is intentionally much more emotional than the geographic screens.

It shows a large photographic scene of an elder looking toward a landscape.

Overlay:

Our roots run deep.
Our stories go further.

and:

Share a Story

The concept then shows Featured Stories.

The behavior is:

Geography

→ People

→ Stories

→ Memory

This is where the Diaspora experience becomes personal.

28. Story cards

Each story card contains:

image
title
author
geographic context
time
engagement/activity.

Examples include:

The Journey Home
By Amina Johnson
Ghana • 2 days ago

My Family Tree
By Kwame Mensah
Nigeria • 4 days ago

Our Ancestors
By Leila Brown
Jamaica • 1 week ago.

The geographic label is important.

The story isn't just content.

It is content attached to place.

29. Mobile Splash behavior

The mobile experience begins with a dedicated welcome state.

It contains:

Niakofa logo
globe imagery
glowing geographic network
Diaspora title
supporting description
large gold CTA.

The CTA says:

Explore Globe →

The desired behavior is extremely simple:

Open app

→ recognize Niakofa

→ understand Diaspora

→ Explore Globe.

There should be no dashboard clutter before this.

30. Mobile Globe

The mobile Globe compresses the desktop concept while retaining the core behavior.

It has:

title
search
globe
country/state markers
legend
zoom controls
location/compass
bottom navigation.

The mobile Globe therefore isn't a separate product.

It's the same geographic system adapted to a smaller viewport.

31. Mobile bottom navigation

The concept uses:

Home | Diaspora | Circles | Messages | More

with Diaspora highlighted when on the Globe.

This creates a persistent application-level navigation layer.

The current Niakofa implementation is responsive and has contextual access to messaging, but the concept's exact five-item mobile shell is more explicit than the current navigation structure.

So this is one of the visual/IA behaviors to preserve when refining the implementation.

32. Mobile Hub Drawer

This is arguably the most important mobile interaction.

The Globe remains visible behind/around the Hub context.

A bottom sheet/drawer appears containing:

hero image
back/close
flag
Hub name
Hub type
statistics
live count
primary actions
secondary actions
local communities.

The concept explicitly identifies this as:

Hub Drawer — Key info, actions and local communities.

Intended gesture behavior

Tap marker:

Globe → drawer slides upward

Tap outside:

drawer closes

Tap X:

drawer closes

Swipe downward:

drawer dismisses

Tap Community:

drawer → Community

Tap Message Hub:

drawer → messaging

Tap Stories:

drawer → Stories

etc.

This is the correct mobile equivalent of the desktop Hub panel.

33. Mobile Community Feed

The Ghana Community screen contains:

header
Ghana flag
Ghana
Community
tabs:
Feed
People
Events
Projects.

The Feed displays posts with:

avatar
name
time
local city
text
photograph
likes
comments
sharing.

There is a floating green + button.

Visual behavior

Scrolling should feel like a conventional social feed, but geographically contextualized.

The user isn't just reading:

"Someone posted something."

They're seeing:

Someone in Accra posted something to the Ghana community.

34. The floating + button

The green circular + is a creation affordance.

It can become the visual gateway to actions such as:

create post
create event
create project
share story
potentially request help.

The exact action menu is not fully defined by the concept, so this is an area where implementation should be driven by the actual product contract rather than inventing functionality.

35. Search screen behavior

The mobile concept also shows a dedicated search state.

At the top:

Search

with a search field containing:

Brazil

Then filtering controls:

All
Countries
States
Cities.

The results show:

Brazil
Country Hub
12,482 members

followed by:

Local Communities

such as:

Salvador (Primary)
Recife
São Luís
São Paulo.

This is important because the search behavior isn't simply string matching.

It is hierarchical geographic discovery.

36. Search hierarchy

The intended hierarchy is:

Search
   ↓
Country / State
   ↓
Hub
   ↓
Local Communities

For example:

Brazil
   ↓
Brazil Hub
   ├── Salvador
   ├── Recife
   ├── São Luís
   └── São Paulo

This is exactly why preserving local Hub records while merging their Globe representation is useful.

37. Stories & Memory mobile screen

The mobile Stories screen contains:

Stories & Memory header
Featured
My Family
Local tabs
large featured story
Explore Stories
featured story cards.

The concept describes this screen as:

Preserve and explore your family's legacy.

Behavior

The visual design intentionally moves from:

geographic discovery

into:

heritage discovery.

This is where Family Memory should feel integrated rather than bolted on.

38. Spirals mobile screen

The Spirals screen has:

Explore
My Spirals
Create.

Featured card:

African Heritage & Culture
12 members • 3 active

with:

Join

Then popular Spirals:

Business & Innovation
Youth Leadership
Arts & Creativity
Family & Genealogy.

Behavior

The user should be able to:

Discover → open → join → participate.

The "active" count makes Spirals feel alive rather than like a static directory.

39. Community Pool visual behavior

The Pool screen is financially oriented but uses the same visual language.

It contains:

Total Pool Balance
$48,240
+12% this month

Then:

Support a Project

with:

Ghana Community Clinic

and:

$20,000 needed
62%

plus a green:

Support

button.

Recent activity includes:

Texas Hub +$500

and:

Ghana Hub +$1,000.

The important visual behavior is that money is contextualized to community impact.

40. The Pool isn't visually isolated

The concept intentionally connects:

Hub

→ Pool

→ Project

→ Contribution

→ Community activity

This makes the financial system part of the Diaspora ecosystem instead of a separate banking screen.

41. Responsive behavior

The mobile concept is not simply a smaller desktop screen.

It changes interaction patterns.

Desktop

Persistent sidebar + globe + panels.

Mobile

Bottom navigation + full-width screens + drawers + sheets.

So:

Desktop:
Sidebar
   ↓
Globe
   ↓
Right-side Hub panel

Mobile:
Bottom navigation
   ↓
Globe
   ↓
Bottom-sheet Hub drawer

This is a genuine responsive interaction model.

42. Touch behavior

The mobile design requires larger interactive targets.

The current mobile hardening work specifically targets this type of behavior:

larger Hub marker
larger search clear target
bottom sheet positioned above navigation
reduced-motion handling.

The concept itself emphasizes mobile map controls and persistent bottom navigation.

43. Motion hierarchy

The concepts imply three levels of motion.

Ambient motion

Very subtle:

globe rotation
network glow
active marker pulse.
Interaction motion

Moderate:

globe fly-to
drawer slide
search result transition
selected marker expansion.
Action motion

Strong enough to confirm an action:

message sent
story published
Hub joined
Pool contribution completed.

This hierarchy prevents the entire interface from constantly moving.

44. What should NOT move

This is equally important.

The following should remain stable:

text
statistics
buttons
navigation
Hub identity
geographic labels.

The globe can move around them.

The UI shouldn't feel like a game menu.

45. Loading behavior

Although not explicitly shown in the static concept, the visual architecture implies loading states.

For example:

Globe loading

→ skeleton/globe placeholder

Hub opening

→ selected marker remains visible

→ drawer loads

Live data loading

→ retain previous stable UI

→ update active counts when available.

This is preferable to blank screens.

Your actual application already has loading-state infrastructure around the Globe rather than requiring the concept to be purely decorative.

46. Error behavior

Likewise, a production version should visually preserve context.

If Hub data fails:

Don't replace the entire Globe with:

Error.

Instead:

Globe remains

→ Hub drawer says:

We couldn't load this Hub right now.

→ Retry.

This maintains the geographic mental model.

47. Empty-state behavior

The same principle applies when there are no:

stories
Spirals
active members
local communities
messages.

The Hub itself should remain visible.

For example:

No stories yet
Be the first to share a memory.

rather than an empty black panel.

48. The visual hierarchy of importance

The concept establishes this order:

1 — Globe

Where are we?

2 — Hub

Which community?

3 — People/activity

Who is there?

4 — Action

What can I do?

5 — Memory

What does this place mean?

That is much cleaner than putting every feature on the first screen.

49. The critical interaction loop

Putting everything together:

OPEN DIASPORA
       ↓
   WORLD GLOBE
       ↓
Search / rotate / zoom
       ↓
    SELECT HUB
       ↓
   HUB DRAWER
       ↓
 ┌─────┼────────┬────────┐
 ↓     ↓        ↓        ↓
People Stories  Spirals  Pool
 ↓     ↓        ↓        ↓
Community Memory Interest Impact
       ↓
   Message / Act
       ↓
Hub-to-Hub connection
       ↓
   GLOBAL GLOBE

This is the real behavior the concepts are communicating.

50. The most important visual principle

The concept isn't really about making a beautiful 3D globe.

The globe is the navigation metaphor for Niakofa's entire Diaspora network.

The intended relationship is:

WORLD
  ↓
COUNTRY / U.S. STATE
  ↓
HUB
  ↓
LOCAL COMMUNITY
  ↓
PEOPLE
  ↓
STORIES / EVENTS / SPIRALS / PROJECTS
  ↓
MESSAGING / SUPPORT / COLLABORATION
  ↓
FAMILY MEMORY
  ↓
WORLD

That is why the concept's labels explicitly progress:

Globe → Hub → Community → Action → Memory.

And it is also why the current Globe-first redesign is architecturally much closer to the concept than the old multi-card Diaspora dashboard: the current /diaspora is already centered on the Globe and uses Hub selection as the doorway into the other systems. The repo work also specifically made local Hub names searchable and improved the local-community drill-down.

In short

The desired visual behavior is not:

"A page with a globe and some buttons."

It is:

An interactive geographic operating system for the diaspora.

The globe should move, Hub markers should respond, Hub panels should open, active communities should come alive, search should fly the user to a place, local communities should nest underneath their canonical Hub, messages should connect Hubs, stories should attach memory to geography, and the entire system should continuously return the user to the sense that all of these communities are parts of one connected world.

The desktop and mobile concepts both reinforce that same model; the mobile board explicitly expands it into Welcome → Globe → Hub Drawer → Community → Hub Messaging → State Hubs → Search → Stories → Spirals → Pool.