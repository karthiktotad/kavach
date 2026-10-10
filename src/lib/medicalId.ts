/**
 * Medical ID on-device store & QR exporter (FE-7).
 *
 * Privacy & Security Rules:
 *  - Stored strictly in local IndexedDB.
 *  - NEVER touches the network, NEVER transmitted to AI or remote APIs.
 *  - All fields are optional.
 *  - Supports single-tap complete wipe (deleteAll).
 */
import { getDb } from './db'

export interface MedicalContact {
  readonly name: string
  readonly phone: string
  readonly relation?: string
}

export interface MedicalIdData {
  readonly name?: string
  readonly bloodGroup?: string
  readonly allergies?: string[]
  readonly conditions?: string[]
  readonly medications?: string[]
  readonly emergencyContacts?: MedicalContact[]
  readonly embassyNumber?: string
  readonly organDonor?: boolean
  readonly notes?: string
  readonly updatedAt?: number
}

interface StoredMeta {
  readonly name?: string
  readonly embassyNumber?: string
  readonly contacts?: MedicalContact[]
}

const DOCUMENT_ID = 'me'

/**
 * Retrieve the saved Medical ID record from IndexedDB.
 */
export async function getMedicalId(): Promise<MedicalIdData | null> {
  const row = await getDb().medicalId.get(DOCUMENT_ID)
  if (!row) return null

  // Safely parse extended data stored in notes/row
  let extendedContacts: MedicalContact[] = []
  let storedName = ''
  let embassyNumber = ''

  if (row.emergencyContactName || row.emergencyContactPhone) {
    extendedContacts.push({
      name: row.emergencyContactName || '',
      phone: row.emergencyContactPhone || '',
    })
  }

  // Check if extra metadata is serialized
  let notesText = row.notes || ''
  if (notesText.startsWith('__META:')) {
    try {
      const splitIdx = notesText.indexOf('\n')
      const metaJson = notesText.slice(7, splitIdx !== -1 ? splitIdx : undefined)
      const meta = JSON.parse(metaJson) as StoredMeta
      if (typeof meta.name === 'string') storedName = meta.name
      if (typeof meta.embassyNumber === 'string') embassyNumber = meta.embassyNumber
      if (Array.isArray(meta.contacts)) extendedContacts = meta.contacts
      notesText = splitIdx !== -1 ? notesText.slice(splitIdx + 1) : ''
    } catch {
      // Keep notes as is
    }
  }

  return {
    name: storedName || undefined,
    bloodGroup: row.bloodType || undefined,
    allergies: row.allergies || [],
    conditions: row.conditions || [],
    medications: row.medications || [],
    emergencyContacts: extendedContacts,
    embassyNumber: embassyNumber || undefined,
    organDonor: row.organDonor ?? undefined,
    notes: notesText || undefined,
    updatedAt: row.updatedAt,
  }
}

/**
 * Save or update the Medical ID.
 */
export async function saveMedicalId(data: MedicalIdData): Promise<MedicalIdData> {
  const now = Date.now()
  const primaryContact = data.emergencyContacts?.[0]

  const metaHeader = `__META:${JSON.stringify({
    name: data.name,
    embassyNumber: data.embassyNumber,
    contacts: data.emergencyContacts,
  })}\n`

  const notesWithMeta = `${metaHeader}${data.notes || ''}`

  await getDb().medicalId.put({
    id: DOCUMENT_ID,
    bloodType: data.bloodGroup || null,
    allergies: data.allergies || [],
    conditions: data.conditions || [],
    medications: data.medications || [],
    emergencyContactName: primaryContact?.name || null,
    emergencyContactPhone: primaryContact?.phone || null,
    organDonor: data.organDonor ?? null,
    notes: notesWithMeta,
    updatedAt: now,
  })

  return {
    ...data,
    updatedAt: now,
  }
}

/**
 * Completely erase the Medical ID from local storage.
 */
export async function deleteAllMedicalId(): Promise<void> {
  await getDb().medicalId.delete(DOCUMENT_ID)
}

/**
 * Export Medical ID as a compact payload suitable for emergency responder QR codes.
 * Omits all empty/undefined fields.
 */
export async function exportToQrPayload(): Promise<string> {
  const data = await getMedicalId()
  if (!data) return 'KAVACH:MED:EMPTY'

  const exportObj: Record<string, unknown> = {
    k: 'MED-1',
  }

  if (data.name) exportObj.n = data.name
  if (data.bloodGroup) exportObj.bg = data.bloodGroup
  if (data.allergies && data.allergies.length > 0) exportObj.al = data.allergies
  if (data.conditions && data.conditions.length > 0) exportObj.cd = data.conditions
  if (data.medications && data.medications.length > 0) exportObj.rx = data.medications
  if (data.organDonor !== undefined) exportObj.od = data.organDonor ? 1 : 0
  if (data.emergencyContacts && data.emergencyContacts.length > 0) {
    exportObj.ec = data.emergencyContacts.map((c) => ({ n: c.name, p: c.phone }))
  }
  if (data.embassyNumber) exportObj.emb = data.embassyNumber

  return `KAVACH:MED:${JSON.stringify(exportObj)}`
}
