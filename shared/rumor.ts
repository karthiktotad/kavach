export type RumorVerdict = 'official' | 'conflicts' | 'unconfirmed'
export type EvidenceStatus = 'dash' | 'info' | 'check'

export interface RumorEvidence {
  signature: EvidenceStatus
  officialAlerts: EvidenceStatus
  weatherData: EvidenceStatus
  nearbyReports: EvidenceStatus
}

export interface RumorAnalysis {
  verdict: RumorVerdict
  claim: string
  action: string
  place: string
  source: string
  claimType: string
  keywords: string[]
  translation: string
  risk: number
  note: string
  detectedScript: 'ta' | 'hi' | 'ar' | 'en'
  evidence: RumorEvidence
}

const PROMPT_INJECTION = /ignore previous instructions|system prompt|act as|you are|do not reveal|forget all prior|pretend/i
const OFFICIAL_WORDS = ['official', 'warning', 'authority', 'gov', 'government', 'imd', 'district', 'police', 'evacuation']
const HAZARD_WORDS = ['flood', 'storm', 'cyclone', 'rain', 'water', 'wind', 'warning', 'evacuate', 'landslide', 'flash flood', 'surge', 'tsunami']
const ACTION_WORDS = ['evacuate', 'move', 'avoid', 'shelter', 'stay', 'call', 'seek', 'leave', 'wait']
const PLACE_HINTS = ['beach', 'road', 'station', 'market', 'bridge', 'temple', 'school', 'harbor', 'marina', 'junction', 'district']
const STOP_WORDS = new Set([
  'about', 'after', 'again', 'against', 'around', 'before', 'being', 'below', 'between', 'could', 'doing', 'down', 'during', 'each', 'every', 'false', 'from', 'have', 'into', 'just', 'like', 'many', 'most', 'need', 'over', 'same', 'some', 'than', 'that', 'them', 'there', 'these', 'they', 'this', 'those', 'through', 'under', 'very', 'with', 'your', 'yourself', 'there', 'their', 'where', 'when', 'what', 'which', 'while', 'will', 'would', 'know', 'make', 'take', 'show', 'there', 'more', 'other', 'still', 'only', 'because', 'been', 'were', 'warn', 'warning'
])

function normalizeInput(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
}

function stripPromptInjection(value: string): string {
  return normalizeInput(value).replace(PROMPT_INJECTION, ' ')
}

function detectScript(text: string): 'ta' | 'hi' | 'ar' | 'en' {
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta'
  if (/[\u0900-\u097F]/.test(text)) return 'hi'
  if (/[\u0600-\u06FF]/.test(text)) return 'ar'
  return 'en'
}

function extractKeywords(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 3 && !STOP_WORDS.has(token))

  const seen = new Set<string>()
  const keywords: string[] = []

  for (const token of tokens) {
    if (!seen.has(token)) {
      seen.add(token)
      keywords.push(token)
    }
    if (keywords.length >= 8) break
  }

  return keywords
}

function pickClaim(text: string): string {
  const match = HAZARD_WORDS.find((word) => text.includes(word))
  if (match) return match
  return text.split(/\s+/).slice(0, 4).join(' ') || 'warning'
}

function pickAction(text: string): string {
  const match = ACTION_WORDS.find((word) => text.includes(word))
  if (match) return match
  return 'check official updates'
}

function pickPlace(text: string): string {
  const match = PLACE_HINTS.find((word) => text.includes(word))
  if (match) return match
  const words = text.split(/\s+/).filter((word) => word.length > 3)
  return words.slice(0, 4).join(' ') || 'local area'
}

export function parseSharedText(input: string): string {
  const value = (input ?? '').trim()
  if (!value) return ''

  try {
    const url = new URL(value)
    const params = url.searchParams
    const textParam = params.get('text')
    if (textParam) return normalizeInput(decodeURIComponent(textParam))
    const titleParam = params.get('title')
    if (titleParam) return normalizeInput(decodeURIComponent(titleParam))
  } catch {
    // Ignore malformed URLs and fall back to the raw value.
  }

  try {
    const params = new URLSearchParams(value)
    const textParam = params.get('text')
    if (textParam) return normalizeInput(decodeURIComponent(textParam))
    const titleParam = params.get('title')
    if (titleParam) return normalizeInput(decodeURIComponent(titleParam))
  } catch {
    // Ignore malformed query strings.
  }

  const lower = value.toLowerCase()
  if (lower.includes('text=')) {
    const match = value.match(/[?&]text=([^&]+)/i)
    if (match?.[1]) return normalizeInput(decodeURIComponent(match[1].replace(/\+/g, ' ')))
  }
  if (lower.includes('title=')) {
    const match = value.match(/[?&]title=([^&]+)/i)
    if (match?.[1]) return normalizeInput(decodeURIComponent(match[1].replace(/\+/g, ' ')))
  }

  return normalizeInput(value)
}

export function analyzeRumor(rawText: string): RumorAnalysis {
  const sourceText = stripPromptInjection(rawText ?? '')
  const normalized = normalizeInput(sourceText)

  if (!normalized) {
    const empty: RumorAnalysis = {
      verdict: 'unconfirmed',
      claim: 'No claim found',
      action: 'check official updates',
      place: 'local area',
      source: 'unknown',
      claimType: 'unknown',
      keywords: [],
      translation: typeof navigator !== 'undefined' && navigator.onLine ? 'Machine translated preview (stub)' : 'Offline: key words only',
      risk: 0,
      note: 'Not enough text to verify. Treat it as unconfirmed until a trusted source confirms it.',
      detectedScript: 'en',
      evidence: {
        signature: 'dash',
        officialAlerts: 'dash',
        weatherData: 'dash',
        nearbyReports: 'dash',
      },
    }
    return empty
  }

  const lower = normalized.toLowerCase()
  const keywords = extractKeywords(lower)
  const claim = pickClaim(lower)
  const action = pickAction(lower)
  const place = pickPlace(lower)
  const hasOfficialMarker = OFFICIAL_WORDS.some((entry) => lower.includes(entry))
  const hasHazardMarker = HAZARD_WORDS.some((entry) => lower.includes(entry))
  const hasConflictMarker = /(fake|hoax|rumour|rumor|not true|not official|false|misinformation|unverified)/i.test(lower)

  let verdict: RumorVerdict = 'unconfirmed'
  let risk = 1
  let source = 'unknown'
  let note = 'The wording is vague or not tied to a trusted source. Treat it as unconfirmed.'

  if (hasOfficialMarker && !/not official|not a warning|fake|hoax|misinformation|rumor|rumour/i.test(lower) && hasHazardMarker) {
    verdict = 'official'
    source = 'official'
    risk = 4
    note = 'Official wording is present, but still check the local authority alert and your own map.'
  } else if (hasConflictMarker && !hasOfficialMarker) {
    verdict = 'unconfirmed'
    source = 'community'
    risk = 2
    note = 'The message contradicts trusted channels or is described as doubtful. It is not confirmed.'
  } else if (hasHazardMarker) {
    verdict = 'unconfirmed'
    source = 'community'
    risk = 2
    note = 'A hazard is mentioned, but there is no verified source in the text itself.'
  }

  const evidence: RumorEvidence = {
    signature: hasOfficialMarker ? 'check' : 'dash',
    officialAlerts: verdict === 'official' ? 'check' : hasHazardMarker ? 'info' : 'dash',
    weatherData: hasHazardMarker ? 'info' : 'dash',
    nearbyReports: place !== 'local area' ? 'info' : 'dash',
  }

  return {
    verdict,
    claim,
    action,
    place,
    source,
    claimType: claim,
    keywords,
    translation: typeof navigator !== 'undefined' && navigator.onLine ? 'Machine translated preview (stub)' : 'Offline: key words only',
    risk,
    note,
    detectedScript: detectScript(normalized),
    evidence,
  }
}
