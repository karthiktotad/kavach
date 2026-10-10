import { describe, expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../../tests/setup'
import { renderUi } from '../../../tests/render-ui'
import { Card } from './Card'

describe('Card', () => {
  it('renders a surface with the spec radius', async () => {
    const { container } = renderUi(
      <Card>
        <p>Inside</p>
      </Card>,
    )
    expect(container.firstElementChild?.className).toContain('rounded-16')
    expect(container.textContent).toBe('Inside')
    await expectNoAxeViolations(container)
  })
})
