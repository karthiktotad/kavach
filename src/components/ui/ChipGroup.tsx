export interface ChipOption {
  id: string
  label: string
}

export interface ChipGroupProps {
  /** Accessible name for the group. */
  label: string
  options: readonly ChipOption[]
  value: string
  onChange: (id: string) => void
}

export function ChipGroup({ label, options, value, onChange }: ChipGroupProps) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const pressed = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(option.id)}
            className={[
              'inline-flex min-h-[44px] items-center rounded-full px-4 text-[15px] font-bold',
              'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-verified',
              pressed
                ? 'bg-verified text-white'
                : 'bg-surface text-verified ring-2 ring-verified',
            ].join(' ')}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
