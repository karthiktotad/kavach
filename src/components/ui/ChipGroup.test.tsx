import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { expectNoAxeViolations } from '../../../tests/setup'
import { renderUi } from '../../../tests/render-ui'
import { ChipGroup } from './ChipGroup'

describe('ChipGroup', () => {
  it('exposes aria-pressed and notifies on change', async () => {
    const onChange = vi.fn()
    const { container } = renderUi(
      <ChipGroup
        label="Hazard"
        value="FL"
        onChange={onChange}
        options={[
          { id: 'FL', label: 'Flood' },
          { id: 'CY', label: 'Cyclone' },
        ]}
      />,
    )
    expect(screen.getByRole('button', { name: 'Flood' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cyclone' }))
    expect(onChange).toHaveBeenCalledWith('CY')
    await expectNoAxeViolations(container)
  })
})
