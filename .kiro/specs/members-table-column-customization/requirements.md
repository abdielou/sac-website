# Requirements Document

## Introduction

This feature adds column customization capabilities to the Admin panel Members table, allowing users to select which columns they want to display from all available member data fields. The current implementation displays a fixed set of 8 columns, but the data source provides many additional fields that users may want to view. This feature will make all available columns selectable while maintaining the current default view and persisting user preferences.

## Glossary

- **Members_Table**: The desktop table view in the Admin panel at app/admin/members/page.js that displays member information
- **Column_Settings_Control**: A UI component that allows users to select which columns to display in the Members_Table
- **Available_Columns**: All data fields provided by the getMembers function including: id, email, phone, sacEmail, name, firstName, initial, lastName, slastName, expirationDate, status, monthsSincePayment, lastPaymentAmount, lastPaymentDate, lastPaymentNotes, lastPaymentSource, and _raw
- **Default_Columns**: The current set of displayed columns: Email, SAC Email, Nombre, Inicial, Apellidos, Vencimiento, Estado, Ultimo Pago
- **Column_Preferences**: User's selected column configuration stored in localStorage
- **Mobile_Card_Layout**: The responsive card-based view used on mobile devices (md breakpoint and below)
- **CSV_Export**: The downloadable CSV file generated from the members data

## Requirements

### Requirement 1: Display All Available Columns

**User Story:** As an admin user, I want access to all available member data fields as displayable columns, so that I can view comprehensive member information.

#### Acceptance Criteria

1. THE Members_Table SHALL make all Available_Columns available for display selection
2. WHEN the Members_Table renders, THE system SHALL map all data fields from getMembers to displayable columns
3. THE system SHALL provide human-readable labels for all Available_Columns
4. THE system SHALL handle null or missing values gracefully for all columns
5. THE system SHALL maintain proper data formatting for each column type (dates, currency, text)

### Requirement 2: Column Settings Control

**User Story:** As an admin user, I want a column settings control, so that I can easily select which columns to display.

#### Acceptance Criteria

1. THE Members_Table SHALL display a Column_Settings_Control that is easily accessible
2. WHEN a user interacts with the Column_Settings_Control, THE system SHALL display all Available_Columns with checkboxes
3. WHEN a user toggles a column checkbox, THE Members_Table SHALL immediately update to show or hide that column
4. THE Column_Settings_Control SHALL indicate which columns are currently visible
5. THE Column_Settings_Control SHALL provide a way to reset to Default_Columns
6. THE Column_Settings_Control SHALL remain accessible while scrolling through the table

### Requirement 3: Default Column Configuration

**User Story:** As an admin user, I want the current column selection to remain as the default, so that the interface remains familiar.

#### Acceptance Criteria

1. WHEN a user first visits the Members_Table without saved Column_Preferences, THE system SHALL display Default_Columns
2. THE Default_Columns SHALL include: Email, SAC Email, Nombre, Inicial, Apellidos, Vencimiento, Estado, Ultimo Pago
3. THE system SHALL maintain the current column order for Default_Columns
4. WHEN a user resets column settings, THE system SHALL restore Default_Columns

### Requirement 4: Persist Column Preferences

**User Story:** As an admin user, I want my column selections to be remembered, so that I don't have to reconfigure them each time I visit the page.

#### Acceptance Criteria

1. WHEN a user changes column visibility, THE system SHALL save Column_Preferences to localStorage
2. WHEN a user returns to the Members_Table, THE system SHALL load Column_Preferences from localStorage
3. IF localStorage is unavailable or fails, THEN THE system SHALL fall back to Default_Columns and continue functioning
4. THE system SHALL store Column_Preferences as a JSON array of column identifiers
5. WHEN Column_Preferences are invalid or corrupted, THE system SHALL fall back to Default_Columns

### Requirement 5: Responsive Design Compatibility

**User Story:** As an admin user on mobile, I want the mobile card layout to continue working, so that I can view members on any device.

#### Acceptance Criteria

1. WHEN the viewport is at mobile breakpoint (md and below), THE system SHALL display the Mobile_Card_Layout
2. THE Mobile_Card_Layout SHALL remain unchanged by column customization features
3. THE Column_Settings_Control SHALL only affect the desktop Members_Table view
4. WHEN switching between mobile and desktop views, THE system SHALL maintain appropriate layouts

### Requirement 6: CSV Export Column Filtering

**User Story:** As an admin user, I want CSV exports to respect my column selection, so that I only export the data I'm viewing.

#### Acceptance Criteria

1. WHEN a user exports CSV with custom Column_Preferences, THE CSV_Export SHALL include only the visible columns
2. THE CSV_Export SHALL maintain the same column order as displayed in the Members_Table
3. THE CSV_Export SHALL use the same human-readable column labels as the Members_Table headers
4. WHEN a user has Default_Columns selected, THE CSV_Export SHALL match the current export behavior
5. THE CSV_Export SHALL handle all Available_Columns with proper formatting

### Requirement 7: Accessibility and Usability

**User Story:** As an admin user, I want the column settings to be intuitive and accessible, so that I can efficiently customize my view.

#### Acceptance Criteria

1. THE Column_Settings_Control SHALL be keyboard accessible
2. THE Column_Settings_Control SHALL provide clear visual feedback for interactions
3. WHEN columns are added or removed, THE Members_Table SHALL maintain horizontal scroll position when possible
4. THE system SHALL prevent users from hiding all columns
5. THE Column_Settings_Control SHALL display a count of visible columns
6. THE system SHALL provide appropriate ARIA labels for screen readers
