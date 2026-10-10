import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderUi } from './render-ui'
import AssistPage from '../src/pages/AssistPage'
import { assistant, clearIndexCache } from '../src/lib/assistant'
import { getDb, KavachDb, __setDbForTests } from '../src/lib/db'

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { sha256Hex } from '../src/lib/pack'

const kbEnRaw = readFileSync(resolve(__dirname, '../public/pack/kb/en.json'), 'utf-8')
const contactsRaw = readFileSync(resolve(__dirname, '../public/pack/contacts.json'), 'utf-8')
const placesRaw = readFileSync(resolve(__dirname, '../public/pack/places.json'), 'utf-8')

describe('FE-6: Assistant Screen (/assist)', () => {
  beforeEach(async () => {
    localStorage.clear()
    clearIndexCache()
    const db = new KavachDb()
    __setDbForTests(db)
    await db.open()
    await Promise.all(db.tables.map((t) => t.clear()))

    await getDb().packFiles.bulkPut([
      {
        key: 'kb/en.json',
        version: '0.2.0',
        data: kbEnRaw,
        bytes: kbEnRaw.length,
        sha256: await sha256Hex(kbEnRaw),
        fetchedAt: Date.now(),
      },
      {
        key: 'contacts.json',
        version: '0.2.0',
        data: contactsRaw,
        bytes: contactsRaw.length,
        sha256: await sha256Hex(contactsRaw),
        fetchedAt: Date.now(),
      },
      {
        key: 'places.json',
        version: '0.2.0',
        data: placesRaw,
        bytes: placesRaw.length,
        sha256: await sha256Hex(placesRaw),
        fetchedAt: Date.now(),
      },
    ])
    vi.clearAllMocks()
  })

  it('renders header, title, and initial mode badge', () => {
    renderUi(<AssistPage />)
    expect(screen.getByRole('heading', { level: 1, name: /assist/i })).toBeInTheDocument()
    const badge = screen.getByTestId('assistant-mode-badge')
    expect(badge).toBeInTheDocument()
    expect(badge.textContent).toMatch(/AI|Offline guidance/i)
  })

  it('renders quick reply chips and initial empty state', () => {
    renderUi(<AssistPage />)
    expect(screen.getByText('Is it safe here?')).toBeInTheDocument()
    expect(screen.getByText('Nearest shelter')).toBeInTheDocument()
    expect(screen.getByText('I need a doctor')).toBeInTheDocument()
    expect(screen.getByText('First aid')).toBeInTheDocument()
  })

  it('disclaimer and input elements are properly labelled and visible', () => {
    renderUi(<AssistPage />)
    expect(screen.getByPlaceholderText(/Ask a safety or first aid question/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Ask assistant')).toBeInTheDocument()
    expect(
      screen.getByText(/General guidance, not a substitute for professional medical or emergency care/i),
    ).toBeInTheDocument()
  })

  it('handles offline query: "how do I treat a snake bite"', async () => {
    renderUi(<AssistPage />)
    const input = screen.getByLabelText('Ask assistant')
    const sendBtn = screen.getByLabelText('Send')

    fireEvent.change(input, { target: { value: 'how do I treat a snake bite' } })
    fireEvent.click(sendBtn)

    await waitFor(() => {
      // User message
      expect(screen.getByText('how do I treat a snake bite')).toBeInTheDocument()
    })

    await waitFor(() => {
      // Should show answer with snake bite guidance
      expect(screen.getByText(/Snake bite emergency/i)).toBeInTheDocument()
      expect(screen.getByText(/Keep the bitten limb immobilized/i)).toBeInTheDocument()
    })

    // Read aloud button
    expect(screen.getByLabelText(/Read aloud/i)).toBeInTheDocument()
    // Source chip
    expect(screen.getByText(/Based on:/i)).toBeInTheDocument()
  })

  it('handles offline query: "where is the nearest shelter"', async () => {
    renderUi(<AssistPage />)
    const input = screen.getByLabelText('Ask assistant')
    const sendBtn = screen.getByLabelText('Send')

    fireEvent.change(input, { target: { value: 'where is the nearest shelter' } })
    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(screen.getAllByText(/shelter/i).length).toBeGreaterThan(0)
    })
  })

  it('handles offline serious query: "I\'m bleeding badly" and displays serious case strip', async () => {
    renderUi(<AssistPage />)
    const input = screen.getByLabelText('Ask assistant')
    const sendBtn = screen.getByLabelText('Send')

    fireEvent.change(input, { target: { value: "I'm bleeding badly" } })
    fireEvent.click(sendBtn)

    await waitFor(() => {
      // Serious banner with Call 112
      expect(screen.getByText(/Life safety concern detected/i)).toBeInTheDocument()
      const call112Btn = screen.getByLabelText(/Call emergency 112/i)
      expect(call112Btn).toBeInTheDocument()
      expect(call112Btn).toHaveAttribute('href', 'tel:112')
    })
  })

  it('allows clearing chat history', async () => {
    renderUi(<AssistPage />)
    const input = screen.getByLabelText('Ask assistant')
    const sendBtn = screen.getByLabelText('Send')

    fireEvent.change(input, { target: { value: 'custom unique query' } })
    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(screen.getByText('custom unique query')).toBeInTheDocument()
    })

    const clearBtn = screen.getByText('Clear conversation')
    expect(clearBtn).toBeInTheDocument()
    fireEvent.click(clearBtn)

    await waitFor(() => {
      expect(screen.queryByText('custom unique query')).not.toBeInTheDocument()
    })
  })

  it('falls back cleanly if assistant throws', async () => {
    vi.spyOn(assistant, 'ask').mockRejectedValueOnce(new Error('Network drop'))

    renderUi(<AssistPage />)
    const input = screen.getByLabelText('Ask assistant')
    const sendBtn = screen.getByLabelText('Send')

    fireEvent.change(input, { target: { value: 'Random query' } })
    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument()
    })
  })
})
