/**
 * Me Screen (/me) — Medical ID & Offline Settings (FE-7 UI).
 *
 * Privacy & Security Rules:
 *  - Stored strictly on-device in IndexedDB via medicalId.ts.
 *  - NEVER uploaded, NEVER sent across the network.
 *  - All fields are optional.
 *  - Supports export as QR payload and lock-screen responder view.
 *  - "Delete all" button with confirmation.
 *  - "Offline AI (experimental)" toggle with WebGPU check, ~400 MB download hint, and delete model button.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button, Card, Icon, PhoneShell, Sheet } from '../components/ui'
import { StatusChip } from '../components/ui/StatusChip'
import { useLanguage } from '../store/language'
import {
  deleteAllMedicalId,
  formatMedicalIdToQr,
  getMedicalId,
  saveMedicalId,
  type MedicalIdData,
} from '../lib/medicalId'
import { getSetting, setSetting } from '../lib/db'

const OFFLINE_AI_SETTING = 'kavach_offline_ai_enabled'

const BLOOD_GROUPS = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
  'Unknown',
] as const

export default function MePage() {
  const { t } = useLanguage()

  // Medical ID form state
  const [name, setName] = useState('')
  const [bloodGroup, setBloodGroup] = useState('')
  const [allergies, setAllergies] = useState('')
  const [conditions, setConditions] = useState('')
  const [medications, setMedications] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [embassyNumber, setEmbassyNumber] = useState('')
  const [organDonor, setOrganDonor] = useState(false)
  const [notes, setNotes] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Sheets state
  const [qrSheetOpen, setQrSheetOpen] = useState(false)
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false)
  const [aiConfirmSheetOpen, setAiConfirmSheetOpen] = useState(false)

  const handleCloseQr = useCallback(() => setQrSheetOpen(false), [])
  const handleCloseDelete = useCallback(() => setDeleteSheetOpen(false), [])
  const handleCloseAiConfirm = useCallback(() => setAiConfirmSheetOpen(false), [])

  // Offline AI settings
  const [hasWebGpu] = useState(() =>
    typeof navigator !== 'undefined' &&
    Boolean('gpu' in navigator && (navigator as unknown as { gpu?: unknown }).gpu !== undefined),
  )
  const [offlineAiEnabled, setOfflineAiEnabled] = useState(false)
  const [aiModelDeleted, setAiModelDeleted] = useState(false)
  const [copiedPayload, setCopiedPayload] = useState(false)

  // Derived current Medical ID data and QR payload string
  const parseList = (val: string) =>
    val
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

  const currentMedicalData: MedicalIdData = {
    name: name.trim() || undefined,
    bloodGroup: bloodGroup || undefined,
    allergies: parseList(allergies),
    conditions: parseList(conditions),
    medications: parseList(medications),
    emergencyContacts:
      contactName.trim() || contactPhone.trim()
        ? [{ name: contactName.trim(), phone: contactPhone.trim() }]
        : [],
    embassyNumber: embassyNumber.trim() || undefined,
    organDonor,
    notes: notes.trim() || undefined,
  }

  const qrPayload = formatMedicalIdToQr(currentMedicalData)

  // Load existing Medical ID
  useEffect(() => {
    let mounted = true
    void getMedicalId().then((data) => {
      if (!mounted || !data) return
      if (data.name) setName(data.name)
      if (data.bloodGroup) setBloodGroup(data.bloodGroup)
      if (data.allergies) setAllergies(data.allergies.join(', '))
      if (data.conditions) setConditions(data.conditions.join(', '))
      if (data.medications) setMedications(data.medications.join(', '))
      if (data.emergencyContacts?.[0]?.name) setContactName(data.emergencyContacts[0].name)
      if (data.emergencyContacts?.[0]?.phone) setContactPhone(data.emergencyContacts[0].phone)
      if (data.embassyNumber) setEmbassyNumber(data.embassyNumber)
      if (typeof data.organDonor === 'boolean') setOrganDonor(data.organDonor)
      if (data.notes) setNotes(data.notes)
    })

    // Load Offline AI setting
    void getSetting<boolean>(OFFLINE_AI_SETTING, false).then((enabled) => {
      if (mounted) setOfflineAiEnabled(enabled)
    })

    return () => {
      mounted = false
    }
  }, [])

  const handleSave = async (e?: FormEvent) => {
    e?.preventDefault?.()
    setSaving(true)

    const parseList = (val: string) =>
      val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

    const payload: MedicalIdData = {
      name: name.trim() || undefined,
      bloodGroup: bloodGroup || undefined,
      allergies: parseList(allergies),
      conditions: parseList(conditions),
      medications: parseList(medications),
      emergencyContacts:
        contactName.trim() || contactPhone.trim()
          ? [{ name: contactName.trim(), phone: contactPhone.trim() }]
          : [],
      embassyNumber: embassyNumber.trim() || undefined,
      organDonor,
      notes: notes.trim() || undefined,
    }

    await saveMedicalId(payload)
    setSaving(false)
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 3000)
  }

  const handleOpenQr = () => {
    setQrSheetOpen(true)
  }

  const handleDeleteAll = async () => {
    await deleteAllMedicalId()
    setName('')
    setBloodGroup('')
    setAllergies('')
    setConditions('')
    setMedications('')
    setContactName('')
    setContactPhone('')
    setEmbassyNumber('')
    setOrganDonor(false)
    setNotes('')
    setDeleteSheetOpen(false)
  }

  const handleToggleAi = () => {
    if (!offlineAiEnabled) {
      setAiConfirmSheetOpen(true)
    } else {
      setOfflineAiEnabled(false)
      void setSetting(OFFLINE_AI_SETTING, false)
    }
  }

  const handleConfirmEnableAi = async () => {
    setOfflineAiEnabled(true)
    await setSetting(OFFLINE_AI_SETTING, true)
    setAiConfirmSheetOpen(false)
  }

  const handleDeleteAiModel = async () => {
    setOfflineAiEnabled(false)
    await setSetting(OFFLINE_AI_SETTING, false)
    setAiModelDeleted(true)
    setTimeout(() => setAiModelDeleted(false), 3000)
  }

  const handleCopyQrPayload = async () => {
    try {
      await navigator.clipboard.writeText(qrPayload)
      setCopiedPayload(true)
      setTimeout(() => setCopiedPayload(false), 2000)
    } catch {
      // Ignore
    }
  }

  return (
    <PhoneShell>
      <main className="flex flex-col space-y-6 px-4 py-4 pb-16">
        {/* Header */}
        <header className="flex items-center justify-between gap-2 pt-1">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-ink">{t('me.title')}</h1>
            <p className="text-xs font-medium text-ink-muted">{t('me.intro')}</p>
          </div>
          <StatusChip />
        </header>

        {/* Privacy Note Badge */}
        <div className="flex items-center gap-2 rounded-12 border border-live/30 bg-live-tint p-3 text-xs font-semibold text-live-text">
          <Icon name="check-circle" className="h-4 w-4 shrink-0 text-live" />
          <span>{t('me.privacyNote')}</span>
        </div>

        {/* Quick Actions (Export QR / Lock screen view) */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="md"
            onClick={handleOpenQr}
            className="flex-1 min-w-[140px]"
            data-testid="me-export-qr-btn"
          >
            <Icon name="qr" className="h-4 w-4" />
            <span>{t('me.exportQr')}</span>
          </Button>
        </div>

        {/* Medical ID Form */}
        <form
          onSubmit={(e) => {
            void handleSave(e)
          }}
          className="space-y-4"
        >
          <Card className="space-y-4 p-4 border-line">
            <h2 className="text-base font-extrabold text-ink border-b border-line pb-2">
              Personal & Medical Details
            </h2>

            {/* Name */}
            <div className="space-y-1">
              <label htmlFor="me-name" className="text-xs font-bold text-ink-muted">
                {t('me.name')}
              </label>
              <input
                id="me-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex Smith"
                className="w-full rounded-10 border border-line bg-surface-sunken px-3.5 py-2.5 text-sm font-medium text-ink focus:border-verified focus:ring-2 focus:ring-verified/20 focus:outline-none"
              />
            </div>

            {/* Blood Group */}
            <div className="space-y-1">
              <label htmlFor="me-blood" className="text-xs font-bold text-ink-muted">
                {t('me.bloodGroup')}
              </label>
              <select
                id="me-blood"
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                className="w-full rounded-10 border border-line bg-surface-sunken px-3 py-2.5 text-sm font-bold text-ink focus:border-verified focus:ring-2 focus:ring-verified/20 focus:outline-none"
              >
                <option value="">-- Select Blood Group --</option>
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </div>

            {/* Allergies */}
            <div className="space-y-1">
              <label htmlFor="me-allergies" className="text-xs font-bold text-ink-muted">
                {t('me.allergies')}
              </label>
              <input
                id="me-allergies"
                type="text"
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                placeholder={t('me.allergiesPlaceholder')}
                className="w-full rounded-10 border border-line bg-surface-sunken px-3.5 py-2.5 text-sm font-medium text-ink focus:border-verified focus:ring-2 focus:ring-verified/20 focus:outline-none"
              />
            </div>

            {/* Conditions */}
            <div className="space-y-1">
              <label htmlFor="me-conditions" className="text-xs font-bold text-ink-muted">
                {t('me.conditions')}
              </label>
              <input
                id="me-conditions"
                type="text"
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
                placeholder={t('me.conditionsPlaceholder')}
                className="w-full rounded-10 border border-line bg-surface-sunken px-3.5 py-2.5 text-sm font-medium text-ink focus:border-verified focus:ring-2 focus:ring-verified/20 focus:outline-none"
              />
            </div>

            {/* Medications */}
            <div className="space-y-1">
              <label htmlFor="me-meds" className="text-xs font-bold text-ink-muted">
                {t('me.medications')}
              </label>
              <input
                id="me-meds"
                type="text"
                value={medications}
                onChange={(e) => setMedications(e.target.value)}
                placeholder={t('me.medicationsPlaceholder')}
                className="w-full rounded-10 border border-line bg-surface-sunken px-3.5 py-2.5 text-sm font-medium text-ink focus:border-verified focus:ring-2 focus:ring-verified/20 focus:outline-none"
              />
            </div>

            {/* Organ Donor */}
            <div className="flex items-center gap-3 pt-1">
              <input
                id="me-donor"
                type="checkbox"
                checked={organDonor}
                onChange={(e) => setOrganDonor(e.target.checked)}
                className="h-5 w-5 rounded border-line text-verified focus:ring-verified"
              />
              <label htmlFor="me-donor" className="text-sm font-bold text-ink cursor-pointer">
                {t('me.organDonor')}
              </label>
            </div>
          </Card>

          {/* Emergency Contacts Card */}
          <Card className="space-y-4 p-4 border-line">
            <h2 className="text-base font-extrabold text-ink border-b border-line pb-2">
              Emergency Contacts
            </h2>

            {/* Contact Name */}
            <div className="space-y-1">
              <label htmlFor="me-cname" className="text-xs font-bold text-ink-muted">
                {t('me.contactName')}
              </label>
              <input
                id="me-cname"
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="e.g. Jane Doe (Spouse)"
                className="w-full rounded-10 border border-line bg-surface-sunken px-3.5 py-2.5 text-sm font-medium text-ink focus:border-verified focus:ring-2 focus:ring-verified/20 focus:outline-none"
              />
            </div>

            {/* Contact Phone */}
            <div className="space-y-1">
              <label htmlFor="me-cphone" className="text-xs font-bold text-ink-muted">
                {t('me.contactPhone')}
              </label>
              <input
                id="me-cphone"
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full rounded-10 border border-line bg-surface-sunken px-3.5 py-2.5 text-sm font-medium text-ink focus:border-verified focus:ring-2 focus:ring-verified/20 focus:outline-none"
              />
            </div>

            {/* Embassy Number */}
            <div className="space-y-1">
              <label htmlFor="me-embassy" className="text-xs font-bold text-ink-muted">
                {t('me.embassy')}
              </label>
              <input
                id="me-embassy"
                type="tel"
                value={embassyNumber}
                onChange={(e) => setEmbassyNumber(e.target.value)}
                placeholder="+91 11 2419 8000"
                className="w-full rounded-10 border border-line bg-surface-sunken px-3.5 py-2.5 text-sm font-medium text-ink focus:border-verified focus:ring-2 focus:ring-verified/20 focus:outline-none"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <label htmlFor="me-notes" className="text-xs font-bold text-ink-muted">
                {t('me.notes')}
              </label>
              <textarea
                id="me-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Additional instructions for paramedics…"
                className="w-full rounded-10 border border-line bg-surface-sunken px-3.5 py-2.5 text-sm font-medium text-ink focus:border-verified focus:ring-2 focus:ring-verified/20 focus:outline-none"
              />
            </div>
          </Card>

          {/* Save Button */}
          <div className="space-y-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={saving}
              onClick={() => {
                void handleSave()
              }}
              className="w-full"
              data-testid="me-save-btn"
            >
              <Icon name="check-circle" className="h-5 w-5" />
              <span>{saveSuccess ? t('me.saved') : t('me.save')}</span>
            </Button>

            {saveSuccess && (
              <p className="text-center text-xs font-bold text-live animate-fade-in">
                ✓ {t('me.saved')}
              </p>
            )}
          </div>
        </form>

        {/* Delete All Data */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setDeleteSheetOpen(true)}
            className="w-full text-center text-xs font-bold text-danger hover:underline py-2 transition-colors"
            data-testid="me-delete-all-btn"
          >
            {t('me.deleteAll')}
          </button>
        </div>

        {/* Settings: Offline AI (experimental) */}
        <Card className="space-y-4 p-4 border-line">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-ink">
                {t('offlineAi.title')}
              </h2>
              <p className="text-xs text-ink-muted leading-relaxed">
                {t('offlineAi.desc')}
              </p>
            </div>

            {/* Toggle */}
            <button
              type="button"
              role="switch"
              aria-checked={offlineAiEnabled}
              onClick={handleToggleAi}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-line transition-colors duration-200 ease-in-out focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-verified mt-1 ${
                offlineAiEnabled ? 'bg-verified' : 'bg-surface-sunken'
              }`}
              data-testid="offline-ai-toggle"
            >
              <span className="sr-only">{t('offlineAi.title')}</span>
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  offlineAiEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* WebGPU capability badge */}
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`h-2 w-2 rounded-full ${hasWebGpu ? 'bg-live' : 'bg-danger'}`}
            />
            <span className="font-semibold text-ink-muted">
              {hasWebGpu ? t('offlineAi.gpuSupported') : t('offlineAi.gpuUnsupported')}
            </span>
          </div>

          {/* Status info */}
          <div className="rounded-10 bg-surface-sunken p-3 text-xs space-y-1">
            <div className="font-bold text-ink">
              Status:{' '}
              <span className={offlineAiEnabled ? 'text-live-text font-extrabold' : 'text-ink-muted'}>
                {offlineAiEnabled ? t('offlineAi.statusReady') : t('offlineAi.statusDisabled')}
              </span>
            </div>
            <p className="text-ink-muted/80">{t('offlineAi.downloadSize')}</p>
          </div>

          {/* Delete model button */}
          {offlineAiEnabled && (
            <div className="pt-1">
              <Button
                variant="secondary"
                size="md"
                onClick={() => void handleDeleteAiModel()}
                className="w-full text-xs font-bold text-danger border-danger/40 hover:bg-danger/5"
                data-testid="offline-ai-delete-model-btn"
              >
                <Icon name="warning" className="h-4 w-4" />
                <span>{t('offlineAi.deleteModel')}</span>
              </Button>
            </div>
          )}

          {aiModelDeleted && (
            <p className="text-center text-xs font-semibold text-ink-muted">
              Offline model data erased.
            </p>
          )}
        </Card>

        {/* QR Export & Lock-Screen Responder Sheet */}
        <Sheet
          open={qrSheetOpen}
          onClose={handleCloseQr}
          title={t('me.qrTitle')}
          closeLabel={t('ui.close')}
        >
          <div className="space-y-4 py-2">
            <p className="text-xs font-medium text-ink-muted">
              {t('me.qrDesc')}
            </p>

            {/* Lock Screen Friendly Responder Summary */}
            <div className="rounded-12 border-2 border-danger-dark bg-danger-tint/20 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-danger/20 pb-2">
                <span className="text-xs font-black uppercase tracking-wider text-danger">
                  EMERGENCY MEDICAL ID
                </span>
                {bloodGroup && (
                  <span className="rounded-full bg-danger text-white px-2.5 py-0.5 text-xs font-black">
                    {bloodGroup}
                  </span>
                )}
              </div>

              {name && (
                <div>
                  <div className="text-[11px] font-bold text-ink-muted uppercase">Name</div>
                  <div className="text-base font-extrabold text-ink">{name}</div>
                </div>
              )}

              {allergies && (
                <div>
                  <div className="text-[11px] font-bold text-danger uppercase">Allergies</div>
                  <div className="text-sm font-extrabold text-danger-dark">{allergies}</div>
                </div>
              )}

              {conditions && (
                <div>
                  <div className="text-[11px] font-bold text-ink-muted uppercase">Conditions</div>
                  <div className="text-sm font-bold text-ink">{conditions}</div>
                </div>
              )}

              {contactPhone && (
                <div>
                  <div className="text-[11px] font-bold text-ink-muted uppercase">Emergency Contact</div>
                  <div className="text-sm font-bold text-ink">
                    {contactName ? `${contactName}: ` : ''}
                    <a href={`tel:${contactPhone}`} className="text-verified underline">
                      {contactPhone}
                    </a>
                  </div>
                </div>
              )}

              {organDonor && (
                <div className="inline-block rounded bg-live-tint px-2 py-0.5 text-xs font-bold text-live-text">
                  ✓ Organ Donor
                </div>
              )}
            </div>

            {/* QR Payload String Representation */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-ink-muted">Encoded Data String:</span>
                <button
                  type="button"
                  onClick={() => void handleCopyQrPayload()}
                  className="font-bold text-verified hover:underline"
                >
                  {copiedPayload ? t('ui.copied') : t('ui.copy')}
                </button>
              </div>
              <div className="max-h-24 overflow-y-auto rounded-8 bg-surface-sunken p-2.5 font-mono text-[11px] text-ink break-all border border-line select-all">
                {qrPayload}
              </div>
            </div>

            <Button
              variant="secondary"
              size="md"
              onClick={handleCloseQr}
              className="w-full mt-2"
            >
              {t('ui.close')}
            </Button>
          </div>
        </Sheet>

        {/* Delete All Confirmation Sheet */}
        <Sheet
          open={deleteSheetOpen}
          onClose={handleCloseDelete}
          title={t('me.deleteConfirmTitle')}
          closeLabel={t('ui.cancel')}
        >
          <div className="space-y-4 py-2">
            <p className="text-sm font-medium text-ink-muted leading-relaxed">
              {t('me.deleteConfirmBody')}
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                variant="danger"
                size="lg"
                onClick={() => void handleDeleteAll()}
                className="w-full font-black"
                data-testid="me-confirm-delete-btn"
              >
                {t('me.deleteConfirmBtn')}
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={handleCloseDelete}
                className="w-full"
              >
                {t('ui.cancel')}
              </Button>
            </div>
          </div>
        </Sheet>

        {/* Offline AI Download Confirmation Sheet */}
        <Sheet
          open={aiConfirmSheetOpen}
          onClose={handleCloseAiConfirm}
          title="Enable Offline AI"
          closeLabel={t('ui.cancel')}
        >
          <div className="space-y-4 py-2">
            <div className="rounded-10 bg-amber-50 p-3.5 border border-amber-200 text-xs text-amber-900 space-y-1.5">
              <div className="font-extrabold flex items-center gap-1.5">
                <Icon name="info" className="h-4 w-4 shrink-0 text-amber-700" />
                <span>Download size warning</span>
              </div>
              <p className="leading-relaxed font-medium">
                {t('offlineAi.downloadSize')}
              </p>
            </div>

            <p className="text-xs text-ink-muted leading-relaxed">
              Once downloaded, safety queries will process directly on your device GPU with no server connection.
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                variant="primary"
                size="lg"
                onClick={() => void handleConfirmEnableAi()}
                className="w-full"
                data-testid="confirm-enable-ai-btn"
              >
                {t('ui.confirm')}
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setAiConfirmSheetOpen(false)}
                className="w-full"
              >
                {t('ui.cancel')}
              </Button>
            </div>
          </div>
        </Sheet>
      </main>
    </PhoneShell>
  )
}
