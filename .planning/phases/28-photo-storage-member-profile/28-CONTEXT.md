# Phase 28: Photo Storage & Member Profile - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Members can view their profile, edit contact and equipment info, and upload a profile photo stored in Google Drive. The existing admin dashboard is repurposed as a shared dashboard — admins see admin tabs + profile tab, members see profile tab (+ future member tabs). ID card preview on the profile page is Phase 29.

</domain>

<decisions>
## Implementation Decisions

### Dashboard architecture
- Reuse the existing admin dashboard layout (sidebar, header, nav tabs) as a shared dashboard
- Rename from "admin-only" to role-aware: admins see all existing tabs + Perfil, members see Perfil (+ future member tabs)
- Admins are also members — they get a profile too
- Design the tab system so adding more member tabs later is straightforward

### Profile page layout
- Read-only display by default, with an "Editar" button to switch to edit mode
- Photo placement: Claude's discretion
- Profile shows: name, email, membership status, expiration date, member-since date, contact info, equipment info

### Photo upload experience
- Two separate buttons: "Subir foto" (upload from device) and "Tomar foto" (camera capture)
- After selecting/capturing, opens a modal with crop tool (drag, zoom, confirm/cancel)
- Crop shape defaults to square — will adjust to match ID card template dimensions when defined in Phase 29
- Photo is staged locally after crop, NOT uploaded immediately
- Photo uploads to Drive when user saves the entire profile (single save action)

### Editable fields & saving
- Name is editable (member can override the name from their Google account)
- Editable contact fields: phone, town, postal address, zipcode
- Editable equipment fields: telescope model, other equipment
- Read-only fields: email, membership status, expiration, member-since date
- Edits saved via Direct Sheets API (Next.js API route writes to spreadsheet), not Apps Script
- Scope guard: API verifies session email matches the spreadsheet row being edited (strict 1:1 email match)

### Drive storage model
- Shared folder approach: create a Drive folder, share it with the service account email (no domain-wide delegation)
- Folder shared with board members + service account — not visible to regular members
- Photos named by email (e.g., juan.perez@sociedadastronomia.com.jpg)
- Photos served to authenticated members only via API route proxy (PHOTO-02)
- Photo file ID tracked in spreadsheet CLEAN sheet (photoFileId column) (PHOTO-03)
- When member uploads new photo, old version is kept (renamed with timestamp suffix), not overwritten

### Claude's Discretion
- Photo placement on profile page (left sidebar vs top vs integrated)
- Whether profile fields + photo save together in one action or separately
- Loading states, error handling, and validation rules
- Exact form layout and grouping within the profile tab

</decisions>

<specifics>
## Specific Ideas

No specific references — open to standard approaches. Key constraint: the dashboard layout must feel unified for both admin and member roles, not like two separate apps.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 28-photo-storage-member-profile*
*Context gathered: 2026-02-26*
