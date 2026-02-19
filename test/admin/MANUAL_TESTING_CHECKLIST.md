# Manual Testing Checklist - Members Table Column Customization

## Test Environment
- Browser: Chrome/Firefox/Safari
- URL: http://localhost:3000/admin/members
- User: Admin with appropriate permissions

## Test Scenarios

### 1. Initial Load (Default Columns)
- [ ] Navigate to /admin/members
- [ ] Verify table displays 8 default columns:
  - Email
  - SAC Email
  - Nombre
  - Inicial
  - Apellidos
  - Vencimiento
  - Estado
  - Ultimo Pago
- [ ] Verify "8 columnas" button is visible (desktop only)
- [ ] Verify mobile card layout is displayed on mobile devices

### 2. Column Selector UI
- [ ] Click the "8 columnas" button
- [ ] Verify dropdown opens with all available columns
- [ ] Verify checkmarks appear next to visible columns
- [ ] Verify all 15 columns are listed:
  - Email ✓
  - SAC Email ✓
  - Nombre ✓
  - Inicial ✓
  - Apellidos ✓
  - Vencimiento ✓
  - Estado ✓
  - Ultimo Pago ✓
  - Teléfono
  - ID
  - Nombre Completo
  - Meses Sin Pago
  - Monto Ultimo Pago
  - Notas Ultimo Pago
  - Fuente Ultimo Pago
- [ ] Verify "Restablecer por defecto" button is present

### 3. Toggle Columns
- [ ] Uncheck "Inicial" column
- [ ] Verify table immediately updates (Inicial column disappears)
- [ ] Verify column count updates to "7 columnas"
- [ ] Check "Teléfono" column
- [ ] Verify table immediately updates (Teléfono column appears)
- [ ] Verify column count updates to "8 columnas"
- [ ] Toggle multiple columns and verify table updates each time

### 4. Last Column Protection
- [ ] Uncheck all columns except one
- [ ] Try to uncheck the last remaining column
- [ ] Verify the checkbox remains checked (disabled state)
- [ ] Verify the column remains visible in the table

### 5. Persistence (localStorage)
- [ ] Select a custom column configuration (e.g., Email, Nombre, Teléfono, ID)
- [ ] Note the visible columns
- [ ] Refresh the page (F5 or Ctrl+R)
- [ ] Verify the same columns are still visible
- [ ] Verify the column count matches

### 6. Reset to Default
- [ ] With custom columns selected, click "Restablecer por defecto"
- [ ] Verify table resets to 8 default columns
- [ ] Verify column count shows "8 columnas"
- [ ] Refresh the page
- [ ] Verify default columns persist after reload

### 7. CSV Export with Custom Columns
- [ ] Select custom columns (e.g., Email, Nombre, Estado, Teléfono)
- [ ] Click the CSV export button
- [ ] Open the downloaded CSV file
- [ ] Verify CSV contains ONLY the selected columns
- [ ] Verify column headers match table headers
- [ ] Verify column order matches table order
- [ ] Verify data is properly formatted (dates, currency, etc.)

### 8. CSV Export with Default Columns
- [ ] Reset to default columns
- [ ] Click the CSV export button
- [ ] Open the downloaded CSV file
- [ ] Verify CSV contains all 8 default columns
- [ ] Verify this matches the previous export behavior

### 9. Various Column Combinations
Test with different combinations:
- [ ] All columns visible (15 columns)
- [ ] Only email and name columns
- [ ] Only payment-related columns (Ultimo Pago, Monto Ultimo Pago, etc.)
- [ ] Mix of default and additional columns
- [ ] Verify table renders correctly for each combination
- [ ] Verify horizontal scrolling works when many columns are visible

### 10. localStorage Error Scenarios

#### Private Browsing Mode
- [ ] Open browser in private/incognito mode
- [ ] Navigate to /admin/members
- [ ] Verify default columns are displayed
- [ ] Toggle columns
- [ ] Verify table updates (even if not persisted)
- [ ] Check browser console for error messages (should be logged but not break functionality)

#### localStorage Quota Exceeded (Simulated)
- [ ] Open browser DevTools
- [ ] Go to Application/Storage tab
- [ ] Fill localStorage with large data to approach quota
- [ ] Toggle columns
- [ ] Verify functionality continues to work
- [ ] Check console for error messages

#### Corrupted localStorage Data
- [ ] Open browser DevTools
- [ ] Go to Application/Storage → localStorage
- [ ] Find key "admin_members_columns"
- [ ] Manually edit to invalid JSON (e.g., "invalid json")
- [ ] Refresh the page
- [ ] Verify default columns are displayed (fallback)
- [ ] Toggle a column
- [ ] Verify localStorage is now valid again

### 11. Responsive Design
- [ ] Desktop (>768px): Verify column selector is visible
- [ ] Desktop: Verify table uses dynamic columns
- [ ] Mobile (<768px): Verify column selector is hidden
- [ ] Mobile: Verify card layout is displayed
- [ ] Mobile: Verify card layout shows hardcoded fields (unaffected by column selection)
- [ ] Resize browser window and verify breakpoint behavior

### 12. Keyboard Accessibility
- [ ] Tab to the "columnas" button
- [ ] Press Enter or Space to open dropdown
- [ ] Tab through column checkboxes
- [ ] Use Space to toggle checkboxes
- [ ] Press Escape to close dropdown
- [ ] Verify focus management is correct

### 13. Data Handling
- [ ] Verify null values display as "-"
- [ ] Verify empty strings display as "-"
- [ ] Verify date formatting is applied correctly
- [ ] Verify currency formatting is applied correctly
- [ ] Verify special columns (Email, Status, Ultimo Pago) render with special components

### 14. Integration with Existing Features
- [ ] Apply status filters and verify column customization still works
- [ ] Use search and verify column customization still works
- [ ] Change pagination and verify column customization persists
- [ ] Verify member actions (dropdown menu) still work
- [ ] Verify copy email buttons still work
- [ ] Verify payment tooltips still work

### 15. Performance
- [ ] Toggle columns rapidly
- [ ] Verify no lag or performance issues
- [ ] Verify table re-renders smoothly
- [ ] Check for console errors or warnings

## Test Results

### Date: _______________
### Tester: _______________
### Browser: _______________
### Result: PASS / FAIL

### Notes:
_______________________________________________________________________
_______________________________________________________________________
_______________________________________________________________________

## Issues Found
1. _________________________________________________________________
2. _________________________________________________________________
3. _________________________________________________________________
