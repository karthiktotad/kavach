import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../../tests/setup'
import { renderUi } from '../../../tests/render-ui'
import { StatusChip, type StatusLevel } from './StatusChip'

const LEVELS: StatusLevel[] = ['live', 'degraded', 'cellular', 'offline', 'relay']

describe('StatusChip', () => {
  it.each(LEVELS)('shows icon + text for %s and has no axe violations', async (level) => {
    const { container } = renderUi(<StatusChip level={level} />)
    expect(screen.getByRole('button', { name: /connection status/i })).toBeTruthy()
    expect(container.querySelector('svg')).not.toBeNull()
    await expectNoAxeViolations(container)
  })

  it('opens a sheet that explains what still works', async () => {
    const user = userEvent.setup()
    renderUi(<StatusChip level="offline" />)
    await user.click(screen.getByRole('button', { name: /connection status/i }))
    expect(screen.getByRole('dialog', { name: /what this connection can do/i })).toBeTruthy()
    await expectNoAxeViolations(screen.getByRole('dialog'))
  })

  it('renders the age next to the label when given', () => {
    renderUi(<StatusChip level="degraded" age="last updated 12 min ago" />)
    expect(screen.getByRole('button').textContent).toMatch(/12 min/)
  })
})
