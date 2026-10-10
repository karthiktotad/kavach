export interface StepListProps {
  steps: readonly string[]
}

export function StepList({ steps }: StepListProps) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, index) => (
        <li key={`${index}-${step}`} className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="bg-verified-tint text-verified flex h-10 w-10 shrink-0 items-center justify-center rounded-12 text-lg font-bold"
          >
            {index + 1}
          </span>
          <span className="text-text-2 pt-1.5 text-[15px] leading-snug">{step}</span>
        </li>
      ))}
    </ol>
  )
}
