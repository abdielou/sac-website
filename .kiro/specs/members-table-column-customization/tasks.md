# Implementation Plan: Members Table Column Customization

## Overview

This implementation adds column customization to the Admin Members table by creating a column registry system, a column selector UI component, localStorage-based persistence, and dynamic table rendering. The approach is incremental: first establish the column infrastructure, then add the UI controls, then integrate persistence, and finally update CSV export.

## Tasks

- [x] 1. Create column registry and configuration system
  - Create a new file `lib/admin/columnRegistry.js` with the COLUMN_REGISTRY constant
  - Define all available columns with id, label, accessor, formatter, and defaultVisible properties
  - Include all 8 current default columns plus additional fields (phone, id, name, monthsSincePayment, lastPaymentAmount, lastPaymentNotes, lastPaymentSource)
  - Export helper functions: getDefaultColumnIds(), getColumnById(id)
  - _Requirements: 1.1, 1.2, 1.3, 3.2_

- [ ]* 1.1 Write property test for accessor functions
  - **Property 2: Accessor functions extract values safely**
  - **Validates: Requirements 1.2, 1.4**

- [ ]* 1.2 Write property test for formatter functions
  - **Property 3: Formatters produce valid output**
  - **Validates: Requirements 1.5**

- [x] 2. Create useColumnPreferences custom hook
  - Create `lib/hooks/useColumnPreferences.js`
  - Implement state management for visible column IDs
  - Implement localStorage persistence with STORAGE_KEY = 'admin_members_columns'
  - Add error handling for localStorage failures (try-catch with fallback to defaults)
  - Implement toggleColumn function with last-column protection
  - Implement resetToDefault function
  - Return: { visibleColumns, visibleColumnIds, toggleColumn, resetToDefault }
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 7.4_

- [ ]* 2.1 Write property test for localStorage round-trip
  - **Property 7: localStorage persistence round-trip**
  - **Validates: Requirements 4.1, 4.2, 4.4**

- [ ]* 2.2 Write property test for last column protection
  - **Property 8: Prevent hiding all columns**
  - **Validates: Requirements 7.4**

- [ ]* 2.3 Write unit tests for edge cases
  - Test localStorage unavailable (mock localStorage to throw)
  - Test corrupted JSON in localStorage
  - Test invalid data types in localStorage
  - _Requirements: 4.3, 4.5_

- [x] 3. Create ColumnSelector component
  - Create `components/admin/ColumnSelector.js`
  - Implement dropdown/popover UI with button trigger
  - Display checkboxes for all available columns from registry
  - Show visual indicator (checkmark) for visible columns
  - Display count of visible columns (e.g., "8 columns visible")
  - Add "Reset to Default" button
  - Handle checkbox onChange to call toggleColumn
  - Add keyboard accessibility (tab navigation, enter/space to toggle)
  - Add ARIA labels for accessibility
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 7.1, 7.5, 7.6_

- [ ]* 3.1 Write property test for UI state reflection
  - **Property 5: UI state reflects visible columns**
  - **Validates: Requirements 2.4**

- [ ]* 3.2 Write property test for visible column count
  - **Property 9: Visible column count accuracy**
  - **Validates: Requirements 7.5**

- [ ]* 3.3 Write unit test for reset functionality
  - Test that reset button restores exact default column set
  - _Requirements: 2.5, 3.4_

- [x] 4. Integrate column customization into MembersContent
  - Import COLUMN_REGISTRY and useColumnPreferences hook
  - Add useColumnPreferences hook call to get visibleColumns, toggleColumn, resetToDefault
  - Add ColumnSelector component to the filters section (next to CSV button)
  - Pass necessary props to ColumnSelector
  - _Requirements: 2.1, 3.1_

- [x] 5. Update table rendering to use dynamic columns
  - Modify desktop table <thead> to map over visibleColumns instead of hardcoded headers
  - Modify desktop table <tbody> to map over visibleColumns for each row
  - Apply accessor functions and formatters from column definitions
  - Handle null/undefined values with fallback to "-"
  - Keep the Actions column as the last column (not part of customization)
  - Preserve existing features: copy email buttons, StatusBadge, PaymentTooltip, MemberActions
  - _Requirements: 1.2, 1.4, 1.5, 2.3_

- [ ]* 5.1 Write property test for column toggle updates
  - **Property 4: Column toggle updates visible columns list**
  - **Validates: Requirements 2.3**

- [ ]* 5.2 Write unit tests for table rendering
  - Test that table renders correct number of columns
  - Test that null values display as "-"
  - Test that formatters are applied correctly
  - _Requirements: 1.4, 1.5_

- [x] 6. Checkpoint - Verify core functionality
  - Ensure all tests pass
  - Manually test: open column selector, toggle columns, verify table updates
  - Manually test: reload page, verify preferences persist
  - Ask the user if questions arise

- [x] 7. Update CSV export to respect column selection
  - Modify handleExportCsv function to build columns array from visibleColumns
  - Map each visible column to CSV column format: { key, label, value }
  - Use column accessor and formatter functions for value extraction
  - Maintain column order from visibleColumns
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ]* 7.1 Write property test for CSV column matching
  - **Property 10: CSV columns match visible table columns**
  - **Validates: Requirements 6.1, 6.2, 6.3, 6.5**

- [ ]* 7.2 Write unit test for default CSV export
  - Test that CSV with default columns matches current export behavior
  - _Requirements: 6.4_

- [x] 8. Verify mobile responsiveness
  - Confirm mobile card layout (md breakpoint and below) is unaffected
  - Confirm ColumnSelector is hidden or disabled on mobile
  - Add responsive classes if needed to hide column selector on mobile
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 9. Final checkpoint - Complete testing and verification
  - Ensure all tests pass
  - Test full user flow: select columns → verify table → export CSV → reload → verify persistence
  - Test with various column combinations
  - Test localStorage error scenarios
  - Ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests should run minimum 100 iterations using fast-check library
- The Actions column remains fixed and is not part of column customization
- Mobile card layout remains unchanged by this feature
- All localStorage operations must have error handling with fallback to defaults
