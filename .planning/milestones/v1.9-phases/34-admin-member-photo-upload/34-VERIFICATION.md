---
phase: 34-admin-member-photo-upload
---

# Phase 34 — Verification

## Automated checks
- `npm test`
- `npm run build`

## Manual UAT (admin-only)
1. Sign in as an admin.
2. Go to the admin members grid.
3. For any member row:
   - Click `MemberActions` dropdown.
   - Click **“Subir foto”**.
4. Verify modal:
   - Shows a file picker.
   - Does **not** show any camera button (no “Tomar foto”).
5. Select an image file and confirm crop.
6. Verify upload pipeline:
   - After success, modal closes.
   - Member row refreshes and displays updated photo state (photoFileId updated).

## Negative cases
1. Upload without selecting a file: modal should not proceed.
2. Drive upload failure: modal stays open and shows error.
3. Sheets update failure: modal stays open and shows error.
