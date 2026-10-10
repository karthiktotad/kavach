import type { ReactNode } from 'react'

export interface CardProps {
  children: ReactNode
  className?: string
  as?: 'section' | 'article' | 'div'
}

export function Card({ children, className = '', as: Tag = 'section' }: CardProps) {
  return (
    <Tag className={`rounded-16 bg-surface p-4 ring-1 ring-line ${className}`.trim()}>
      {children}
    </Tag>
  )
}
