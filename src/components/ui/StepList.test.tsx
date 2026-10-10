import { describe, expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../../tests/setup'
import { renderUi } from '../../../tests/render-ui'
import { StepList } from './StepList'

describe('StepList', () => {
  it('numbers each step', async () => {
    const { container } = renderUi(<StepList steps={['Stay high', 'Call 112']} />)
    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(2)
    expect(items[0]?.textContent).toMatch(/1/)
    expect(items[0]?.textContent).toMatch(/Stay high/)
    await expectNoAxeViolations(container)
  })
})
