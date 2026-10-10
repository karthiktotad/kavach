import { describe, expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../../tests/setup'
import { renderUi } from '../../../tests/render-ui'
import { SeverityPill } from './SeverityPill'
import { RISK_LEVELS } from './risk'

describe('SeverityPill', () => {
  it.each(RISK_LEVELS)('renders level %s as a labelled pill', async (level) => {
    const { container } = renderUi(<SeverityPill level={level} />)
    expect(container.firstElementChild?.className).toContain('rounded-full')
    expect(container.textContent?.length).toBeGreaterThan(0)
    await expectNoAxeViolations(container)
  })
})
