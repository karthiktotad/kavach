/**
 * Global ErrorBoundary.
 *
 * A crash in a crisis app is the worst possible failure: the user is in danger
 * and the app they trusted is a white screen. So:
 *  - we show them what still works (the offline pack, one-tap SOS);
 *  - we never auto-reload, because that loses whatever they were reading;
 *  - the alert routes stay reachable, since they are plain hash routes.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorFallback } from './ui/ErrorFallback'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  details: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, details: null }

  static getDerivedStateFromError(error: Error): State {
    return { error, details: null }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[kavach] uncaught error', error, info.componentStack)
    this.setState({ details: info.componentStack ?? null })
  }

  private readonly retry = () => this.setState({ error: null, details: null })

  override render(): ReactNode {
    const { error, details } = this.state
    if (!error) return this.props.children
    return <ErrorFallback onRetry={this.retry} details={details} />
  }
}
