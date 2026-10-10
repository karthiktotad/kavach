/**
 * Global ErrorBoundary.
 *
 * A crash in a crisis app is the worst possible failure: the user is in danger
 * and the app they trusted is a white screen. So:
 *  - we show them what still works (the offline pack, one-tap SOS) rather than
 *    an apology;
 *  - we never auto-reload, because that loses whatever they were reading;
 *  - the alert routes stay reachable, since they are plain hash routes.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { IconAlerts, IconAid } from './icons'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  /** Component stack, shown in development only. */
  details: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, details: null }

  static getDerivedStateFromError(error: Error): State {
    return { error, details: null }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Local only — nothing is shipped anywhere (telemetry is a later milestone).
    console.error('[kavach] uncaught error', error, info.componentStack)
    this.setState({ details: info.componentStack ?? null })
  }

  private readonly retry = () => this.setState({ error: null, details: null })

  override render(): ReactNode {
    const { error, details } = this.state
    if (!error) return this.props.children

    return (
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-10">
        <div className="bg-surface ring-ink-subtle/25 rounded-2xl p-5 ring-1">
          <h1 className="text-ink text-xl font-bold">Something went wrong on this screen</h1>
          <p className="text-ink-muted mt-2 text-sm leading-relaxed">
            Kavach could not draw this page. Your saved alerts, shelters and first-aid guide are
            still on this device and still work.
          </p>

          <button
            type="button"
            onClick={this.retry}
            className="touch-target bg-brand text-surface-sunken mt-4 rounded-xl px-5 font-semibold"
          >
            Try again
          </button>
        </div>

        {/* The two things that matter most must always remain reachable. */}
        <div className="flex flex-col gap-3">
          <a
            href="#/alerts"
            className="touch-target bg-surface ring-ink-subtle/25 justify-start rounded-2xl px-5 ring-1"
          >
            <IconAlerts className="text-brand size-6" />
            <span className="text-ink font-semibold">Saved alerts</span>
          </a>
          <a
            href="#/aid"
            className="touch-target bg-surface ring-ink-subtle/25 justify-start rounded-2xl px-5 ring-1"
          >
            <IconAid className="text-risk-3 size-6" />
            <span className="text-ink font-semibold">First aid &amp; SOS</span>
          </a>
        </div>

        {import.meta.env.DEV && details ? (
          <details className="bg-surface-sunken text-ink-subtle rounded-xl p-3 text-xs">
            <summary className="cursor-pointer font-semibold">Developer detail</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{details}</pre>
          </details>
        ) : null}
      </div>
    )
  }
}
