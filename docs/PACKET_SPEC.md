# PACKET_SPEC.md — Kavach Signed Alert Packet Specification

**Version:** 1.0 (KV1)  
**Status:** Canonical Reference

---

## 1. Overview & Constraints

Kavach alerts must be capable of traveling over low-bandwidth, out-of-band channels during infrastructure failure:
- **SMS:** Must fit within a standard 160-character GSM 7-bit / single SMS message.
- **QR Code:** Fits in Version 2–4 QR codes for rapid, error-tolerant scanning.
- **AirDrop / Web Share / Nearby Share / Bluetooth:** Transportable as plain text links (`https://kavach.org/#/a/<packet>`).
- **Offline Trust:** Verified on-device using ECDSA P-256 (FIPS 186-4) public keys bundled in the application without internet access.

---

## 2. Packet Anatomy

A complete Kavach packet string consists of a **Payload** and a **Signature**, joined by a period (`.`):

```
<Payload>.<Signature>
```

### 2.1 Payload Format (9 fields joined by `.`)

```
KV1.<kid>.<hazard>.<level>.<zones>.<issuedMin>.<expiresMin>.<seq>.<mode>
```

| Field Index | Name | Format / Values | Description | Example |
|---|---|---|---|---|
| `0` | **Version** | `KV1` | Protocol format identifier | `KV1` |
| `1` | **Key ID (`kid`)** | `[a-zA-Z0-9_-]{1,16}` | Identifies authority public key for rotation | `k1` |
| `2` | **Hazard Code** | `FL` \| `CY` \| `HT` \| `WN` \| `LS` \| `AC` | `FL` (Flood), `CY` (Cyclone), `HT` (Heat), `WN` (Wind), `LS` (Landslide), `AC` (All-Clear) | `FL` |
| `3` | **Alert Level** | `0` \| `1` \| `2` \| `3` \| `4` | `0` = All-clear / Cancel, `1` = Advisory, `2` = Watch, `3` = Warning, `4` = Extreme Emergency | `3` |
| `4` | **Zones** | `Z[0-9]+(-Z[0-9]+)*` | Hyphen-separated target region alert zone IDs | `Z1-Z3` |
| `5` | **Issued Time** | Base36 Unix minutes (`Math.floor(epochMs / 60000)`) | Alert creation timestamp | `q1a2b` |
| `6` | **Expiry Time** | Base36 Unix minutes (`Math.floor(epochMs / 60000)`) | Timestamp after which alert expires | `q1b3c` |
| `7` | **Sequence (`seq`)** | Base36 integer (`0-z...`) | Monotonically increasing sequence per hazard/zone to supersede older alerts | `1c` |
| `8` | **Mode** | `L` \| `D` | `L` = Live Official Alert, `D` = Drill / Exercise | `L` |

### 2.2 Signature Format

- **Algorithm:** ECDSA using curve **P-256** (secp256r1 / prime256v1) with **SHA-256**.
- **Signature Binary:** Raw IEEE P1363 format (fixed 64 bytes: 32-byte `r` + 32-byte `s`).
- **Signature Encoding:** Standard URL-safe Base64 (`base64url`), with **no padding (`=`)** and `+`/`/` replaced with `-`/`_`.
- **Length:** 64 bytes binary encodes to exactly **86 characters** of base64url.

---

## 3. Example Full Packet & Length Budget

```text
KV1.k1.FL.3.Z1-Z3.t9b2s.t9c0m.1.L.MEUCIQDxv1...86charsBase64UrlSignature...
```

- Payload Length: ~35–45 characters
- Delimiter: 1 character (`.`)
- Signature Length: 86 characters
- **Total Packet Length:** **~122–132 characters** (well within the 160-character single-SMS threshold).

---

## 4. Deep Link & Share URL

```
https://<domain>/#/a/<packet>
```

When tapped or scanned, the `/#/a/` hash route executes client-side WebCrypto verification offline and renders the localized action card.

---

## 5. Verification Rules & Failure Reasons

The verification function must return a discriminated result and never throw an unhandled exception:

```typescript
export type PacketVerifyFailureReason =
  | 'format'          // Malformed string, missing fields, invalid characters
  | 'unknown-kid'     // Key ID not present in bundled authority keys
  | 'signature'       // Cryptographic signature invalid or payload tampered
  | 'expired'         // Alert expiration time is in the past
  | 'not-yet-valid'   // Alert issuance time is in the future beyond tolerance
```

### Clock Tolerance Policy:
- Devices in disaster areas often have skewed system clocks.
- A default clock skew tolerance of **10 minutes** is permitted for `not-yet-valid` checks.
- If an alert is valid cryptographically but triggered a clock skew warning, the UI renders the alert with a prominent date/time caution banner rather than dropping it.

---

## 6. Alert Superseding & Replay Logic

1. **Zone & Hazard Grouping:** Alerts are grouped by `(hazard, zoneId)`.
2. **Sequence Precedence:** Higher `seq` supersedes any lower `seq` for the same hazard and zone.
3. **Cancellation:** An alert with `level: 0` or hazard `AC` cancels all active alerts for the specified zones.
4. **Expiry:** Alerts where `expiresAt < (now - tolerance)` are culled.
5. **Drill Isolation:** Drill alerts (`mode: 'D'`) are isolated and visually watermarked.
