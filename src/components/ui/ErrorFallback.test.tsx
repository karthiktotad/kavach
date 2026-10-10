import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../../tests/setup'
import { renderUi } from '../../../tests/render-ui'
import { ErrorFallback } from './ErrorFallback'

describe('ErrorFallback', () => {
  it('keeps alerts and SOS reachable after a crash', async () => {
    const onRetry = vi.fn()
    const { container } = renderUi(<ErrorFallback onRetry={onRetry} />)
    expect(screen.getByRole('link', { name: /saved alerts/i })).toHaveAttribute('href', '#/alerts')
    expect(screen.getByRole('link', { name: /first aid/i })).toHaveAttribute('href', '#/aid')
    await userEvent.setup().click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    await expectNoAxeViolations(container)
  })
})
