import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { expectNoAxeViolations } from '../../../tests/setup'
import { renderUi } from '../../../tests/render-ui'
import { PhoneShell } from './PhoneShell'

describe('PhoneShell', () => {
  it('constrains to 480px and offers a skip link', async () => {
    const { container } = renderUi(
      <PhoneShell>
        <main id="main-content">Hello</main>
      </PhoneShell>,
    )
    const skip = screen.getByRole('link', { name: /skip to main content/i })
    expect(skip).toHaveAttribute('href', '#main-content')
    expect(container.innerHTML).toContain('max-w-[480px]')
    await expectNoAxeViolations(container)
  })
})
