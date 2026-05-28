# Phase 34: Admin Member Photo Upload - Context

**Gathered:** 2026-05-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Admins can upload profile photos for members from the dashboard. Clicking "Subir foto" in the MemberActions dropdown opens a modal with the PhotoUpload/CropModal components (same UX as member profile), crops the photo, uploads it to Google Drive, and updates the member's photoFileId in Google Sheets. File-only (no camera for admins).

</domain>

<decisions>
## Implementation Decisions

### Upload Flow (locked)
- **D-01:** File-only upload — no camera capture for admins. `PhotoUpload` gets a `hideCamera` prop to cleanly disable camera buttons.
- **D-02:** Modal shows member's full name in header (not just "Subir foto del miembro").
- **D-03:** Old photo backup via existing `uploadPhoto()` behavior — renames old file as `_backup_` before uploading new one. No deletion.

### Validation (locked)
- **D-04:** File size limit of 5MB (matches member profile route). Admin route currently missing this — must be added.
- **D-05:** File type must start with `image/` (already in code).
- **D-08:** Cropped photo is capped at **1024px on the longest side** before JPEG encoding. Applied in `getCroppedImg()` so both member and admin flows benefit. Photos are used for ID cards (~1012×638 at 300 DPI) and profile thumbnails; anything beyond 1024px is unnecessary.

### Success UX (locked)
- **D-06:** Grid refresh via `refetch()` is sufficient — no toast/snackbar. The photo indicator flips from "Sin foto" to "Si" in the grid row.

### Permissions (locked)
- **D-07:** Guarded by `canEditMember` (already in MemberActions). API route uses `canAccessDashboard()`.

### Claude's Discretion
- The `hideCamera` prop design on PhotoUpload (just `hideCamera` boolean, or also custom button labels)
- Member name formatting in modal header (first name + last names)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Photo Upload Infrastructure
- `lib/google-drive.js` — `uploadPhoto(email, buffer, mimeType)`, `getPhoto(fileId)`
- `lib/google-sheets.js` — `updateMemberProfile(email, fields)` with photoFileId support

### Reusable Components
- `components/member/PhotoUpload.js` — File picker + camera + CropModal. Needs `hideCamera` prop added.
- `components/member/CropModal.js` — Wraps react-easy-crop for circular crop.

### Existing Patterns
- `app/api/member/profile/route.js` (PUT) — Multipart upload with photo validation (5MB limit, image/ type check), Drive upload, sheet update
- `app/api/admin/members/[email]/photo/route.js` — Already written, needs 5MB limit added
- `components/admin/MemberActions.js` — "Subir foto" option, `PHOTO` paymentType
- `app/admin/members/page.js` — `MembersContent` wires `MemberPhotoUploadModal` with `handleActionWithPhoto`
- `components/admin/MemberPhotoUploadModal.js` — Modal wrapper, needs member name and hideCamera integration

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PhotoUpload` / `CropModal` — Already reused by `MemberPhotoUploadModal`. PhotoUpload needs `hideCamera` prop.
- `uploadPhoto()` — Same Drive upload function used by member profile. Handles backup renaming internally.
- `updateMemberProfile()` — Same sheet update used by member profile. Handles photoFileId header if missing.

### Established Patterns
- Admin API auth: `auth(async function POST(req, { params })` with `canAccessDashboard(adminEmail)`
- Spanish error messages: `'No autenticado'`, `'Permiso denegado'`, `'Archivo vacio'`, `'Miembro no encontrado'`
- FormData parsing: `req.formData()`, `formData.get('photo')`
- Response shape: `{ success: true, photoFileId: fileId }`

### Integration Points
- `MemberActions` kebab menu → `handleActionWithPhoto` → `handleOpenPhotoModal` → `MemberPhotoUploadModal`
- `MemberPhotoUploadModal` → `POST /api/admin/members/[email]/photo` → Drive upload + sheet update
- On success: `onSuccess={() => refetch()}` refreshes member grid

</code_context>

<specifics>
## Specific Ideas

- Add `hideCamera` prop to PhotoUpload: when true, hide the "Tomar foto" button and camera viewfinder. Prop can also accept `{ fileLabel?: string }` for custom button labels if desired.
- Modal header: format as `[firstName] [lastName] [slastName]` — "Subir foto — [fullName]"
- The 4 files are already written in uncommitted changes. Planning will identify any gaps vs. these decisions.
- Photo upload API route is at `app/api/admin/members/[email]/photo/route.js` (dynamic route, POST only).
- Auth: `canAccessDashboard()` check (admin gate), not individual `canEditMember` — API trusts admin role.
- **Resolution cap (D-08):** In `getCroppedImg()` (`components/member/CropModal.js:14-51`), after `ctx.drawImage()` and before `canvas.toBlob()`, if either dimension exceeds 1024px, scale the canvas down proportionally so the longest side is 1024px. This applies to both member and admin flows.

</specifics>

<deferred>
## Deferred Ideas

- Camera capture for admin photo upload — file-only confirmed for this phase. Admins can snap photos on their phone and upload from device.
- Toast/snackbar notification on successful upload — grid refresh is sufficient per discussion.
- Bulk photo upload for multiple members — separate capability, its own phase.

</deferred>

---
*Phase: 34-admin-member-photo-upload*
*Context gathered: 2026-05-01 via discuss-phase session*
