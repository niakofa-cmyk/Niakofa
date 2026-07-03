/**
 * Nia Safety Layer
 *
 * Crisis detection and soft-distress flagging.
 * Maintained by the Godfather (Replit) — see REPLIT_GODFATHER.md.
 *
 * Philosophy: err on the side of compassion. A false positive (Nia shows
 * crisis resources to someone who didn't need them) costs nothing.
 * A false negative (Nia misses someone in genuine crisis) is unacceptable.
 *
 * NEVER remove patterns from CRISIS_PATTERNS without replacing them with
 * something more precise. The floor is always being raised, never lowered.
 */

// ═════════════════════════════════════════════════════════════════════════════
// CRISIS PATTERNS — Multilingual (English, Spanish, Swahili, Zulu, Twi,
//                                 Yoruba, Hausa, Amharic, Somali, Pidgin, Luganda)
// ═════════════════════════════════════════════════════════════════════════════
//
// CRITICAL: This file MUST detect crisis language in ALL languages Nia speaks.
// culturalGreetings.ts supports en, sw (Swahili), zu (Zulu), tw (Akan/Twi),
// yo (Yoruba), ha (Hausa), am (Amharic), so (Somali), pcm (Nigerian Pidgin),
// lg (Luganda). Crisis detection must match Nia's full language roster.
//
// A user writing "Nataka kufa" (Swahili for "I want to die") or "Mo fẹ́ kú"
// (Yoruba) is in exactly the same crisis as an English speaker — and MUST
// receive the same immediate 988/211 escalation. Nia's identity centers the
// African diaspora; her safety floor must too.
//
// Pattern structure:
//   1. English patterns first
//   2. Spanish immediately after (South Texas bilingual community)
//   3. African & diaspora languages (Swahili, Zulu, Twi, Yoruba, Hausa,
//      Amharic, Somali, Nigerian Pidgin, Luganda) — added 2026-07
//
// NEVER LOWER THE FLOOR: Do not remove patterns without replacing them with
// something more precise. Every language track has the same non-negotiable
// coverage requirement.
//
// When adding new patterns:
//   1. Add English pattern to the appropriate category
//   2. Add Spanish pattern immediately below it
//   3. Add African/diaspora-language equivalents
//   4. Test real phrases from the community before deploying

const CRISIS_PATTERNS = [
  // ── Suicidal ideation — explicit ───────────────────────────────────────────
  /\b(suicide|suicidal|kill myself|end my life|want to die|don't want to live|no reason to live|better off dead|take my own life|not worth living|thinking about ending it|end it all|check out permanently)\b/i,
  /\b(suicidio|suicida|matarme|acabar con mi vida|quiero morir|no quiero vivir|no tengo razón para vivir|mejor sin mí|quitarme la vida|no vale la pena vivir|pensando en terminarlo todo|terminar con todo|irme para siempre)\b/i,

  // ── Suicidal ideation — implicit phrasing ──────────────────────────────────
  /\b(everyone would be better off without me|nobody would miss me|wouldn't mind if i didn't wake up|don't see the point of going on)\b/i,
  /\b(todos estarían mejor sin mí|nadie me extrañaría|no me importaría no despertar|no veo sentido en seguir|no veo para qué seguir|mejor que no esté aquí)\b/i,

  // ── Self-harm ────────────────────────────────────────────────────────────
  /\b(self.?harm|cutting myself|hurting myself|burn myself|scratch myself|hit myself|harm myself)\b/i,
  /\b(autolesión|autolesionarme|cortarme|hacerme daño|quemarme|rascarme|golpearme|hacerme mal|hacerme lastimarme)\b/i,

  // ── Overdose / substance emergency ───────────────────────────────────────
  /\b(overdose|od'?ing|take too many pills|swallow everything|took too much|took all my pills)\b/i,
  /\b(sobredosis|sobredosificación|tomé demasiadas pastillas|tomé demasiado|tomé todas mis pastillas|tragué todo|me pasé de la dosis|overdosis)\b/i,

  // ── Abuse & violence (intimate partner, family) ────────────────────────────
  /\b(being abused|someone is hurting me|my partner hits|he hits me|she hits me|they hit me|i'?m being beaten|domestic violence|being stalked|partner is violent|afraid of my partner|husband hurts me|wife hurts me)\b/i,
  /\b(me maltratan|me golpean|alguien me hace daño|mi pareja me golpea|me pega|me está pegando|violencia doméstica|violencia familiar|me acosan|mi pareja es violento|tengo miedo de mi pareja|mi esposo me golpea|mi esposa me golpea|mi marido me pega|mi mujer me pega|me están golpeando)\b/i,

  // ── Human trafficking ────────────────────────────────────────────────────
  /\b(trafficking|being trafficked|forced to work|can'?t leave|they took my passport|sold me|being held against my will)\b/i,
  /\b(tráfico de personas|trata de personas|me están explotando|me obligaron a trabajar|no puedo irme|me quitaron mi pasaporte|me vendieron|me tienen contra mi voluntad|me secuestraron|me tienen encerrado|no me dejan salir)\b/i,

  // ── Homelessness emergency ─────────────────────────────────────────────────
  /\b(sleeping outside|no place to sleep|nowhere to sleep|sleeping in my car|evicted tonight|being evicted today|kicked out tonight|sleeping on the street|no shelter tonight)\b/i,
  /\b(duermo afuera|no tengo dónde dormir|no hay dónde dormir|duermo en mi carro|me desalojaron hoy|me van a desalojar|me botaron|duermo en la calle|no hay refugio esta noche|no tengo casa|estoy en la calle|sin techo)\b/i,

  // ── Hunger emergency ───────────────────────────────────────────────────────
  /\b(haven'?t eaten|no food|starving|kids haven'?t eaten|nothing to eat|no money for food|going hungry|children are hungry|baby has no formula)\b/i,
  /\b(no he comido|no hay comida|me muero de hambre|mis hijos no han comido|no tienen qué comer|no hay nada para comer|no tengo dinero para comida|tengo hambre|mis niños tienen hambre|el bebé no tiene fórmula|no hay leche para el bebé)\b/i,

  // ── Medical emergency ──────────────────────────────────────────────────────
  /\b(can'?t breathe|chest pain|heart attack|stroke|unconscious|bleeding badly|severe pain|allergic reaction|seizure|anaphylaxis|diabetic emergency|insulin|passing out)\b/i,
  /\b(no puedo respirar|dolor de pecho|ataque al corazón|infarto|derrame cerebral|desmayado|sangrando mucho|dolor severo|reacción alérgica|convulsión|anafilaxia|emergencia diabética|insulina|me estoy desmayando|no aguanto el dolor)\b/i,

  // ── Child safety ───────────────────────────────────────────────────────────
  /\b(child abuse|hurting my child|someone hurting my child|unsafe at home|my kids aren'?t safe|cps|children are in danger|abuse a child)\b/i,
  /\b(abuso infantil|maltrato infantil|le hacen daño a mi hijo|alguien le pega a mi hijo|no estamos seguros en casa|mis hijos no están seguros|protección infantil|dfps|mis niños están en peligro|abuso de un niño|abuso de menores)\b/i,

  // ── Hopelessness & giving up ───────────────────────────────────────────────
  /\b(no hope|give up on life|nothing matters anymore|what'?s the point|can'?t go on|can'?t do this anymore|done with everything|completely hopeless|lost the will)\b/i,
  /\b(sin esperanza|me rindo|ya no importa nada|para qué seguir|no puedo seguir|ya no puedo más|ya no quiero nada|sin esperanza|perdí las ganas|ya no tengo ganas de vivir|no vale la pena)\b/i,

  // ── LGBTQ+ crisis ────────────────────────────────────────────────────────
  /\b(kicked out for being (gay|trans|queer|bi|lesbian)|rejected for being trans|family disowned me|outed at school|conversion therapy|homeless because i'?m gay|homeless because i'?m trans)\b/i,
  /\b(me botaron por ser (gay|trans|queer|lesbiana|bisexual)|me rechazaron por ser trans|mi familia me desheredó|me descubrieron en la escuela|terapia de conversión|sin casa por ser gay|sin casa por ser trans|me corrieron de la casa)\b/i,

  // ── Veteran crisis ─────────────────────────────────────────────────────────
  /\b(veteran in crisis|combat flashback|ptsd episode|can'?t stop thinking about war|survivor guilt|military trauma|veteran suicide)\b/i,
  /\b(veterano en crisis|veterano suicida|flashback de combate|episodio de ptsd|no puedo dejar de pensar en la guerra|culpa de sobreviviente|trauma militar|veterano pensando en suicidio)\b/i,

  // ── Addiction emergency ────────────────────────────────────────────────────
  /\b(withdrawals?|detox emergency|can'?t stop using|relapsed badly|using to survive|overdosing right now)\b/i,
  /\b(síndrome de abstinencia|crisis de abstinencia|no puedo dejar de usar|recaída grave|uso para sobrevivir|sobredosis ahora mismo|me estoy sobredosificando|necesito ayuda con las drogas)\b/i,

  // ── Grief emergency (complicated/acute) ────────────────────────────────────
  /\b(just lost my (child|baby|husband|wife|partner|mother|father|son|daughter)|found them dead|my (child|baby|husband|wife|partner) died today|suicide of a loved one|they killed themselves)\b/i,
  /\b(acabo de perder a mi (hijo|hija|bebé|esposo|esposa|pareja|madre|padre)|lo encontré muerto|mi (hijo|hija|esposo|esposa|pareja) murió hoy|suicidio de un ser querido|se mató|se quitó la vida)\b/i,

  // ══════════════════════════════════════════════════════════════════════════
  // AFRICAN & DIASPORA LANGUAGE CRISIS PATTERNS — added 2026-07
  //
  // Nia's identity centers the African diaspora. Her safety floor must too.
  // These patterns cover the languages in culturalGreetings.ts: Swahili (sw),
  // Zulu (zu), Akan/Twi (tw), Yoruba (yo), Hausa (ha), Amharic (am),
  // Somali (so), Nigerian Pidgin (pcm), Luganda (lg).
  //
  // A false negative in ANY of these languages is unacceptable.
  // When adding phrases: test with native speakers or verified translation;
  // prefer word-boundary patterns where the script allows.
  // ══════════════════════════════════════════════════════════════════════════

  // ── Swahili (sw) — suicidal ideation, self-harm, hopelessness ─────────────
  // NOTE: No \b boundaries — \b is ASCII-only and fails on languages with
  // diacritics or non-Latin scripts. Phrases here are long and specific enough
  // that false positives are negligible; false negatives are unacceptable.
  /(nataka kufa|nijiue|kujiua|kutaka kufa|sina sababu ya kuishi|maisha hayana maana|ningependa kufa|ninataka kumaliza maisha yangu|ninauma sana|sina nguvu tena|hakuna matumaini)/i,
  // Swahili — abuse, violence, hunger, homelessness
  /(wananipiga|wananitesa|sina mahali pa kulala|nalala nje|sina chakula|watoto hawajala|sina nyumba|ninateswa|wamenibaka|sina msaada)/i,

  // ── Zulu (zu) — suicidal ideation, hopelessness, violence ─────────────────
  /(ngifuna ukufa|ngifuna ukuzibulala|anginawo amandla|angisafuni ukuphila|ngiyeselwa|ngishaywa|anginandawo yokuhlala|abantwana abadlile|ngingenakho|ngiyaphela)/i,

  // ── Akan / Twi (tw) — suicidal ideation, distress ─────────────────────────
  /(mepε sε mewu|me pε sε mefi ha|menim mekɔ hen|mennim w'ayε|mehia mmoa|me yε ohia|mεyε deεn|mepε sε mekum me ho)/i,

  // ── Yoruba (yo) — suicidal ideation, pain, crisis ─────────────────────────
  // Yoruba uses heavy diacritics; \b would always fail on these characters.
  /(mo fẹ́ kú|mo fẹ kú|mo fẹ̀ kú|inú mi ń jẹ mi|mi ò lè farada mọ|mi ò fẹ́ gbé mọ|ìrànlọ́wọ́ mi|mo nílò ìrànlọ́wọ́|mo ti rẹ̀ ara mi|onídìítì)/i,

  // ── Hausa (ha) — suicidal ideation, suffering, violence ───────────────────
  /(ina son mutuwa|rayuwata ba ta da amfani|ba zan iya ci gaba ba|ana yi mini duka|babu bege|babu abinci|ba ni da gida|ana cutar da ni|ina ciwo mai tsanani|ba zan iya jimrewa ba)/i,

  // ── Amharic (am) — suicidal ideation, suffering ───────────────────────────
  /(lemot felagalhu|mecheresha felegalehu|aysasam bilo aydelem|qirta demo ayinim|endih memrat aychilim|beshita neger yellem|tesfa qorechu|yizo mecheresha felegalehu)/i,

  // ── Somali (so) — suicidal ideation, violence, hunger ────────────────────
  /(in aan dhinto rabaa|nafta iska qaadi rabaa|caawimo baahan yahay|la i dhibaateeye|waxaan u baahan ahay gargaar|cunada ma haysto|guriga ma haysto|cabsi badan ayaan qabaa|caawimaad deg deg ah)/i,

  // ── Nigerian Pidgin (pcm) — suicidal ideation, abuse, suffering ───────────
  // Pidgin is ASCII-safe, but keeping no \b for consistency with this section.
  /(i wan die|i no get reason to dey alive|dem dey beat me|dem dey do me bad thing|i no get food|i no get where to sleep|i don tire|nobody dey help me|i need help quick quick|e don do me bad)/i,

  // ── Luganda (lg) — suicidal ideation, hopelessness ────────────────────────
  /(njagala okuffa|sirina maanyi|ngenda okujitta|sirina kwegenda|bajjiddwa|sirina kulya|sirina gy'omanira|bampa nnyo|njagala obuyambi|tewali tukwatako)/i,

  // ── Igbo (ig) — suicidal ideation, suffering, hunger ─────────────────────
  // Spoken in SE Nigeria and Igbo diaspora worldwide (New York, London, Houston).
  // No \b — Igbo uses dotted characters (ị, ọ, ụ) that break ASCII word boundaries.
  // Phrases verified with common Igbo translations; flag for native-speaker review.
  /(achọrọ m ịnwụ|achọrọ m ikpochie onwe m|ọ dịghị olileanya|ọ na-ata m ahụhụ|ọ dịghị ihe ọ bụla|adịghị m mma|adịghị m ike|achọrọ m enyemaka ugbu a)/i,
  /(enweghị m nri|ụmụ m eri nri|enweghị m ebe obibi|a na-eme m ihe ọjọọ)/i,

  // ── Wolof (wo) — suicidal ideation, suffering, violence ───────────────────
  // Spoken in Senegal, Gambia, and Senegalese diaspora (Paris, New York, Dakar).
  // Wolof uses Latin script with apostrophes; \b unreliable on those chars.
  /(dama bëgg nawël|dama bëgg def miin|amul jàmm ci suuf bi|dama metti lool|dama sett xam nga|amul yëgël bu am solo|dama dafa ko dafa)/i,
  /(amul lekk|doomam yi lekk dafa amul|amul woon ci géej|lañ ko dafa)/i,
];

// ═════════════════════════════════════════════════════════════════════════════
// SOFT DISTRESS PATTERNS — Multilingual (English, Spanish, African languages)
// ═════════════════════════════════════════════════════════════════════════════
//
// These patterns trigger the CARE DIRECTIVE (soft flag) — Nia leads with
// warmth and acknowledgment before offering resources. Not an immediate
// crisis escalation, but signals the user needs extra care.
//
// Same multilingual requirement as CRISIS_PATTERNS above.
// African & diaspora language patterns are at the bottom of this section.

const SOFT_DISTRESS_PATTERNS = [
  // ── Emotional distress ─────────────────────────────────────────────────────
  /\b(feeling hopeless|really struggling|falling apart|can'?t cope|overwhelmed|exhausted|depressed|anxious|scared|lonely|isolated|helpless|empty inside|numb)\b/i,
  /\b(sin esperanza|estoy luchando|me estoy desmoronando|no puedo más|agobiado|agotado|deprimido|ansioso|asustado|solo|aislado|desamparado|vacío por dentro|entumecido|me siento vacío|no tengo fuerzas)\b/i,

  // ── Financial / housing stress ───────────────────────────────────────────
  /\b(lost my job|can'?t pay rent|about to lose my home|utilities cut off|no insurance|behind on bills|facing eviction|car about to be repossessed|wage theft|lost everything)\b/i,
  /\b(perdí mi trabajo|no puedo pagar la renta|voy a perder mi casa|me cortaron los servicios|no tengo seguro|debo muchas cuentas|me van a desalojar|me quitaron todo|robo de salario|no tengo nada|estoy quebrado|sin dinero)\b/i,

  // ── Relationship distress ──────────────────────────────────────────────────
  /\b(leaving my (partner|husband|wife)|relationship falling apart|divorce|separated|going through a breakup|my (partner|husband|wife) left)\b/i,
  /\b(dejar a mi (pareja|esposo|esposa)|la relación se está acabando|divorcio|separación|estamos separados|rompimos|mi (pareja|esposo|esposa) se fue|me dejó|terminamos)\b/i,

  // ── Caregiver burnout ────────────────────────────────────────────────────
  /\b(taking care of (my (parent|mom|dad|spouse|child))|caregiver|burned out from caregiving|no help with my (parent|child)|can'?t do this alone anymore)\b/i,
  /\b(cuidando a (mi (padre|madre|esposo|esposa|hijo|hija))|cuidador|quemado de cuidar|no tengo ayuda con mi (padre|madre|hijo|hija)|no puedo hacer esto solo|estoy agotado de cuidar)\b/i,

  // ── Mental health (non-acute) ────────────────────────────────────────────
  /\b(anxiety attack|panic attack|can'?t sleep|nightmares|trauma|ptsd|bipolar|schizophrenia|hearing voices|paranoid|mental health crisis)\b/i,
  /\b(ataque de ansiedad|ataque de pánico|no puedo dormir|pesadillas|trauma|ptsd|bipolar|esquizofrenia|escucho voces|paranoico|crisis de salud mental|no duermo bien)\b/i,

  // ── Addiction / recovery ───────────────────────────────────────────────────
  /\b(trying to get sober|in recovery|relapsed|struggling with (alcohol|drugs|addiction)|substance abuse|can'?t stop drinking|can'?t stop using)\b/i,
  /\b(tratando de dejar de beber|en recuperación|recaída|luchando con (alcohol|drogas|adicción)|abuso de sustancias|no puedo dejar de beber|no puedo dejar de usar|tratando de rehabilitarme)\b/i,

  // ── Food / basic needs insecurity ──────────────────────────────────────────
  /\b(struggling to eat|food insecurity|can'?t afford groceries|kids don'?t have (food|clothes)|no heat|no water|utilities off)\b/i,
  /\b(luchando para comer|inseguridad alimentaria|no puedo comprar comida|mis hijos no tienen (comida|ropa)|no tengo calefacción|no tengo agua|me cortaron los servicios|no alcanza para la comida)\b/i,

  // ── Grief (non-acute) ──────────────────────────────────────────────────────
  /\b(grieving|lost someone|someone passed|died recently|mourning|grief)\b/i,
  /\b(estoy de luto|perdí a alguien|alguien falleció|murió recientemente|estoy llorando a alguien|duelo|pena|estoy triste por una pérdida)\b/i,

  // ── Isolation ────────────────────────────────────────────────────────────
  /\b(no one to talk to|no friends|completely alone|no family|nobody cares|invisible|forgotten)\b/i,
  /\b(nadie con quien hablar|no tengo amigos|totalmente solo|no tengo familia|a nadie le importo|invisible|olvidado|nadie me quiere|me siento solo)\b/i,

  // ── Soft distress — African & diaspora languages (added 2026-07) ──────────
  // Same bilingual requirement applies. Swahili, Zulu, Twi, Yoruba, Hausa,
  // Amharic, Somali, Nigerian Pidgin, Luganda soft-distress signals.

  // Swahili (sw) — no \b for same reason as crisis patterns above
  /(nimechoka|niko peke yangu|ninahangaika|sijui la kufanya|ninahitaji msaada|ninaomba msaada|sina pesa|nimepoteza kazi|siwezi kulipa kodi|sina nguvu|nachanganyikiwa)/i,

  // Zulu (zu)
  /(ngiyakhathala|ngihluphe|ngidinga usizo|angikwazi ukuqhubeka|ngiyagcwaneka|ngiyesaba|ngihlala yedwa|ngiswele|anginayo imali|ngalahlekelwa umsebenzi)/i,

  // Akan / Twi (tw)
  /(me ho yε me ya|me yε adwenemhunu|mehia mmoa|menim me kɔ hen|me yε ohia|mabrε|me ho mfata|mennim me bra tumi)/i,

  // Yoruba (yo)
  /(mo rẹwẹsì|inú mi bí mi|mo ní ìjákulẹ̀|aini owó|mo pàdánù iṣẹ́|mi ò lè sanwó yàrá|mo rẹ̀|àánú fún mi|inú mi kò dára)/i,

  // Hausa (ha)
  /(ina gajiya|ban san yadda zan yi ba|ina bukata taimako|ba ni da kudi|na rasa aiki|ban iya biya haya ba|ina wahala|ni kadai nake|na rasa duka)/i,

  // Amharic (am)
  /(dekemat|yeteshalehu|lemiyaderg ayawk ne|gena lesra aydelem|birr yellem|work yellem|guad yellem|lemot felagalhu|tilit yellenem)/i,

  // Somali (so)
  /(waan daalan ahay|gargaar baahan ahay|lacag ma haysto|shaqo ma haysto|keli ahaan|aqoon ma haysto xalka|taageero baahan ahay|dhibaato aad badan|waan welwelsanahay)/i,

  // Nigerian Pidgin (pcm)
  /(i don tire|i no know wetin to do|i need help|i no get money|i no get work|i no fit pay rent|i dey suffer|nobody dey for me|i dey alone|e don do me bad thing)/i,

  // Luganda (lg)
  /(nkooye|sijja kola kitalo|nsinga buyambi|sirina ssente|naggya omulimu|sinnonya kwegatta|ndi bwekasi|nzijukiza|sirina gyetaagisa|bampitirirako)/i,

  // Igbo (ig) — soft distress
  /(nime ahụhụ|a dịghị m mma|m na-achọ enyemaka|enweghị m ego|enweghị m ọrụ|ihe niile adịghị mma|m dị mwute|m nwere nsogbu)/i,

  // Wolof (wo) — soft distress
  /(dama metti|dama soxor|amul kanam|dama am solo réer|amul kanam|dama am xam xam bu metti|dama yagg ci suuf)/i,
];

export interface SafetyResult {
  flagged: boolean;
  soft?: boolean;
  escalationMessage?: string;
}

export function checkSafety(message: string): SafetyResult {
  // BUG-4-M06: Empty/blank messages must not pass safety gates — they waste
  // LLM tokens and can produce confusing responses.
  if (!message || !message.trim()) {
    return { flagged: false };
  }

  // BUG-4-C04 / REC-4-05: Normalize to NFKC to collapse Unicode homoglyphs
  // (e.g. "kíll" → "kill", "suicíde" → "suicide") and strip zero-width chars
  // that bypass plain includes()/regex matching.
  const normalized = message
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF\u00AD\u2060]/g, "");

  const isCrisis = CRISIS_PATTERNS.some((p) => p.test(normalized));
  if (isCrisis) {
    return {
      flagged: true,
      escalationMessage: [
        "Sawubona — I see you, and I am here with you right now. You matter deeply. 💙",
        "",
        "Please reach out to one of these right now — they are real people, available 24/7:",
        "",
        "🆘  Immediate danger → Call 911",
        "💛  Suicide & Crisis → Call or text **988** (free, 24/7, no judgment)",
        "💬  Crisis Text Line → Text **HOME** to **741741**",
        "💜  Domestic Violence → **1-800-799-7233** (SAFE, 24/7)",
        "🏠  Shelter & Housing → Call or text **211**",
        "🍽️  Food Emergency → Call **211** or text FOOD to **877-877**",
        "🧠  Mental Health / Substance Use → **1-800-662-4357** (SAMHSA)",
        "👶  Child Safety → **1-800-422-4453** (Childhelp)",
        "🏳️‍🌈  LGBTQ+ Crisis → **1-866-488-7386** or text START to **678-678**",
        "🎖️  Veterans → **988**, then press 1",
        "🌍  International → findahelpline.com",
        "",
        "Pamoja — together, we carry this. You are not alone.",
        "",
        "I am still here with you. Would you like to keep talking?",
      ].join("\n"),
    };
  }

  const isSoftDistress = SOFT_DISTRESS_PATTERNS.some((p) => p.test(normalized));
  if (isSoftDistress) {
    return { flagged: false, soft: true };
  }

  return { flagged: false };
}
