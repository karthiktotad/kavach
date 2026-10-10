/**
 * Assistant Screen (/assist) — FE-6 UI.
 *
 * Requirements:
 *  - Header with mode badge: "Online AI" | "Offline guidance · from saved safety data" | "On-device AI".
 *  - Serious-case strip with "Call 112", visible whenever severity is serious.
 *  - Messages: User bubble (ink, right); Assistant card with SeverityPill, StepList, SourceChip "Based on: <title>", Read aloud.
 *  - Quick-reply chips: "Is it safe here?", "Nearest shelter", "I need a doctor", "First aid".
 *  - Labelled input, mic (Web Speech if supported, hidden otherwise), send button.
 *  - Disclaimer: "General guidance, not a substitute for professional care."
 *  - Local history (last 20) with clear button.
 *  - Loading: "Checking saved safety data…".
 *  - API failure notice: "AI unavailable, showing saved guidance".
 */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Button,
  Card,
  Icon,
  PhoneShell,
  SeverityPill,
  SourceChip,
  StepList,
} from '../components/ui'
import { useLanguage } from '../store/language'
import { useConnectivity } from '../lib/connectivity'
import {
  assistant,
  buildAssistantContext,
  type Answer,
  type AnswerSeverity,
  type Mode,
} from '../lib/assistant'
import { packManager } from '../lib/pack'
import type { Place } from '../lib/packTypes'
import type { RiskLevel } from '../components/ui/risk'

function severityToRiskLevel(severity?: AnswerSeverity): RiskLevel {
  switch (severity) {
    case 'serious':
      return 4
    case 'caution':
      return 1
    case 'info':
    default:
      return 0
  }
}

export interface ChatMessage {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly text: string
  readonly answer?: Answer
  readonly timestamp: number
  readonly isFallback?: boolean
}

const STORAGE_KEY = 'kavach_assistant_chat_history'

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ChatMessage[]
    return Array.isArray(parsed) ? parsed.slice(-20) : []
  } catch {
    return []
  }
}

function saveHistory(history: readonly ChatMessage[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-20)))
  } catch {
    // Storage quota or private mode
  }
}

function checkSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition,
  )
}

let messageCounter = 0
function generateMessageId(prefix: string): string {
  messageCounter += 1
  return `${prefix}-${Date.now()}-${messageCounter}`
}

function getTimestamp(): number {
  return Date.now()
}

export default function AssistPage() {
  const { t, locale } = useLanguage()
  const { level: connectivityLevel } = useConnectivity()

  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory())
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [hasSpeechRecognition] = useState(() => checkSpeechRecognitionSupported())
  const [places, setPlaces] = useState<readonly Place[]>([])

  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Current active assistant mode
  const [activeMode, setActiveMode] = useState<Mode>(() => {
    return connectivityLevel === 'live' || connectivityLevel === 'degraded'
      ? 'online-ai'
      : 'offline-guidance'
  })

  // Load places for context
  useEffect(() => {
    let mounted = true
    void packManager
      .getPlaces()
      .then((file) => {
        if (mounted) setPlaces(file.places)
      })
      .catch(() => undefined)
    return () => {
      mounted = false
    }
  }, [])

  // Auto scroll to bottom of messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView?.({ behavior: 'smooth' })
    saveHistory(messages)
  }, [messages])

  // Track if any serious message is in current conversation
  const hasSeriousMessage = messages.some(
    (m) => m.role === 'assistant' && m.answer?.severity === 'serious',
  )

  const handleSend = async (queryToSend?: string) => {
    const text = (queryToSend ?? inputText).trim()
    if (!text || loading) return

    setInputText('')

    const now = getTimestamp()
    const userMessage: ChatMessage = {
      id: generateMessageId('user'),
      role: 'user',
      text,
      timestamp: now,
    }

    setMessages((prev) => [...prev.slice(-19), userMessage])
    setLoading(true)

    try {
      // Build context
      const shelters = places.filter((p) => p.type === 'shelter_candidate')
      const hospitals = places.filter((p) => p.type === 'hospital' || p.type === 'clinic')

      const mappedConnectivity =
        connectivityLevel === 'cellular' ? 'cellular-only' : connectivityLevel

      const ctx = buildAssistantContext({
        language: locale,
        connectivity: mappedConnectivity,
        nearestShelters: shelters.slice(0, 3),
        nearestHospitals: hospitals.slice(0, 3),
      })

      const answer = await assistant.ask(text, ctx)
      setActiveMode(answer.mode)

      const isFallback =
        (connectivityLevel === 'live' || connectivityLevel === 'degraded') &&
        answer.mode === 'offline-guidance'

      const assistantMessage: ChatMessage = {
        id: generateMessageId('assist'),
        role: 'assistant',
        text: answer.answer,
        answer,
        timestamp: getTimestamp(),
        isFallback,
      }

      setMessages((prev) => [...prev.slice(-19), assistantMessage])
    } catch {
      const errorMsg: ChatMessage = {
        id: generateMessageId('assist-err'),
        role: 'assistant',
        text: t('ui.error'),
        timestamp: getTimestamp(),
      }
      setMessages((prev) => [...prev.slice(-19), errorMsg])
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    void handleSend()
  }

  const handleClearHistory = () => {
    setMessages([])
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setSpeakingId(null)
  }

  const handleVoiceInput = () => {
    if (typeof window === 'undefined') return
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionInstance })
        .webkitSpeechRecognition

    if (!SpeechRec) return

    try {
      const recognition = new SpeechRec()
      recognition.lang = locale === 'ta' ? 'ta-IN' : locale === 'hi' ? 'hi-IN' : 'en-IN'
      recognition.interimResults = false
      recognition.maxAlternatives = 1

      setIsListening(true)

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results?.[0]?.[0]?.transcript
        if (transcript) {
          setInputText(transcript)
          void handleSend(transcript)
        }
        setIsListening(false)
      }

      recognition.onerror = () => {
        setIsListening(false)
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognition.start()
    } catch {
      setIsListening(false)
    }
  }

  const handleReadAloud = (id: string, textToSpeak: string, steps?: readonly string[]) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

    if (speakingId === id) {
      window.speechSynthesis.cancel()
      setSpeakingId(null)
      return
    }

    window.speechSynthesis.cancel()
    const fullText = steps && steps.length > 0 ? `${textToSpeak}. ${steps.join('. ')}` : textToSpeak

    const utterance = new SpeechSynthesisUtterance(fullText)
    utterance.lang = locale
    utterance.onend = () => setSpeakingId(null)
    utterance.onerror = () => setSpeakingId(null)

    setSpeakingId(id)
    window.speechSynthesis.speak(utterance)
  }

  const quickReplies = [
    { label: t('assist.quick.safe'), query: 'Is it safe in this area?' },
    { label: t('assist.quick.shelter'), query: 'Where is the nearest shelter?' },
    { label: t('assist.quick.doctor'), query: 'Where is the nearest hospital or doctor?' },
    { label: t('assist.quick.firstaid'), query: 'Emergency first aid guidance' },
  ]

  return (
    <PhoneShell>
      <main className="flex flex-col min-h-[calc(100dvh-var(--nav-height)-70px)] pb-4">
        {/* Header with Mode Badge */}
        <div className="bg-surface border-line sticky top-14 z-10 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 shadow-xs">
          <div className="flex items-center gap-2">
            <Icon name="bubbles" className="text-verified h-5 w-5" />
            <h1 className="text-ink text-base font-extrabold">{t('page.assist.title')}</h1>
          </div>

          {/* Mode Badge */}
          <div
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${
              activeMode === 'online-ai'
                ? 'bg-live-tint text-live-text ring-live/30'
                : activeMode === 'on-device-ai'
                  ? 'bg-indigo-50 text-indigo-900 ring-indigo-300'
                  : 'bg-surface-sunken text-ink-muted ring-line'
            }`}
            data-testid="assistant-mode-badge"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                activeMode === 'online-ai'
                  ? 'bg-live'
                  : activeMode === 'on-device-ai'
                    ? 'bg-indigo-600'
                    : 'bg-offline'
              }`}
            />
            <span>
              {activeMode === 'online-ai'
                ? t('assist.mode.online')
                : activeMode === 'on-device-ai'
                  ? t('assist.mode.ondevice')
                  : t('assist.mode.offline')}
            </span>
          </div>
        </div>

        {/* Serious Case Strip (visible whenever any serious response is present) */}
        {hasSeriousMessage && (
          <div
            className="bg-danger text-white sticky top-24 z-10 flex items-center justify-between gap-2 px-4 py-2.5 shadow-md"
            role="alert"
            aria-live="assertive"
          >
            <div className="flex items-center gap-2 text-sm font-bold">
              <Icon name="warning" className="h-5 w-5 shrink-0" />
              <span>{t('assist.serious.strip')}</span>
            </div>
            <Button
              variant="danger"
              size="md"
              href="tel:112"
              aria-label="Call emergency 112"
              className="bg-white text-danger border-white font-black hover:bg-neutral-100"
            >
              <Icon name="phone" className="h-4 w-4" />
              <span>112</span>
            </Button>
          </div>
        )}

        {/* Message Thread */}
        <div className="flex-1 space-y-4 px-4 py-4" aria-live="polite">
          {messages.length === 0 && (
            <div className="space-y-4 py-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-verified-tint text-verified">
                <Icon name="bubbles" className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-ink text-base font-bold">{t('assist.emptyTitle')}</h2>
                <p className="text-ink-muted mx-auto max-w-xs text-sm">
                  {t('assist.emptyBody')}
                </p>
              </div>

              {/* Quick Reply Chips */}
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {quickReplies.map((q) => (
                  <button
                    key={q.query}
                    type="button"
                    onClick={() => void handleSend(q.query)}
                    className="touch-target bg-surface border-line text-ink hover:bg-surface-sunken inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors"
                  >
                    <span>{q.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => {
            if (m.role === 'user') {
              return (
                <div key={m.id} className="flex justify-end">
                  <div className="bg-ink text-surface max-w-[85%] rounded-2xl rounded-tr-xs px-4 py-2.5 text-sm font-medium shadow-xs">
                    {m.text}
                  </div>
                </div>
              )
            }

            // Assistant Card
            const answer = m.answer
            return (
              <div key={m.id} className="flex justify-start">
                <Card className="max-w-[95%] space-y-3 p-4 shadow-sm border-line">
                  {/* Status header & Severity */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {answer?.severity && (
                      <SeverityPill level={severityToRiskLevel(answer.severity)} />
                    )}

                    <div className="flex items-center gap-1.5 ms-auto">
                      {/* Read Aloud Button */}
                      <button
                        type="button"
                        onClick={() => handleReadAloud(m.id, m.text, answer?.steps)}
                        aria-label={speakingId === m.id ? t('assist.speaking') : t('assist.readAloud')}
                        className={`touch-target inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${
                          speakingId === m.id
                            ? 'bg-verified text-white'
                            : 'bg-surface-sunken text-ink-muted hover:text-ink'
                        }`}
                      >
                        <Icon name="speaker" className="h-3.5 w-3.5" />
                        <span>{speakingId === m.id ? t('assist.speaking') : t('assist.readAloud')}</span>
                      </button>
                    </div>
                  </div>

                  {/* Fallback note if AI proxy was unreachable */}
                  {m.isFallback && (
                    <div className="bg-amber-50 text-amber-900 border-amber-200 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold">
                      <Icon name="info" className="h-3.5 w-3.5 shrink-0" />
                      <span>{t('assist.fallbackNote')}</span>
                    </div>
                  )}

                  {/* Plain Language Summary */}
                  <p className="text-ink text-[15px] font-medium leading-relaxed">
                    {m.text}
                  </p>

                  {/* Step List (max 5 actions) */}
                  {answer?.steps && answer.steps.length > 0 && (
                    <div className="pt-1">
                      <StepList steps={answer.steps} />
                    </div>
                  )}

                  {/* Emergency Numbers Actions */}
                  {answer?.numbers && answer.numbers.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2 border-line border-t">
                      {answer.numbers.map((num) => (
                        <Button
                          key={num}
                          variant={num === '112' || num === '108' ? 'danger' : 'secondary'}
                          size="md"
                          href={`tel:${num}`}
                          aria-label={`Call emergency number ${num}`}
                          className="font-black"
                        >
                          <Icon name="phone" className="h-4 w-4" />
                          <span>Call {num}</span>
                        </Button>
                      ))}
                    </div>
                  )}

                  {/* Source Provenance */}
                  {answer?.sources && answer.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {answer.sources.map((s) => (
                        <SourceChip key={s.id} source={s.title} />
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            )
          })}

          {/* Loading Indicator */}
          {loading && (
            <div className="flex justify-start" role="status" aria-live="polite">
              <Card className="inline-flex items-center gap-2 px-4 py-3 border-line">
                <span className="border-verified h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
                <span className="text-ink-muted text-xs font-semibold">
                  {t('assist.loading')}
                </span>
              </Card>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* History Clear Option (when messages exist) */}
        {messages.length > 0 && (
          <div className="flex justify-center px-4 pb-2">
            <button
              type="button"
              onClick={handleClearHistory}
              className="text-ink-muted hover:text-danger text-xs font-semibold underline underline-offset-2 transition-colors"
            >
              {t('assist.clearHistory')}
            </button>
          </div>
        )}

        {/* Bottom Input Area */}
        <div className="bg-surface border-line sticky bottom-0 z-20 border-t p-3 shadow-md">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={isListening ? t('assist.mic.listening') : t('assist.input.placeholder')}
              aria-label={t('assist.input.label')}
              disabled={loading}
              className="bg-surface-sunken border-line text-ink placeholder:text-ink-muted/60 focus:ring-verified min-h-[48px] flex-1 rounded-full border px-4 py-2.5 text-sm font-medium focus:ring-2 focus:outline-none"
            />

            {/* Mic button (shown only if Web Speech recognition supported) */}
            {hasSpeechRecognition && (
              <button
                type="button"
                onClick={handleVoiceInput}
                aria-label={isListening ? t('assist.mic.listening') : t('assist.mic.start')}
                className={`touch-target flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors ${
                  isListening
                    ? 'bg-danger text-white animate-pulse'
                    : 'bg-surface-raised border-line text-ink hover:bg-surface-sunken border'
                }`}
              >
                <Icon name="mic" className="h-5 w-5" />
              </button>
            )}

            {/* Send Button */}
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={!inputText.trim() || loading}
              aria-label={t('assist.send')}
              className="!h-12 !w-12 !min-h-[48px] !min-w-[48px] !p-0 rounded-full shrink-0"
            >
              <Icon name="send" className="h-5 w-5" />
            </Button>
          </form>

          {/* Medical & Safety Disclaimer */}
          <p className="text-ink-muted/70 text-center pt-2 text-[11px] leading-tight">
            {t('assist.disclaimer')}
          </p>
        </div>
      </main>
    </PhoneShell>
  )
}

// TypeScript speech recognition definitions
interface SpeechRecognitionInstance {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionEvent {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string
      }
    }
  }
}
