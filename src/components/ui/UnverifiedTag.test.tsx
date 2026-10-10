import { describe, expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../../tests/setup'
import { renderUi } from '../../../tests/render-ui'
import { UnverifiedTag } from './UnverifiedTag'

describe('UnverifiedTag', () => {
  it('uses a dashed border, not a filled bar', async () => {
    const { container } = renderUi(<UnverifiedTag />)
    expect(container.textContent).toMatch(/unverified/i)
    expect(container.firstElementChild?.className).toContain('border-dashed')
    expect(container.firstElementChild?.className).not.toContain('bg-verified')
    await expectNoAxeViolations(container)
  })
})
