/**
 * Offline Guidance Provider (Tier 2).
 *
 * Uses MiniSearch (BM25) over the preloaded content pack KB chunks,
 * decision trees, alert templates, and phrasebook.
 * Always available on-device with zero network requests.
 */
import MiniSearch from 'minisearch'
import { packManager } from '../pack'
import type { KbFile } from '../packTypes'
import { sanitizeAllowedNumbers } from './router'
import type { Answer, AnswerSeverity, AssistantContext, AssistantProvider, SourceRef } from './types'

interface SearchDoc {
  readonly id: string
  readonly type: 'chunk' | 'tree'
  readonly title: string
  readonly text: string
  readonly tags: string
  readonly steps: readonly string[]
  readonly severity: 'critical' | 'urgent' | 'routine'
  readonly escalate: boolean
  readonly source: string
}

const indexCache = new Map<string, { miniSearch: MiniSearch<SearchDoc>; docs: Map<string, SearchDoc> }>()

/** Build or retrieve a cached MiniSearch index for a locale. */
export async function getOrBuildIndex(locale = 'en'): Promise<{
  miniSearch: MiniSearch<SearchDoc>
  docs: Map<string, SearchDoc>
}> {
  const cached = indexCache.get(locale)
  if (cached) return cached

  let kb: KbFile
  try {
    kb = await packManager.getKb(locale)
  } catch {
    try {
      kb = await packManager.getKb('en')
    } catch {
      kb = {
        _meta: { packVersion: '0.2.0', builtAt: '', machineTranslated: false, reviewed: false },
        locale: 'en',
        chunks: [],
        trees: [],
      }
    }
  }

  const docsMap = new Map<string, SearchDoc>()
  const docs: SearchDoc[] = []

  for (const chunk of kb.chunks) {
    const doc: SearchDoc = {
      id: chunk.id,
      type: 'chunk',
      title: chunk.title,
      text: `${chunk.title} ${(chunk.steps || []).join(' ')}`,
      tags: (chunk.tags || []).join(' '),
      steps: chunk.steps || [],
      severity: chunk.severity || 'routine',
      escalate: chunk.escalate ?? false,
      source: chunk.source || 'Offline Safety Knowledge Base',
    }
    docsMap.set(chunk.id, doc)
    docs.push(doc)
  }

  for (const tree of kb.trees) {
    const doc: SearchDoc = {
      id: tree.id,
      type: 'tree',
      title: tree.question,
      text: `${tree.question} ${(tree.terminalSteps || []).join(' ')} ${tree.options?.map((o) => o.label).join(' ') || ''}`,
      tags: tree.question.toLowerCase(),
      steps: tree.terminalSteps || tree.options?.map((o) => `• ${o.label}`) || [],
      severity: tree.terminalEscalates ? 'critical' : 'urgent',
      escalate: tree.terminalEscalates ?? false,
      source: 'First Aid Decision Tree',
    }
    docsMap.set(tree.id, doc)
    docs.push(doc)
  }

  const miniSearch = new MiniSearch<SearchDoc>({
    fields: ['title', 'tags', 'text'],
    storeFields: ['id', 'type', 'title', 'severity', 'escalate', 'source'],
    searchOptions: {
      boost: { title: 3, tags: 2, text: 1 },
      fuzzy: 0.2,
      prefix: true,
    },
  })

  miniSearch.addAll(docs)

  const result = { miniSearch, docs: docsMap }
  indexCache.set(locale, result)
  return result
}

/** Clear the search index cache (useful for testing or pack reload). */
export function clearIndexCache(): void {
  indexCache.clear()
}

/**
 * Perform a top-k search over the offline knowledge base.
 */
export async function searchKb(
  query: string,
  locale = 'en',
  topK = 3,
): Promise<{ id: string; score: number; doc: SearchDoc }[]> {
  const { miniSearch, docs } = await getOrBuildIndex(locale)
  if (miniSearch.documentCount === 0) return []

  const results = miniSearch.search(query)
  const topResults = results.slice(0, topK)

  return topResults
    .map((r) => {
      const docId = String(r.id)
      const doc = docs.get(docId)
      if (!doc) return null
      return { id: docId, score: r.score, doc }
    })
    .filter((r): r is { id: string; score: number; doc: SearchDoc } => r !== null)
}

function mapSeverity(kbSeverity: 'critical' | 'urgent' | 'routine'): AnswerSeverity {
  switch (kbSeverity) {
    case 'critical':
      return 'serious'
    case 'urgent':
      return 'caution'
    case 'routine':
    default:
      return 'info'
  }
}

export class OfflineAssistantProvider implements AssistantProvider {
  readonly id = 'offline-guidance'

  available(_ctx: AssistantContext): Promise<boolean> {
    return Promise.resolve(true)
  }

  async ask(q: string, ctx: AssistantContext, _signal?: AbortSignal): Promise<Answer> {
    const locale = ctx.language || 'en'
    const searchResults = await searchKb(q, locale, 3)

    let contacts = null
    try {
      contacts = await packManager.getContacts()
    } catch {
      // Fallback contacts
    }

    const firstResult = searchResults[0]
    if (firstResult) {
      const best = firstResult.doc
      const sources: SourceRef[] = searchResults.map((s) => ({
        id: s.doc.id,
        title: s.doc.title,
      }))

      const steps = best.steps.slice(0, 5)
      const allowedNumbers = best.escalate ? ['108', '112'] : ['112']

      return {
        mode: 'offline-guidance',
        severity: mapSeverity(best.severity),
        answer: `${best.title}: ${steps[0] ?? 'Follow the safety instructions below.'}`,
        steps,
        sources,
        escalate: best.escalate,
        numbers: sanitizeAllowedNumbers(allowedNumbers, contacts),
      }
    }

    // Default general safety fallback when nothing in KB matched
    return {
      mode: 'offline-guidance',
      severity: 'info',
      answer:
        'No direct matches found in offline guidance. For general emergency assistance, follow official local directives or contact emergency services.',
      steps: [
        'Stay on high ground and avoid floodwaters or downed power lines.',
        'Keep emergency numbers (112, 108) ready on your phone.',
        'Check the Map tab for designated shelters and hospitals.',
      ],
      sources: [{ id: 'general-safety', title: 'General Emergency Preparedness' }],
      escalate: false,
      numbers: sanitizeAllowedNumbers(['112'], contacts),
    }
  }
}

export const offlineProvider = new OfflineAssistantProvider()
