import { supabase } from './supabase'
import type {
  FamilyMember, FamilyMemory, FamilyPlace, FamilyEvent,
  FamilyArtifact, LegacyWorld, LegacyChapter, LegacyScene,
  LegacyDialogue, LegacyChoice, LegacySession, LegacyQuest,
  GameStats, ChoiceRecord, AncestorCandidate, GameMode,
} from './types'

// ── Completeness scoring ──────────────────────────────────────────────────────

const WEIGHTS = {
  people: 20,
  relations: 15,
  events: 20,
  stories: 20,
  places: 15,
  consent: 10,
} as const

export const CHAPTER_UNLOCK_THRESHOLD = 40

export function calculateCompleteness(
  members: FamilyMember[],
  memories: FamilyMemory[],
  events: FamilyEvent[],
  places: FamilyPlace[],
  interviews: { id: string }[],
) {
  const peopleScore = Math.min(members.length / 5, 1) * WEIGHTS.people
  const relationsScore = Math.min(members.length > 1 ? 1 : 0, 1) * WEIGHTS.relations
  const eventsScore = Math.min(events.length / 6, 1) * WEIGHTS.events
  const storiesScore = Math.min((memories.length + 0) / 10, 1) * WEIGHTS.stories
  const placesScore = Math.min(places.length / 4, 1) * WEIGHTS.places
  const consentScore = Math.min(
    members.filter(m => m.storytelling_consent).length / Math.max(members.length, 1),
    1,
  ) * WEIGHTS.consent

  const total = Math.round(
    peopleScore + relationsScore + eventsScore + storiesScore + placesScore + consentScore,
  )

  return {
    total,
    dimensions: [
      { key: 'people', label: 'People', score: Math.round(peopleScore), max: WEIGHTS.people, count: members.length, hint: 'Add more family members' },
      { key: 'relations', label: 'Relations', score: Math.round(relationsScore), max: WEIGHTS.relations, count: members.length > 1 ? members.length - 1 : 0, hint: 'Connect family members' },
      { key: 'events', label: 'Events', score: Math.round(eventsScore), max: WEIGHTS.events, count: events.length, hint: 'Add dated life events' },
      { key: 'stories', label: 'Stories', score: Math.round(storiesScore), max: WEIGHTS.stories, count: memories.length, hint: 'Record more memories' },
      { key: 'places', label: 'Places', score: Math.round(placesScore), max: WEIGHTS.places, count: places.length, hint: 'Add family locations' },
      { key: 'consent', label: 'Consent', score: Math.round(consentScore), max: WEIGHTS.consent, count: members.filter(m => m.storytelling_consent).length, hint: 'Get storytelling consent' },
    ],
    chapterUnlockReady: total >= CHAPTER_UNLOCK_THRESHOLD,
  }
}

// ── Ancestor Selection Engine ────────────────────────────────────────────────

export function selectAncestorCandidates(
  members: FamilyMember[],
  memories: FamilyMemory[],
  events: FamilyEvent[],
  places: FamilyPlace[],
  interviews: { id: string; member_id: string | null }[],
  artifacts: FamilyArtifact[],
): AncestorCandidate[] {
  return members
    .map(member => {
      const memberMemories = memories.filter(m => m.member_id === member.id)
      const memberEvents = events.filter(e => e.member_id === member.id)
      const memberInterviews = interviews.filter(i => i.member_id === member.id)
      const memberArtifacts = artifacts.filter(a => a.member_id === member.id)
      const memberPlaces = places.filter(p =>
        member.birth_place?.toLowerCase().includes(p.label.toLowerCase()) ||
        memberEvents.some(e => e.place_id === p.id),
      )

      const storyCount = memberMemories.length
      const eventCount = memberEvents.length
      const placeCount = memberPlaces.length
      const memoryCount = memberMemories.length
      const interviewCount = memberInterviews.length
      const photoCount = member.photo_url ? 1 : 0

      const completenessScore = Math.min(
        storyCount * 10 + eventCount * 8 + placeCount * 6 + interviewCount * 5 + photoCount * 3 + 10,
        100,
      )

      const reasons: string[] = []
      if (storyCount > 0) reasons.push(`${storyCount} recorded stor${storyCount === 1 ? 'y' : 'ies'}`)
      if (placeCount > 0) reasons.push(`${placeCount} location${placeCount === 1 ? '' : 's'}`)
      if (interviewCount > 0) reasons.push(`${interviewCount} interview${interviewCount === 1 ? '' : 's'}`)
      if (photoCount > 0) reasons.push('1 photograph')
      if (member.bio) reasons.push('biography available')
      if (member.storytelling_consent) reasons.push('storytelling consent given')

      return {
        member,
        storyCount,
        eventCount,
        placeCount,
        memoryCount,
        interviewCount,
        photoCount,
        completenessScore,
        selectionReason: reasons.join(', ') || 'Limited data available',
      }
    })
    .sort((a, b) => b.completenessScore - a.completenessScore)
}

// ── Chapter Generation ───────────────────────────────────────────────────────

interface GeneratedChapter {
  chapter_number: number
  title: string
  description: string
  era_label: string
  location_label: string
  year_label: string
  historical_context: string
  scenes: GeneratedScene[]
}

interface GeneratedScene {
  scene_number: number
  title: string
  type: 'narration' | 'dialogue' | 'reflection' | 'quest' | 'transition'
  content: string
  historical_layer: 'verified' | 'historical_context' | 'narrative_interpretation'
  time_of_day: string
  atmosphere: string
  dialogues: { speaker: string; speaker_relation: string | null; line: string; tone: string }[]
  choices: { choice_number: number; text: string; consequence: string; action: string; stat_effects: Partial<GameStats> }[]
}

export function generateChapters(
  ancestor: FamilyMember,
  memories: FamilyMemory[],
  events: FamilyEvent[],
  places: FamilyPlace[],
  artifacts: FamilyArtifact[],
): GeneratedChapter[] {
  const chapters: GeneratedChapter[] = []

  const birthYear = ancestor.birth_year ? parseInt(ancestor.birth_year) : 1900
  const birthPlace = places.find(p =>
    ancestor.birth_place?.toLowerCase().includes(p.label.toLowerCase()),
  ) || places[0]

  // Chapter I: Before the Journey (childhood)
  chapters.push({
    chapter_number: 1,
    title: 'Before the Journey',
    description: `The early years of ${ancestor.display_name} in ${birthPlace?.label || ancestor.birth_place || 'their homeland'}.`,
    era_label: 'Childhood',
    location_label: birthPlace?.label || ancestor.birth_place || 'Homeland',
    year_label: ancestor.birth_year || 'Unknown',
    historical_context: birthPlace?.historical_context || 'A time of change and tradition.',
    scenes: generateChildhoodScenes(ancestor, memories, birthPlace),
  })

  // Chapter II: Coming of Age (based on events)
  const comingOfAgeEvents = events.filter(e =>
    e.event_type === 'education' || e.event_type === 'career',
  )
  if (comingOfAgeEvents.length > 0 || memories.length > 2) {
    const event = comingOfAgeEvents[0] || events[1]
    const eventPlace = places.find(p => p.id === event?.place_id) || places[1] || birthPlace
    chapters.push({
      chapter_number: 2,
      title: 'Coming of Age',
      description: `${ancestor.display_name} begins to step into the wider world.`,
      era_label: 'Youth',
      location_label: eventPlace?.label || 'Mission School',
      year_label: event?.event_year || String(birthYear + 10),
      historical_context: eventPlace?.historical_context || 'Education opened new doors.',
      scenes: generateComingOfAgeScenes(ancestor, event, eventPlace, memories),
    })
  }

  // Chapter III: The Journey (migration or major life change)
  const migrationEvents = events.filter(e => e.event_type === 'migration')
  if (migrationEvents.length > 0) {
    const migration = migrationEvents[0]
    const destPlace = places.find(p => p.id === migration.place_id) || places[2]
    chapters.push({
      chapter_number: 3,
      title: 'The Journey',
      description: `${ancestor.display_name} embarks on a life-changing migration.`,
      era_label: 'Migration',
      location_label: destPlace?.label || 'New Land',
      year_label: migration.event_year || String(birthYear + 20),
      historical_context: destPlace?.historical_context || 'A new beginning in a new place.',
      scenes: generateMigrationScenes(ancestor, migration, destPlace, memories, artifacts),
    })
  }

  // Chapter IV: Legacy (later life)
  chapters.push({
    chapter_number: 4,
    title: 'Legacy',
    description: `The lasting impact of ${ancestor.display_name} on the family.`,
    era_label: 'Legacy',
    location_label: 'Family',
    year_label: String(birthYear + 30),
    historical_context: 'The memories that echo through generations.',
    scenes: generateLegacyScenes(ancestor, memories, artifacts),
  })

  return chapters
}

function generateChildhoodScenes(
  ancestor: FamilyMember,
  memories: FamilyMemory[],
  place: FamilyPlace | undefined,
): GeneratedScene[] {
  const morningMemory = memories.find(m =>
    m.tags?.some(t => t.includes('childhood') || t.includes('daily life')),
  ) || memories[0]

  return [
    {
      scene_number: 1,
      title: 'Dawn',
      type: 'narration',
      content: `${ancestor.birth_year || 'Long ago'}, ${place?.label || 'a small village'}.\n\n${ancestor.display_name} wakes before sunrise.\n\nHer mother is preparing breakfast.\n\nHer father has already gone to the market.\n\nToday is different.\n\nToday ${ancestor.display_name} must decide...`,
      historical_layer: 'narrative_interpretation',
      time_of_day: 'Morning',
      atmosphere: 'Quiet anticipation',
      dialogues: [],
      choices: [
        {
          choice_number: 1,
          text: 'Help Mother with breakfast',
          consequence: 'You learn the recipes that will be passed down for generations.',
          action: 'next',
          stat_effects: { cultural_wisdom: 5, relationships: 3 },
        },
        {
          choice_number: 2,
          text: 'Sneak out to watch the sunrise',
          consequence: 'You witness the world waking up — a memory you will carry forever.',
          action: 'next',
          stat_effects: { courage: 3, knowledge: 2 },
        },
        {
          choice_number: 3,
          text: 'Practice reading by candlelight',
          consequence: 'Your curiosity grows — school will be your path.',
          action: 'next',
          stat_effects: { knowledge: 5, cultural_wisdom: 2 },
        },
      ],
    },
    {
      scene_number: 2,
      title: 'The Family Morning',
      type: 'dialogue',
      content: morningMemory?.description || `The household stirs. ${ancestor.display_name} listens to the rhythms of family life.`,
      historical_layer: morningMemory ? 'verified' : 'narrative_interpretation',
      time_of_day: 'Morning',
      atmosphere: 'Warm and familiar',
      dialogues: [
        {
          speaker: 'Mother',
          speaker_relation: 'Mother',
          line: 'Today is an important day. Your father has news when he returns.',
          tone: 'gentle',
        },
        {
          speaker: ancestor.display_name,
          speaker_relation: null,
          line: 'Is it about school? I have been practicing my letters.',
          tone: 'eager',
        },
        {
          speaker: 'Mother',
          speaker_relation: 'Mother',
          line: 'Patience. All in its time. First, we eat.',
          tone: 'knowing',
        },
      ],
      choices: [
        {
          choice_number: 1,
          text: 'Listen and remember this morning',
          consequence: 'You absorb this moment into your family\'s memory.',
          action: 'next',
          stat_effects: { cultural_wisdom: 3, relationships: 2 },
        },
        {
          choice_number: 2,
          text: 'Ask Mother about her own childhood',
          consequence: 'A new mystery quest is created — ask a relative to fill this gap.',
          action: 'preserve',
          stat_effects: { knowledge: 3, relationships: 5 },
        },
        {
          choice_number: 3,
          text: 'Reflect quietly on what comes next',
          consequence: 'You gain cultural wisdom from this moment of stillness.',
          action: 'reflect',
          stat_effects: { cultural_wisdom: 5, courage: 2 },
        },
      ],
    },
    {
      scene_number: 3,
      title: 'The Decision',
      type: 'reflection',
      content: `${ancestor.bio || 'The family remembers that ' + ancestor.display_name + ' loved school, but expectations pulled in another direction.'}\n\nThe path ahead is not yet written. What will ${ancestor.display_name} choose?`,
      historical_layer: ancestor.bio ? 'verified' : 'narrative_interpretation',
      time_of_day: 'Midday',
      atmosphere: 'Pivotal',
      dialogues: [],
      choices: [
        {
          choice_number: 1,
          text: 'Follow the path of learning',
          consequence: 'Education becomes the door to a wider world.',
          action: 'next',
          stat_effects: { knowledge: 8, courage: 5 },
        },
        {
          choice_number: 2,
          text: 'Honor the family tradition',
          consequence: 'You carry the family forward while keeping traditions alive.',
          action: 'next',
          stat_effects: { cultural_wisdom: 8, relationships: 5 },
        },
        {
          choice_number: 3,
          text: 'Forge a new path entirely',
          consequence: 'Your courage will inspire those who come after you.',
          action: 'next',
          stat_effects: { courage: 8, legacy: 5 },
        },
      ],
    },
  ]
}

function generateComingOfAgeScenes(
  ancestor: FamilyMember,
  event: FamilyEvent | undefined,
  place: FamilyPlace | undefined,
  memories: FamilyMemory[],
): GeneratedScene[] {
  const schoolMemory = memories.find(m => m.tags?.some(t => t.includes('school') || t.includes('teaching')))

  return [
    {
      scene_number: 1,
      title: 'New Doors',
      type: 'narration',
      content: `${event?.event_year || 'Years later'}, ${place?.label || 'a new place'}.\n\n${event?.description || ancestor.display_name + ' stepped into a wider world.'}\n\nThe air smells different here. The sounds are unfamiliar. But ${ancestor.display_name} is ready.`,
      historical_layer: event ? 'verified' : 'narrative_interpretation',
      time_of_day: 'Morning',
      atmosphere: 'Anticipation',
      dialogues: [],
      choices: [
        {
          choice_number: 1,
          text: 'Enter with confidence',
          consequence: 'You carry your family\'s name into a new world.',
          action: 'next',
          stat_effects: { courage: 5, reputation: 3 },
        },
        {
          choice_number: 2,
          text: 'Pause and remember home',
          consequence: 'You draw strength from the memories of your family.',
          action: 'reflect',
          stat_effects: { cultural_wisdom: 5, knowledge: 2 },
        },
      ],
    },
    {
      scene_number: 2,
      title: 'The Lesson',
      type: 'dialogue',
      content: schoolMemory?.description || `${ancestor.display_name} learns something that will shape the rest of their life.`,
      historical_layer: schoolMemory ? 'verified' : 'narrative_interpretation',
      time_of_day: 'Afternoon',
      atmosphere: 'Illumination',
      dialogues: [
        {
          speaker: 'Teacher',
          speaker_relation: 'Mentor',
          line: 'You have a gift. Do not waste it.',
          tone: 'serious',
        },
        {
          speaker: ancestor.display_name,
          speaker_relation: null,
          line: 'I will not. My family sacrificed for me to be here.',
          tone: 'determined',
        },
      ],
      choices: [
        {
          choice_number: 1,
          text: 'Promise to honor the sacrifice',
          consequence: 'Your resolve strengthens your legacy.',
          action: 'next',
          stat_effects: { legacy: 5, knowledge: 3 },
        },
        {
          choice_number: 2,
          text: 'Ask about opportunities ahead',
          consequence: 'A new path opens before you.',
          action: 'next',
          stat_effects: { knowledge: 5, courage: 3 },
        },
      ],
    },
  ]
}

function generateMigrationScenes(
  ancestor: FamilyMember,
  migration: FamilyEvent,
  destPlace: FamilyPlace | undefined,
  memories: FamilyMemory[],
  artifacts: FamilyArtifact[],
): GeneratedScene[] {
  const carriedArtifact = artifacts[0]
  const migrationMemory = memories.find(m => m.tags?.some(t => t.includes('migration')))

  return [
    {
      scene_number: 1,
      title: 'Leaving',
      type: 'narration',
      content: `${migration.event_year || 'The year of change'}.\n\n${migration.description || ancestor.display_name + ' prepares to leave everything familiar behind.'}\n\nThe bags are packed. ${carriedArtifact ? `The ${carriedArtifact.name.toLowerCase()} is wrapped carefully. ` : ''}The family gathers.`,
      historical_layer: 'verified',
      time_of_day: 'Dawn',
      atmosphere: 'Bittersweet',
      dialogues: [],
      choices: [
        {
          choice_number: 1,
          text: 'Say goodbye to the old home',
          consequence: 'You honor the place that shaped you.',
          action: 'next',
          stat_effects: { cultural_wisdom: 5, relationships: 3 },
        },
        {
          choice_number: 2,
          text: 'Leave quietly before tears come',
          consequence: 'Your courage carries you forward.',
          action: 'next',
          stat_effects: { courage: 5, legacy: 2 },
        },
      ],
    },
    {
      scene_number: 2,
      title: 'The Journey',
      type: 'transition',
      content: `The road stretches ahead. ${ancestor.display_name} travels toward ${destPlace?.label || 'an unknown future'}.\n\n${migrationMemory?.description || 'Every mile is a memory. Every horizon is a promise.'}`,
      historical_layer: 'narrative_interpretation',
      time_of_day: 'Various',
      atmosphere: 'Transitional',
      dialogues: [],
      choices: [
        {
          choice_number: 1,
          text: 'Continue the journey',
          consequence: 'You press onward, carrying your family with you.',
          action: 'next',
          stat_effects: { courage: 5, knowledge: 3 },
        },
      ],
    },
    {
      scene_number: 3,
      title: 'Arrival',
      type: 'dialogue',
      content: `${destPlace?.label || 'A new city'}. ${destPlace?.historical_context || 'Everything is different here.'}\n\n${ancestor.display_name} arrives, carrying ${carriedArtifact ? `the ${carriedArtifact.name.toLowerCase()}` : 'the weight of memory'} and the hope of a new beginning.`,
      historical_layer: destPlace ? 'historical_context' : 'narrative_interpretation',
      time_of_day: 'Evening',
      atmosphere: 'Arrival',
      dialogues: [
        {
          speaker: 'Stranger',
          speaker_relation: 'New acquaintance',
          line: 'You\'re a long way from home. What brings you here?',
          tone: 'curious',
        },
        {
          speaker: ancestor.display_name,
          speaker_relation: null,
          line: 'My family. My future. Both, I think.',
          tone: 'hopeful',
        },
      ],
      choices: [
        {
          choice_number: 1,
          text: 'Share your story',
          consequence: 'Your openness builds a new bridge in a new land.',
          action: 'next',
          stat_effects: { relationships: 5, reputation: 3 },
        },
        {
          choice_number: 2,
          text: 'Keep your story close for now',
          consequence: 'You protect your memories until the time is right.',
          action: 'next',
          stat_effects: { cultural_wisdom: 3, courage: 3 },
        },
        {
          choice_number: 3,
          text: 'Ask about this new place',
          consequence: 'You learn the history of your new home.',
          action: 'next',
          stat_effects: { knowledge: 5, cultural_wisdom: 2 },
        },
      ],
    },
  ]
}

function generateLegacyScenes(
  ancestor: FamilyMember,
  memories: FamilyMemory[],
  artifacts: FamilyArtifact[],
): GeneratedScene[] {
  return [
    {
      scene_number: 1,
      title: 'Echoes',
      type: 'reflection',
      content: `Years have passed. ${ancestor.display_name}'s choices have shaped the family.\n\n${memories[0]?.description || 'The stories are told and retold, each time with new meaning.'}\n\n${artifacts[0] ? `The ${artifacts[0].name.toLowerCase()} still exists, carried by younger hands. ${artifacts[0].story || ''}` : 'The memories live on in those who listen.'}`,
      historical_layer: 'verified',
      time_of_day: 'Evening',
      atmosphere: 'Reflective',
      dialogues: [],
      choices: [
        {
          choice_number: 1,
          text: 'Pass the story to the next generation',
          consequence: 'Your legacy is sealed. The family will remember.',
          action: 'next',
          stat_effects: { legacy: 10, cultural_wisdom: 5 },
        },
        {
          choice_number: 2,
          text: 'Record one final memory',
          consequence: 'You create a new family memory that will endure.',
          action: 'preserve',
          stat_effects: { legacy: 5, knowledge: 5 },
        },
      ],
    },
    {
      scene_number: 2,
      title: 'The Living Legacy',
      type: 'narration',
      content: `${ancestor.display_name}'s journey is complete.\n\nBut the family story continues.\n\nEvery memory preserved, every story told, every artifact kept — these are the threads that connect past to future.\n\nThis is the living legacy.`,
      historical_layer: 'narrative_interpretation',
      time_of_day: 'Timeless',
      atmosphere: 'Eternal',
      dialogues: [],
      choices: [
        {
          choice_number: 1,
          text: 'Begin a new journey',
          consequence: 'The world regenerates. A new ancestor awaits.',
          action: 'next',
          stat_effects: { legacy: 10 },
        },
      ],
    },
  ]
}

// ── Quest Generation from Knowledge Gaps ──────────────────────────────────────

export function generateQuestsFromGaps(
  ancestor: FamilyMember,
  members: FamilyMember[],
  memories: FamilyMemory[],
  events: FamilyEvent[],
  places: FamilyPlace[],
): LegacyQuest[] {
  const quests: LegacyQuest[] = []

  if (events.filter(e => e.member_id === ancestor.id).length < 3) {
    quests.push({
      id: crypto.randomUUID(),
      world_id: null,
      family_id: null,
      member_id: ancestor.id,
      title: `What happened in ${ancestor.display_name}'s life?`,
      description: `We know ${ancestor.display_name} was born in ${ancestor.birth_year || 'an unknown year'}, but the life events are missing. Ask a relative to share what they remember.`,
      quest_type: 'mystery',
      status: 'available',
      prompt: 'Ask a relative about important moments in this ancestor\'s life.',
      reward: 'New chapters will unlock as more life events are discovered.',
      knowledge_gap: 'life_events',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  if (!ancestor.photo_url) {
    quests.push({
      id: crypto.randomUUID(),
      world_id: null,
      family_id: null,
      member_id: ancestor.id,
      title: `Find a photograph of ${ancestor.display_name}`,
      description: `We have no photograph of ${ancestor.display_name}. Finding one would bring their story to life.`,
      quest_type: 'preservation',
      status: 'available',
      prompt: 'Search family albums, ask relatives, or visit old family homes.',
      reward: 'The ancestor\'s character card will display their photo.',
      knowledge_gap: 'photograph',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  const memberPlaces = places.filter(p =>
    ancestor.birth_place?.toLowerCase().includes(p.label.toLowerCase()),
  )
  if (memberPlaces.length < 2) {
    quests.push({
      id: crypto.randomUUID(),
      world_id: null,
      family_id: null,
      member_id: ancestor.id,
      title: `Where did ${ancestor.display_name} travel?`,
      description: `We only know of one location for ${ancestor.display_name}. Discovering migration routes would expand the family world map.`,
      quest_type: 'exploration',
      status: 'available',
      prompt: 'Ask about moves, trips, or relocations in the family.',
      reward: 'New locations will appear on the family world map.',
      knowledge_gap: 'locations',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  const memberMemories = memories.filter(m => m.member_id === ancestor.id)
  if (memberMemories.length < 3) {
    quests.push({
      id: crypto.randomUUID(),
      world_id: null,
      family_id: null,
      member_id: ancestor.id,
      title: `Record stories about ${ancestor.display_name}`,
      description: `Only ${memberMemories.length} stor${memberMemories.length === 1 ? 'y is' : 'ies are'} recorded about ${ancestor.display_name}. Recording more will enrich the game world.`,
      quest_type: 'preservation',
      status: 'available',
      prompt: 'Interview a family member who remembers this ancestor.',
      reward: 'New scenes and dialogue will be generated from the stories.',
      knowledge_gap: 'stories',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  return quests
}

// ── World Persistence ───────────────────────────────────────────────────────

export async function createOrUpdateWorld(
  familyId: string,
  ancestor: FamilyMember,
  chapters: GeneratedChapter[],
): Promise<LegacyWorld | null> {
  const { data: existingWorld } = await supabase
    .from('legacy_worlds')
    .select('*')
    .eq('family_id', familyId)
    .eq('ancestor_id', ancestor.id)
    .maybeSingle()

  if (existingWorld) {
    const { data: updated } = await supabase
      .from('legacy_worlds')
      .update({
        status: 'ready',
        chapter_count: chapters.length,
        ancestor_name: ancestor.display_name,
        ancestor_birth_year: ancestor.birth_year,
        ancestor_birth_place: ancestor.birth_place,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingWorld.id)
      .select()
      .maybeSingle()

    if (updated) {
      await persistChapters(updated.id, familyId, chapters)
      return updated
    }
    return existingWorld
  }

  const { data: world } = await supabase
    .from('legacy_worlds')
    .insert({
      family_id: familyId,
      status: 'ready',
      ancestor_id: ancestor.id,
      ancestor_name: ancestor.display_name,
      ancestor_birth_year: ancestor.birth_year,
      ancestor_birth_place: ancestor.birth_place,
      chapter_count: chapters.length,
    })
    .select()
    .maybeSingle()

  if (world) {
    await persistChapters(world.id, familyId, chapters)
    return world
  }

  return null
}

async function persistChapters(
  worldId: string,
  familyId: string,
  chapters: GeneratedChapter[],
): Promise<void> {
  const { data: existingChapters } = await supabase
    .from('legacy_chapters')
    .select('id, chapter_number')
    .eq('world_id', worldId)

  if (existingChapters && existingChapters.length > 0) return

  for (const chapter of chapters) {
    const { data: chapterRow } = await supabase
      .from('legacy_chapters')
      .insert({
        world_id: worldId,
        family_id: familyId,
        chapter_number: chapter.chapter_number,
        title: chapter.title,
        description: chapter.description,
        status: chapter.chapter_number === 1 ? 'unlocked' : 'locked',
        unlock_threshold: CHAPTER_UNLOCK_THRESHOLD,
        scene_count: chapter.scenes.length,
        era_label: chapter.era_label,
        location_label: chapter.location_label,
        year_label: chapter.year_label,
        historical_context: chapter.historical_context,
      })
      .select()
      .maybeSingle()

    if (!chapterRow) continue

    for (const scene of chapter.scenes) {
      const { data: sceneRow } = await supabase
        .from('legacy_scenes')
        .insert({
          chapter_id: chapterRow.id,
          scene_number: scene.scene_number,
          title: scene.title,
          type: scene.type,
          content: scene.content,
          historical_layer: scene.historical_layer,
          time_of_day: scene.time_of_day,
          atmosphere: scene.atmosphere,
        })
        .select()
        .maybeSingle()

      if (!sceneRow) continue

      for (const dialogue of scene.dialogues) {
        await supabase.from('legacy_dialogues').insert({
          scene_id: sceneRow.id,
          speaker: dialogue.speaker,
          speaker_relation: dialogue.speaker_relation,
          line: dialogue.line,
          tone: dialogue.tone,
        })
      }

      for (const choice of scene.choices) {
        await supabase.from('legacy_choices').insert({
          scene_id: sceneRow.id,
          choice_number: choice.choice_number,
          text: choice.text,
          consequence: choice.consequence,
          action: choice.action,
          stat_effects: choice.stat_effects,
        })
      }
    }
  }
}

export async function loadWorldChapters(worldId: string): Promise<LegacyChapter[]> {
  const { data, error } = await supabase
    .from('legacy_chapters')
    .select('*')
    .eq('world_id', worldId)
    .order('chapter_number')

  if (error) return []
  return data as LegacyChapter[]
}

export async function loadChapterScenes(chapterId: string): Promise<{
  scenes: LegacyScene[]
  dialogues: LegacyDialogue[]
  choices: LegacyChoice[]
}> {
  const { data: scenes, error: scenesError } = await supabase
    .from('legacy_scenes')
    .select('*')
    .eq('chapter_id', chapterId)
    .order('scene_number')

  if (scenesError || !scenes) return { scenes: [], dialogues: [], choices: [] }

  const sceneIds = scenes.map(s => s.id)
  if (sceneIds.length === 0) return { scenes: scenes as LegacyScene[], dialogues: [], choices: [] }

  const [dialoguesResult, choicesResult] = await Promise.all([
    supabase.from('legacy_dialogues').select('*').in('scene_id', sceneIds).order('created_at'),
    supabase.from('legacy_choices').select('*').in('scene_id', sceneIds).order('choice_number'),
  ])

  return {
    scenes: scenes as LegacyScene[],
    dialogues: (dialoguesResult.data || []) as LegacyDialogue[],
    choices: (choicesResult.data || []) as LegacyChoice[],
  }
}

export async function createSession(worldId: string, chapterId: string): Promise<LegacySession | null> {
  const { data, error } = await supabase
    .from('legacy_sessions')
    .insert({
      world_id: worldId,
      chapter_id: chapterId,
      scene_index: 0,
      status: 'active',
      stats: { knowledge: 0, relationships: 0, cultural_wisdom: 0, courage: 0, reputation: 0, legacy: 0 },
      choices_made: [],
    })
    .select()
    .maybeSingle()

  if (error) return null
  return data as LegacySession
}

export async function updateSessionProgress(
  sessionId: string,
  sceneIndex: number,
  stats: GameStats,
  choicesMade: ChoiceRecord[],
): Promise<void> {
  await supabase
    .from('legacy_sessions')
    .update({
      scene_index: sceneIndex,
      stats,
      choices_made: choicesMade,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
}

export async function completeChapter(chapterId: string): Promise<void> {
  await supabase
    .from('legacy_chapters')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', chapterId)
}

export async function unlockNextChapter(worldId: string, currentChapterNumber: number): Promise<void> {
  await supabase
    .from('legacy_chapters')
    .update({ status: 'unlocked', updated_at: new Date().toISOString() })
    .eq('world_id', worldId)
    .eq('chapter_number', currentChapterNumber + 1)
}

// ── Knowledge Versioning ──────────────────────────────────────────────────────

export async function computeKnowledgeHash(familyId: string): Promise<string> {
  const [members, memories, events, places, interviews, artifacts] = await Promise.all([
    supabase.from('family_members').select('id, updated_at').eq('family_id', familyId),
    supabase.from('family_memories').select('id, updated_at').eq('family_id', familyId),
    supabase.from('family_events').select('id, updated_at').eq('family_id', familyId),
    supabase.from('family_places').select('id, created_at').eq('family_id', familyId),
    supabase.from('family_interviews').select('id, created_at').eq('family_id', familyId),
    supabase.from('family_artifacts').select('id, created_at').eq('family_id', familyId),
  ])

  const data = JSON.stringify({
    members: (members.data || []).map((m: { id: string; updated_at: string }) => m.id + m.updated_at).sort(),
    memories: (memories.data || []).map((m: { id: string; updated_at: string }) => m.id + m.updated_at).sort(),
    events: (events.data || []).map((e: { id: string; updated_at: string }) => e.id + e.updated_at).sort(),
    places: (places.data || []).map((p: { id: string; created_at: string }) => p.id + p.created_at).sort(),
    interviews: (interviews.data || []).map((i: { id: string; created_at: string }) => i.id + i.created_at).sort(),
    artifacts: (artifacts.data || []).map((a: { id: string; created_at: string }) => a.id + a.created_at).sort(),
  })

  const encoder = new TextEncoder()
  const buffer = encoder.encode(data)
  const hash = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function recordKnowledgeVersion(
  familyId: string,
  hash: string,
  changeDescription?: string,
): Promise<void> {
  const { data: latest } = await supabase
    .from('family_knowledge_versions')
    .select('version_number')
    .eq('family_id', familyId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextVersion = (latest?.version_number || 0) + 1

  const [members, memories, events, places, interviews, artifacts] = await Promise.all([
    supabase.from('family_members').select('id', { count: 'exact', head: true }).eq('family_id', familyId),
    supabase.from('family_memories').select('id', { count: 'exact', head: true }).eq('family_id', familyId),
    supabase.from('family_events').select('id', { count: 'exact', head: true }).eq('family_id', familyId),
    supabase.from('family_places').select('id', { count: 'exact', head: true }).eq('family_id', familyId),
    supabase.from('family_interviews').select('id', { count: 'exact', head: true }).eq('family_id', familyId),
    supabase.from('family_artifacts').select('id', { count: 'exact', head: true }).eq('family_id', familyId),
  ])

  await supabase.from('family_knowledge_versions').insert({
    family_id: familyId,
    version_number: nextVersion,
    knowledge_hash: hash,
    member_count: members.count || 0,
    memory_count: memories.count || 0,
    interview_count: interviews.count || 0,
    place_count: places.count || 0,
    event_count: events.count || 0,
    artifact_count: artifacts.count || 0,
    change_description: changeDescription || `Knowledge version ${nextVersion}`,
  })
}
