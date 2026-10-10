import { describe, expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../../tests/setup'
import { renderUi } from '../../../tests/render-ui'
import { VerifiedBadge } from './VerifiedBadge'

describe('VerifiedBadge', () => {
  it('is a filled bar with check + word, axe clean', async () => {
    const { container } = renderUi(<VerifiedBadge />)
    expect(container.textContent).toMatch(/verified/i)
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.firstElementChild?.className).toContain('bg-verified')
    await expectNoAxeViolations(container)
  })
})
