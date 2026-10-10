import { describe, expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../../tests/setup'
import { renderUi } from '../../../tests/render-ui'
import { SourceChip } from './SourceChip'

describe('SourceChip', () => {
  it('names the source in plain language', async () => {
    const { container } = renderUi(<SourceChip source="content pack" />)
    expect(container.textContent).toMatch(/based on/i)
    expect(container.textContent).toMatch(/content pack/i)
    await expectNoAxeViolations(container)
  })
})
