/**
 * Deterministic Intent Router (Tier 0).
 *
 * Runs before any LLM or search engine. Handles safety-critical, exact-match
 * intents: active alert status, nearest shelters/hospitals, emergency dial numbers,
 * life-saving first-aid decision trees, and essential phrases.
 *
 * Engineering rule 4 & 7: Safety-critical facts come from deterministic data,
 * never from an ungrounded generator.
 */
import { packManager } from '../pack'
import type { ContactsFile, EmergencyContact, Place } from '../packTypes'
import type { Answer, AssistantContext } from './types'

export const KNOWN_EMERGENCY_NUMBERS = ['112', '108', '100', '101', '1070', '1363'] as const

/** Normalize query string for fast pattern matching. */
function normalizeQuery(q: string): string {
  return q
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
}

/** Check if query contains any of the given keywords. */
function containsAny(q: string, words: readonly string[]): boolean {
  return words.some((w) => {
    if (w.includes(' ')) {
      return q.includes(w)
    }
    const tokens = q.split(' ')
    return tokens.includes(w) || q.includes(w)
  })
}

/**
 * Filter numbers to only those officially registered in contacts.json or known list.
 */
export function sanitizeAllowedNumbers(
  candidateNumbers: readonly string[],
  contacts?: ContactsFile | null,
): string[] {
  const allowed = new Set<string>(
    contacts ? contacts.emergency.map((c: EmergencyContact) => c.number) : KNOWN_EMERGENCY_NUMBERS,
  )
  return candidateNumbers.filter((n) => allowed.has(n))
}

export async function matchDeterministicIntent(
  query: string,
  ctx: AssistantContext,
): Promise<Answer | null> {
  const norm = normalizeQuery(query)
  if (!norm) return null

  // -------------------------------------------------------------------------
  // 1. Emergency Numbers / Who to call
  // -------------------------------------------------------------------------
  const isEmergencyNumberQuery = containsAny(norm, [
    'emergency number',
    'emergency numbers',
    'phone number',
    'phone numbers',
    'who to call',
    'who do i call',
    'who can i call',
    'call police',
    'call ambulance',
    'call fire',
    'helpline',
    'emergency contact',
    '112',
    '108',
    '100',
    '101',
  ])

  if (isEmergencyNumberQuery) {
    let contacts: ContactsFile | null = null
    try {
      contacts = await packManager.getContacts()
    } catch {
      // Fallback
    }

    const numbers = contacts
      ? contacts.emergency.map((e) => e.number)
      : [...KNOWN_EMERGENCY_NUMBERS]

    const steps = [
      '112 — National Emergency Number (Police, Medical, Fire)',
      '108 — Ambulance & Emergency Medical Services',
      '100 — Police Assistance',
      '101 — Fire and Rescue',
      '1070 — State Disaster Management (Tamil Nadu)',
    ]

    return {
      mode: 'offline-guidance',
      severity: 'info',
      answer:
        'In India, 112 is the primary single emergency helpline connecting to police, fire, and ambulance services. 108 reaches ambulance services directly.',
      steps: steps.slice(0, 5),
      sources: [{ id: 'contacts', title: 'Official Emergency Contacts' }],
      escalate: false,
      numbers: sanitizeAllowedNumbers(numbers, contacts),
    }
  }

  // -------------------------------------------------------------------------
  // 2. Alert Status & Danger Warnings
  // -------------------------------------------------------------------------
  const isAlertQuery = containsAny(norm, [
    'what is the alert',
    'what alert',
    'is there an alert',
    'active alert',
    'alert status',
    'warning status',
    'is there any danger',
    'is it safe',
    'weather warning',
    'cyclone warning',
    'flood warning',
    'all clear',
    'drill status',
  ])

  if (isAlertQuery) {
    const alerts = ctx.effectiveAlerts ?? []
    const topAlert = alerts[0]
    if (topAlert) {
      const drillTag = topAlert.isDrill ? '[DRILL] ' : ''
      const headline = topAlert.headline || `Active ${topAlert.hazard} Alert Level ${topAlert.level ?? ''}`

      return {
        mode: 'offline-guidance',
        severity: (topAlert.level ?? 1) >= 3 ? 'serious' : 'caution',
        answer: `${drillTag}Active Warning: ${headline}`,
        steps: [
          'Stay indoors on high ground away from windows and coastlines.',
          'Keep your mobile phone and emergency power bank charged.',
          'Follow official broadcasts and avoid flooded roads or underpasses.',
          'Review the nearest shelter location in the Map tab.',
        ],
        sources: [{ id: topAlert.id, title: `${drillTag}Alert ${topAlert.hazard}` }],
        escalate: (topAlert.level ?? 1) >= 3,
        numbers: ['112'],
      }
    }

    const risk = ctx.riskSnapshot
    if (risk && risk.level > 0) {
      return {
        mode: 'offline-guidance',
        severity: risk.level >= 3 ? 'serious' : 'caution',
        answer: `Current zone risk level is ${risk.level} (${risk.label}). ${risk.reason ?? 'Exercise caution.'}`,
        steps: [
          'Monitor the weather forecast and official alerts.',
          'Avoid low-lying or flood-prone areas.',
          'Check the map for emergency shelter routes.',
        ],
        sources: [{ id: 'risk-engine', title: 'Live Regional Risk Assessment' }],
        escalate: risk.level >= 3,
        numbers: ['112'],
      }
    }

    return {
      mode: 'offline-guidance',
      severity: 'info',
      answer: 'There are currently no active emergency alerts declared for your zone. Conditions are monitored.',
      steps: [
        'Check back periodically if severe weather approaches.',
        'Keep emergency numbers (112, 108) saved on your device.',
        'Ensure the offline content pack is fully downloaded.',
      ],
      sources: [{ id: 'alert-system', title: 'Official Alert Registry' }],
      escalate: false,
      numbers: ['112'],
    }
  }

  // -------------------------------------------------------------------------
  // 3. Nearest Place (Shelters, Hospitals, Police, Clinics)
  // -------------------------------------------------------------------------
  const isShelterQuery = containsAny(norm, [
    'nearest shelter',
    'find shelter',
    'where is shelter',
    'where is the nearest shelter',
    'evacuate',
    'evacuation shelter',
    'safe place',
    'high ground',
    'refuge',
  ])

  if (isShelterQuery) {
    if (ctx.nearestShelters && ctx.nearestShelters.length > 0) {
      const s = ctx.nearestShelters[0]
      if (s) {
        const distStr = s.distanceMetres ? ` (~${Math.round(s.distanceMetres)}m away)` : ''
        const name = s.name ?? 'Designated Community Shelter'

        return {
          mode: 'offline-guidance',
          severity: 'caution',
          answer: `Nearest designated shelter: ${name}${distStr}.`,
          steps: [
            `Head towards ${name}.`,
            'Take essentials: water, passport/ID, charged phone, medication.',
            'Follow routes that avoid low-lying flood-prone zones.',
            'Open the Map screen to follow direction and bearing guidance.',
          ],
          sources: [{ id: s.id, title: `Shelter: ${name}` }],
          escalate: false,
          numbers: ['112'],
        }
      }
    }

    // Try pack places
    try {
      const placesFile = await packManager.getPlaces()
      const shelters = placesFile.places.filter((p: Place) => p.type === 'shelter_candidate')
      const s = shelters[0]
      if (s) {
        const name = s.name ?? 'Designated Shelter'
        return {
          mode: 'offline-guidance',
          severity: 'caution',
          answer: `Identified shelter candidate: ${name}.`,
          steps: [
            `Proceed towards ${name}.`,
            'Take identification, medication, and charged mobile device.',
            'Open Map tab for directional assistance.',
          ],
          sources: [{ id: s.id, title: name }],
          escalate: false,
          numbers: ['112'],
        }
      }
    } catch {
      // Fall through to general guidance
    }

    return {
      mode: 'offline-guidance',
      severity: 'caution',
      answer: 'Seek higher ground immediately in a sturdy multi-story concrete building.',
      steps: [
        'Move away from beaches, riverbanks, and low-lying ground.',
        'Choose a sturdy building and remain on an upper floor (not the roof during cyclone).',
        'Check the Map tab for nearby landmarks.',
      ],
      sources: [{ id: 'find-shelter', title: 'Finding a safe shelter' }],
      escalate: false,
      numbers: ['112'],
    }
  }

  const isHospitalQuery = containsAny(norm, [
    'nearest hospital',
    'nearest doctor',
    'nearest clinic',
    'find hospital',
    'medical help',
    'ambulance',
    'hospital near me',
  ])

  if (isHospitalQuery) {
    if (ctx.nearestHospitals && ctx.nearestHospitals.length > 0) {
      const h = ctx.nearestHospitals[0]
      if (h) {
        const distStr = h.distanceMetres ? ` (~${Math.round(h.distanceMetres)}m away)` : ''
        const name = h.name ?? 'Medical Facility / Hospital'

        return {
          mode: 'offline-guidance',
          severity: 'serious',
          answer: `Nearest medical facility: ${name}${distStr}. Dial 108 for emergency ambulance dispatch.`,
          steps: [
            'Dial 108 immediately if the casualty cannot be moved safely.',
            `Proceed to ${name} if ambulatory and transport is available.`,
            'Bring identification, health insurance, and medication details.',
            'Keep the patient calm and protected from exposure.',
          ],
          sources: [{ id: h.id, title: `Hospital: ${name}` }],
          escalate: true,
          numbers: ['108', '112'],
        }
      }
    }

    return {
      mode: 'offline-guidance',
      severity: 'serious',
      answer: 'For emergency medical assistance in India, dial 108 (Ambulance) or 112 (National Emergency).',
      steps: [
        'Call 108 for medical ambulance dispatch.',
        'Provide your exact location and the casualty condition.',
        'Keep the injured person lying down and warm while awaiting help.',
      ],
      sources: [{ id: 'contacts', title: 'Emergency Contacts' }],
      escalate: true,
      numbers: ['108', '112'],
    }
  }

  // -------------------------------------------------------------------------
  // 4. Specific Life-Saving First-Aid Direct Matches
  // -------------------------------------------------------------------------
  // Snake bite
  if (containsAny(norm, ['snake bite', 'snakebite', 'bitten by snake', 'snake'])) {
    return {
      mode: 'offline-guidance',
      severity: 'serious',
      answer: 'Snake bite emergency: Keep the person completely still and calm. Movement spreads venom faster.',
      steps: [
        'Keep the bitten limb immobilized and positioned below heart level.',
        'Remove rings, watches, and tight clothing before swelling begins.',
        'DO NOT cut the wound, DO NOT suck venom, and DO NOT apply a tight tourniquet or ice.',
        'Call 108 / 112 for ambulance transport to the nearest hospital with antivenom.',
      ],
      sources: [{ id: 'snake-bite', title: 'Snake bite' }],
      escalate: true,
      numbers: ['108', '112'],
    }
  }

  // Bleeding
  if (containsAny(norm, ['bleeding', 'bleeding badly', 'blood', 'cut', 'wound', 'haemorrhage', 'hemorrhage'])) {
    return {
      mode: 'offline-guidance',
      severity: 'serious',
      answer: 'Severe bleeding: Apply direct, continuous firm pressure on the wound.',
      steps: [
        'Apply firm pressure directly on the wound with a clean cloth or your palm.',
        'Do not remove the cloth if soaked — place another cloth directly on top and keep pressing.',
        'Elevate the injured limb above heart level if no fracture is suspected.',
        'Keep the casualty warm, still, and lying down.',
        'Call 108 for emergency medical support.',
      ],
      sources: [{ id: 'bleeding-severe', title: 'Severe bleeding' }],
      escalate: true,
      numbers: ['108', '112'],
    }
  }

  // CPR / Unresponsive / Not breathing
  if (containsAny(norm, ['cpr', 'not breathing', 'unresponsive', 'cardiac arrest', 'heart attack', 'passed out and not breathing'])) {
    return {
      mode: 'offline-guidance',
      severity: 'serious',
      answer: 'Adult CPR: If the person is unresponsive and not breathing normally, begin chest compressions immediately.',
      steps: [
        'Shout for help and have someone call 108 / 112 immediately.',
        'Place both hands in the centre of the chest between the nipples.',
        'Press down firmly about 5 cm at a rate of 100-120 beats per minute (twice a second).',
        'Do not stop compressions until emergency medical personnel arrive or the person breathes normally.',
      ],
      sources: [{ id: 'cpr-adult', title: 'CPR — adult (basic)' }],
      escalate: true,
      numbers: ['108', '112'],
    }
  }

  // Drowning / Floodwater
  if (containsAny(norm, ['drowning', 'submersion', 'drowned', 'flood rescue', 'fell in water', 'pulled from water'])) {
    return {
      mode: 'offline-guidance',
      severity: 'serious',
      answer: 'Water submersion / Drowning: Reach or throw rescue equipment; do not endanger yourself in moving floodwaters.',
      steps: [
        'Once pulled to safety, check breathing immediately. If not breathing normally, begin CPR compressions.',
        'Call 108 / 112 for emergency ambulance support.',
        'If breathing, place the person on their side in the recovery position to prevent choking on fluids.',
        'Keep the person warm with dry blankets or coats.',
      ],
      sources: [{ id: 'drowning', title: 'Drowning and floodwater rescue' }],
      escalate: true,
      numbers: ['108', '112'],
    }
  }

  // Burns
  if (containsAny(norm, ['burn', 'burns', 'scald', 'fire burn', 'burned'])) {
    return {
      mode: 'offline-guidance',
      severity: 'serious',
      answer: 'Burn care: Cool the burn immediately under cool running water for at least 20 minutes.',
      steps: [
        'Cool under cool running water for 20 minutes. Do not use ice or freezing water.',
        'Remove rings, watches, and tight items before swelling starts, unless stuck to skin.',
        'Cover loosely with clean cling film or a sterile non-fluffy cloth.',
        'DO NOT burst blisters, and DO NOT apply toothpaste, butter, oil, or turmeric.',
        'Seek professional medical care at a hospital or clinic.',
      ],
      sources: [{ id: 'burns', title: 'Burns' }],
      escalate: true,
      numbers: ['108', '112'],
    }
  }

  // Choking
  if (containsAny(norm, ['choking', 'cannot breathe food', 'choke', 'food stuck in throat'])) {
    return {
      mode: 'offline-guidance',
      severity: 'serious',
      answer: 'Choking: If the person cannot speak or cough, administer back blows and abdominal thrusts.',
      steps: [
        'Encourage them to cough if they are able to cough forcefully.',
        'Give 5 firm back blows between the shoulder blades with the heel of your hand.',
        'Give 5 abdominal thrusts (Heimlich maneuver): place fist above navel, pull sharply in and up.',
        'Alternate 5 back blows and 5 abdominal thrusts.',
        'If they lose consciousness, call 108/112 and begin chest compressions (CPR).',
      ],
      sources: [{ id: 'choking', title: 'Choking' }],
      escalate: true,
      numbers: ['108', '112'],
    }
  }

  // Heatstroke / Heat exhaustion
  if (containsAny(norm, ['heatstroke', 'heat stroke', 'heat exhaustion', 'sunstroke', 'overheating'])) {
    return {
      mode: 'offline-guidance',
      severity: 'serious',
      answer: 'Heatstroke is a medical emergency: Confusion, hot dry skin, or collapse requires rapid active cooling.',
      steps: [
        'Move the person into shade or an air-conditioned room immediately.',
        'Wet the skin with cool water and fan aggressively.',
        'Apply cold packs or damp cloths to neck, armpits, and groin.',
        'Call 108 immediately for emergency medical transport.',
      ],
      sources: [{ id: 'heat-stroke', title: 'Heatstroke' }],
      escalate: true,
      numbers: ['108', '112'],
    }
  }

  // Anaphylaxis
  if (containsAny(norm, ['anaphylaxis', 'allergic reaction', 'epipen', 'severe allergy', 'throat swelling'])) {
    return {
      mode: 'offline-guidance',
      severity: 'serious',
      answer: 'Severe allergic reaction (Anaphylaxis): Administer epinephrine auto-injector immediately if available.',
      steps: [
        'Call 108 / 112 immediately — anaphylaxis can escalate within minutes.',
        'Inject auto-injector (EpiPen) into outer mid-thigh.',
        'Keep the person lying down with legs elevated, or sitting up if breathing is difficult.',
        'Stay with the casualty and monitor breathing constantly.',
      ],
      sources: [{ id: 'anaphylaxis', title: 'Severe allergic reaction (anaphylaxis)' }],
      escalate: true,
      numbers: ['108', '112'],
    }
  }

  // Electric shock
  if (containsAny(norm, ['electric shock', 'electrocution', 'live wire', 'power cable', 'power line'])) {
    return {
      mode: 'offline-guidance',
      severity: 'serious',
      answer: 'Electric shock: Do not touch the casualty while they are in contact with the electrical source.',
      steps: [
        'Switch off the main power supply immediately before approaching.',
        'If unable to switch off power, push the person away using dry, non-conductive wood or plastic.',
        'Check breathing and start CPR immediately if unresponsive.',
        'Call 108 / 112 for urgent emergency transport.',
      ],
      sources: [{ id: 'electric-shock', title: 'Electric shock' }],
      escalate: true,
      numbers: ['108', '112'],
    }
  }

  // -------------------------------------------------------------------------
  // 5. Phrasebook / Translation intent
  // -------------------------------------------------------------------------
  if (containsAny(norm, ['phrase', 'phrasebook', 'how to say', 'tamil translation', 'show a local', 'tamil phrase'])) {
    return {
      mode: 'offline-guidance',
      severity: 'info',
      answer: 'Essential emergency phrases in Tamil for local assistance:',
      steps: [
        'I need help: எனக்கு உதவி வேண்டும் (Enakku udhavi vendum)',
        'Where is the hospital?: மருத்துவமனை எங்கே? (Maruthuvamanai engae?)',
        'Call an ambulance: ஆம்புலன்ஸ் அழையுங்கள் (Ambulance azhaiyungal)',
        'Where is the shelter?: தங்குமிடம் எங்கே? (Thangumidam engae?)',
        'I do not speak Tamil: எனக்கு தமிழ் தெரியாது (Enakku Tamil theriyaathu)',
      ],
      sources: [{ id: 'phrases', title: 'Emergency Tamil Phrasebook' }],
      escalate: false,
      numbers: ['112'],
    }
  }

  // No deterministic match found -> proceed to search / LLM
  return null
}
