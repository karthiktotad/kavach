import { describe, expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../../tests/setup'
import { renderUi } from '../../../tests/render-ui'
import { RiskMeter } from './RiskMeter'
import { RISK_LEVELS } from './risk'

describe('RiskMeter', () => {
  it.each(RISK_LEVELS)('shows a text label at level %s', async (level) => {
    const { container } = renderUi(<RiskMeter level={level} />)
    expect(container.querySelectorAll('[aria-hidden="true"] > span')).toHaveLength(4)
    expect(container.textContent?.length).toBeGreaterThan(0)
    await expectNoAxeViolations(container)
  })

  it('hatches unverified bars instead of filling them', () => {
    const { container } = renderUi(<RiskMeter level={3} verified={false} />)
    expect(container.querySelector('.bg-hatch')).not.toBeNull()
  })
})
