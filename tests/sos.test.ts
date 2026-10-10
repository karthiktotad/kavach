import { describe, expect, it } from 'vitest'
import {
  buildSmsUrl,
  buildSosPayload,
  formatSosText,
} from '../src/lib/sos'

describe('SOS Message and URI Generation (FE-7)', () => {
  it('formats clean SOS message with all fields present', () => {
    const text = formatSosText({
      location: { lat: 12.6208, lon: 80.1944, accuracyMetres: 15 },
      medical: { bloodGroup: 'O+', allergies: ['Penicillin', 'Peanuts'] },
    })

    expect(text).toBe(
      'SOS from Kavach. I need help. My location: 12.62080, 80.19440 (about 15 m). Blood group: O+. Allergies: Penicillin, Peanuts.',
    )
  })

  it('omits missing fields and never outputs placeholder text', () => {
    const textWithoutMedical = formatSosText({
      location: { lat: 12.6208, lon: 80.1944 },
    })
    expect(textWithoutMedical).toBe(
      'SOS from Kavach. I need help. My location: 12.62080, 80.19440.',
    )
    expect(textWithoutMedical).not.toContain('undefined')
    expect(textWithoutMedical).not.toContain('null')
    expect(textWithoutMedical).not.toContain('Blood group')
    expect(textWithoutMedical).not.toContain('Allergies')

    const textWithoutLocation = formatSosText({
      medical: { bloodGroup: 'B-' },
    })
    expect(textWithoutLocation).toBe('SOS from Kavach. I need help. Blood group: B-.')
    expect(textWithoutLocation).not.toContain('My location')
  })

  it('caps at 300 characters, dropping allergy detail first when oversized', () => {
    const longAllergies =
      'Severe allergy to latex, penicillin, sulfa drugs, multiple insect stings, tree nuts, shellfish, ibuprofen, aspirin, pollen, dust mites, eggs, soy, wheat, dairy, and sesame seeds'

    const text = formatSosText({
      location: { lat: 12.6208, lon: 80.1944, accuracyMetres: 20 },
      medical: { bloodGroup: 'AB+', allergies: longAllergies },
    })

    expect(text.length).toBeLessThanOrEqual(300)
    // Dropping allergies allows the crucial location and blood group to fit
    expect(text).toContain('My location')
    expect(text).toContain('Blood group: AB+')
  })

  it('handles iOS SMS URL scheme using &body=', () => {
    const url = buildSmsUrl({
      phoneNumber: '+919876543210',
      body: 'SOS test message',
      platform: 'ios',
    })

    expect(url).toBe('sms:+919876543210&body=SOS%20test%20message')
  })

  it('handles Android / standard SMS URL scheme using ?body=', () => {
    const url = buildSmsUrl({
      phoneNumber: '+919876543210',
      body: 'SOS test message',
      platform: 'android',
    })

    expect(url).toBe('sms:+919876543210?body=SOS%20test%20message')
  })

  it('handles empty recipient without error on iOS and Android', () => {
    const iosUrl = buildSmsUrl({
      body: 'SOS test',
      platform: 'ios',
    })
    expect(iosUrl).toBe('sms:&body=SOS%20test')

    const androidUrl = buildSmsUrl({
      body: 'SOS test',
      platform: 'android',
    })
    expect(androidUrl).toBe('sms:?body=SOS%20test')
  })

  it('flags needsContact and warning when no contact is saved', () => {
    const payload = buildSosPayload({
      location: { lat: 12.6, lon: 80.2 },
      medical: { bloodGroup: 'O+' },
      recipientPhone: null,
      platform: 'android',
    })

    expect(payload.needsContact).toBe(true)
    expect(payload.warning).toBe('needs: Add an emergency contact in Me')
    expect(payload.smsUrl).toBe('sms:?body=SOS%20from%20Kavach.%20I%20need%20help.%20My%20location%3A%2012.60000%2C%2080.20000.%20Blood%20group%3A%20O%2B.')
  })

  it('returns valid payload without warning when recipient is present', () => {
    const payload = buildSosPayload({
      location: { lat: 12.6, lon: 80.2 },
      recipientPhone: '112',
      platform: 'ios',
    })

    expect(payload.needsContact).toBe(false)
    expect(payload.warning).toBeUndefined()
    expect(payload.recipientPhone).toBe('112')
    expect(payload.smsUrl).toContain('sms:112&body=')
  })
})
