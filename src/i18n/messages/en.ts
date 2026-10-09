/**
 * English message catalogue — the source of truth for the key set.
 *
 * Engineering rule 5: every user-facing string in the app must have a key here.
 * `translate()` falls back to this file for any locale not yet translated, so
 * adding a key here immediately makes it available in all 8 languages.
 *
 * Dot namespaced keys keep related strings together: `nav.*`, `status.*`,
 * `a11y.*`, `page.*`.
 */
import type { Messages } from '../index'

export const messages: Messages = {
  // ---- App shell -----------------------------------------------------------
  'app.name': 'Kavach',
  'app.tagline': 'When the internet dies, the information must still arrive.',

  // ---- Bottom navigation (icon + label, never icon alone) ------------------
  'nav.home': 'Home',
  'nav.alerts': 'Alerts',
  'nav.map': 'Map',
  'nav.assist': 'Assist',
  'nav.aid': 'Aid',
  'nav.phrases': 'Phrases',
  'nav.me': 'Me',
  'nav.more': 'More',

  // ---- Connectivity ladder status chip -------------------------------------
  'status.label': 'Connection',
  'status.live': 'Live',
  'status.degraded': 'Degraded',
  'status.cellular': 'Cellular only',
  'status.offline': 'Offline',
  'status.relay': 'Relay only',
  'status.live.desc': 'Connected. Live alerts and maps are updating.',
  'status.degraded.desc': 'Slow or unstable connection. Showing saved data while retrying.',
  'status.cellular.desc': 'Metered mobile data. Text and QR only, map tiles paused.',
  'status.offline.desc': 'No network. Using the preloaded Kavach pack on this device.',
  'status.relay.desc': 'No data. Add alerts by SMS, QR code or share sheet.',
  'status.stubbed': 'Status detection arrives in M3.',

  // ---- Language selector ---------------------------------------------------
  'lang.label': 'Language',
  'lang.change': 'Change language',
  'lang.search': 'Search languages',

  // ---- Placeholder pages ---------------------------------------------------
  'page.home.title': 'Home',
  'page.home.intro':
    'Kavach keeps verified, translated crisis alerts working even when the network does not.',

  // ---- Home promises -------------------------------------------------------
  'home.promise.heading': 'What works offline',
  'home.signed.title': 'Signed alerts',
  'home.signed.desc':
    'Official warnings are cryptographically signed and verified on your device — no server needed to trust them.',
  'home.nodata.title': 'Works with no data',
  'home.nodata.desc':
    'The map, shelters and first-aid guide are stored on the device before you need them.',
  'home.noinstall.title': 'Nothing to install',
  'home.noinstall.desc':
    'Scan a QR code at your hotel or airport. It runs in the browser and saves itself.',
  'home.relay.title': 'Relay mode',
  'home.relay.desc':
    'Even with zero data, alerts arrive over SMS or a shared QR code and stay verifiable.',
  'page.alerts.title': 'Alerts',
  'page.alerts.intro': 'Signed official alerts. Arriving in M4 and M7.',
  'page.map.title': 'Map',
  'page.map.intro': 'Shelters, hospitals and hazard zones — offline. Arriving in M8.',
  'page.assist.title': 'Assist',
  'page.assist.intro': 'Grounded answers, never invented. Arriving in M10.',
  'page.aid.title': 'First aid & SOS',
  'page.aid.intro': 'First-aid steps, medical ID and one-tap SOS. Arriving in M10.',
  'page.phrases.title': 'Phrasebook',
  'page.phrases.intro': 'Show-a-local cards with read-aloud. Arriving in M10.',
  'page.me.title': 'Me',
  'page.me.intro': 'Medical ID, check-ins and settings. Arriving in M9 and M10.',
  'page.report.title': 'Report a hazard',
  'page.report.intro': 'Community reports are never official alerts. Arriving in M9.',
  'page.authority.title': 'Authority console',
  'page.authority.intro': 'Issue signed alerts and drills. Arriving in M6.',
  'page.packet.title': 'Alert packet',
  'page.packet.intro': 'Signed alert packets arrive here.',
  'page.packet.received': 'Packet from link',
  'page.packet.empty':
    'No packet in this link. Open a link shared by an authority, or scan the QR code, to see a verified alert here.',
  'page.packet.m4note':
    'In M4 this screen will decode the packet, verify its ECDSA P-256 signature against the bundled public key, check expiry, and render the hazard in your chosen language — all offline.',

  // ---- Authority console ---------------------------------------------------
  'page.authority.heading': 'Sign, issue, and label honestly',
  'page.authority.signing':
    'Alerts issued here are signed with ECDSA P-256 on the server. The private key never leaves Supabase secrets. Every alert this console produces is verifiable offline by any tourist device.',
  'page.authority.drill':
    'Because real disasters cannot be summoned during a demo, this console has a clearly labelled DRILL mode. Drills are watermarked in the UI and in the signed packet itself. Nothing fake is ever shown as real.',

  // ---- Shared UI -----------------------------------------------------------
  'ui.comingSoon': 'Planned',
  'ui.back': 'Back',
  'ui.close': 'Close',
  'ui.cancel': 'Cancel',
  'ui.confirm': 'Confirm',
  'ui.retry': 'Try again',
  'ui.copy': 'Copy',
  'ui.copied': 'Copied',
  'ui.share': 'Share',
  'ui.loading': 'Loading',
  'ui.error': 'Something went wrong',
  'ui.offlineNotice': 'You are offline. This screen uses data stored on your device.',

  // ---- Accessibility labels (icon-only controls) ---------------------------
  'a11y.skipToContent': 'Skip to main content',
  'a11y.mainContent': 'Main content',
  'a11y.navigation': 'Main navigation',
  'a11y.connectionStatus': 'Connection status: {status}',
  'a11y.selectLanguage': 'Select language, currently {language}',
  'a11y.placeholderIcon': '{page} icon',
}
