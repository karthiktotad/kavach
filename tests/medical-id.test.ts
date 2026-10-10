import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { KavachDb, __setDbForTests } from '../src/lib/db'
import {
  deleteAllMedicalId,
  exportToQrPayload,
  getMedicalId,
  saveMedicalId,
  type MedicalIdData,
} from '../src/lib/medicalId'

describe('Medical ID Local Store & QR Exporter (FE-7)', () => {
  beforeEach(async () => {
    const db = new KavachDb()
    __setDbForTests(db)
    await db.open()
    await Promise.all(db.tables.map((t) => t.clear()))
  })

  it('returns null when no medical ID is configured', async () => {
    const data = await getMedicalId()
    expect(data).toBeNull()
  })

  it('saves and retrieves medical details accurately with all fields optional', async () => {
    const sample: MedicalIdData = {
      name: 'Jane Doe',
      bloodGroup: 'A-',
      allergies: ['Amoxicillin', 'Bee stings'],
      conditions: ['Asthma'],
      medications: ['Salbutamol inhaler'],
      emergencyContacts: [
        { name: 'John Doe', phone: '+919876543210' },
        { name: 'Hotel Desk', phone: '+914427442000' },
      ],
      embassyNumber: '+911124198000',
      organDonor: true,
      notes: 'Keep inhaler accessible.',
    }

    const saved = await saveMedicalId(sample)
    expect(saved.bloodGroup).toBe('A-')
    expect(saved.updatedAt).toBeDefined()

    const retrieved = await getMedicalId()
    expect(retrieved).not.toBeNull()
    expect(retrieved?.name).toBe('Jane Doe')
    expect(retrieved?.bloodGroup).toBe('A-')
    expect(retrieved?.allergies).toEqual(['Amoxicillin', 'Bee stings'])
    expect(retrieved?.conditions).toEqual(['Asthma'])
    expect(retrieved?.medications).toEqual(['Salbutamol inhaler'])
    expect(retrieved?.emergencyContacts).toEqual([
      { name: 'John Doe', phone: '+919876543210' },
      { name: 'Hotel Desk', phone: '+914427442000' },
    ])
    expect(retrieved?.embassyNumber).toBe('+911124198000')
    expect(retrieved?.organDonor).toBe(true)
    expect(retrieved?.notes).toBe('Keep inhaler accessible.')
  })

  it('exports compact QR payload omitting undefined fields', async () => {
    await saveMedicalId({
      name: 'Alex Smith',
      bloodGroup: 'O+',
      allergies: ['Penicillin'],
      emergencyContacts: [{ name: 'Alex Partner', phone: '112' }],
    })

    const payload = await exportToQrPayload()
    expect(payload).toContain('KAVACH:MED:')
    expect(payload).toContain('"bg":"O+"')
    expect(payload).toContain('"n":"Alex Smith"')
    expect(payload).toContain('"al":["Penicillin"]')
    expect(payload).not.toContain('"cd"')
    expect(payload).not.toContain('"rx"')
  })

  it('returns empty placeholder when exporting empty store to QR', async () => {
    const payload = await exportToQrPayload()
    expect(payload).toBe('KAVACH:MED:EMPTY')
  })

  it('completely deletes medical ID on deleteAll', async () => {
    await saveMedicalId({
      name: 'To Be Deleted',
      bloodGroup: 'B+',
    })

    expect(await getMedicalId()).not.toBeNull()

    await deleteAllMedicalId()

    expect(await getMedicalId()).toBeNull()
  })
})
