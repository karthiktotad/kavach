import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../../tests/setup'
import { renderUi } from '../../../tests/render-ui'
import { DrillBanner } from './DrillBanner'

describe('DrillBanner', () => {
  it('announces drill with icon + orange treatment', async () => {
    const { container } = renderUi(<DrillBanner />)
    expect(screen.getByRole('status').textContent).toMatch(/drill/i)
    expect(screen.getByRole('status').className).toContain('bg-drill-tint')
    expect(container.querySelector('svg')).not.toBeNull()
    await expectNoAxeViolations(container)
  })
})
