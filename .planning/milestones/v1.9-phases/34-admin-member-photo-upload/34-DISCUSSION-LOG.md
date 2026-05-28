# Phase 34: Admin Member Photo Upload - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-01
**Phase:** 34-admin-member-photo-upload
**Areas discussed:** Phase approach, Camera support, Member name display, Old photo behavior, Success UX, Camera hiding mechanism, File size validation, Resolution capping

---

## Phase Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Review & plan what's there | Walk through the implementation, capture decisions in CONTEXT.md, create a formal plan matching the code, then commit | ✓ |
| Add camera support too | The ROADMAP says 'same PhotoUpload/CropModal as member profile' which includes camera. Add camera before planning. | |
| Skip to planning | The implementation looks correct. Skip deep discussion and go straight to /gsd-plan-phase 34 | |

**User's choice:** Review & plan what's there
**Notes:** 4 files already written in uncommitted changes covering the full feature.

---

## Camera Support

| Option | Description | Selected |
|--------|-------------|----------|
| File only (current) | Admins upload from their device. Camera is disabled — the modal says 'No se usa camara en este flujo.' | ✓ |
| File + camera | Match the member profile PhotoUpload exactly, including camera capture. | |

**User's choice:** File only (current)
**Notes:** Simpler for desktop admin workflow. Admins can snap photos on their phone and upload from device if needed.

---

## Member Name in Modal Header

| Option | Description | Selected |
|--------|-------------|----------|
| Show member name | Modal shows member name so admin knows who they're uploading for | ✓ |
| Keep without name | Keep as-is. The admin just clicked the row — context is fresh. | |

**User's choice:** Show member name
**Notes:** Format as "Subir foto — [firstName] [lastName] [slastName]"

---

## Old Photo Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Backup old photo (current) | Keep uploadPhoto() behavior: rename old file as _backup_ before uploading new one | ✓ |
| Delete old photo | Delete the old photo from Drive before uploading the new one | |

**User's choice:** Backup old photo (current)
**Notes:** Safe, recoverable. Already implemented in uploadPhoto().

---

## Success UX

| Option | Description | Selected |
|--------|-------------|----------|
| Toast notification | Visual toast/banner confirming 'Foto subida correctamente' | |
| Grid refresh only (current) | The grid row already updates via refetch() — the photo status flips from 'Sin foto' | ✓ |

**User's choice:** Grid refresh only (current)
**Notes:** The photo indicator flipping from "Sin foto" to "Si" is sufficient feedback.

---

## Camera Hiding Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Add hideCamera prop to PhotoUpload | Clean prop-based API to disable camera. Proper engineering. | ✓ |
| Fix the CSS selectors | Keep the CSS approach but fix the buggy selectors | |

**User's choice:** Add hideCamera prop to PhotoUpload
**Notes:** The CSS `button:has(svg)` approach is fragile and also hides the file upload button. A proper prop is cleaner.

---

## File Size Validation

| Option | Description | Selected |
|--------|-------------|----------|
| Add 5MB limit | Match member profile route's 5MB limit for consistency | ✓ |
| No limit or larger | Admins might need higher quality photos | |

**User's choice:** Add 5MB limit
**Notes:** Consistency with member profile route.

---

## Resolution Capping

| Option | Description | Selected |
|--------|-------------|----------|
| Cap at 1024px in `getCroppedImg()` | Scale crop output so longest side is 1024px before JPEG encoding. Applies to both member and admin flows. | ✓ |
| Cap in each API route | Validate/resize server-side per-route. Duplicated logic. | |
| No cap — upload as-is | Risk: multi-megapixel crops waste Drive storage and slow photo proxy. | |

**User's choice:** Cap at 1024px in `getCroppedImg()`
**Notes:** ID cards need ~1012×638 at 300 DPI, thumbnails even less. 1024px is generous headroom. Applied at crop time (client-side) so it benefits all flows. Admin route also needs the missing 5MB check added (D-04).

---

## Claude's Discretion

- hideCamera prop design on PhotoUpload (boolean only, or object with custom button labels)
- Member name formatting in modal header
