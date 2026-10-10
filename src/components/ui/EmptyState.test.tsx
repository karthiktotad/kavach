import { describe, expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../../tests/setup'
import { renderUi } from '../../../tests/render-ui'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('shows a default title and body', async () => {
    const { container } = renderUi(<EmptyState />)
    expect(container.textContent).toMatch(/nothing here/i)
    await expectNoAxeViolations(container)
  })
})
