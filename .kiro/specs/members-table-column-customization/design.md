# Design Document: Members Table Column Customization

## Overview

This feature extends the Admin panel Members table to support user-configurable column visibility. The design introduces a column configuration system that allows users to show/hide any of the available member data fields while maintaining their preferences across sessions. The implementation will be React-based, leveraging existing patterns in the codebase (hooks, localStorage utilities, and component composition).

The core approach involves:
1. Defining a comprehensive column registry mapping all available data fields to display configurations
2. Creating a reusable column settings UI component (dropdown/modal with checkboxes)
3. Implementing localStorage-based preference persistence
4. Modifying the table rendering logic to dynamically generate columns based on user preferences
5. Updating CSV export to respect column selections

## Architecture

### Component Structure

```
MembersContent (existing)
├── Column Settings Control (new)
│   └── ColumnSelector component
├── Members Table (modified)
│   ├── Dynamic table headers
│   └── Dynamic table cells
└── CSV Export (modified)
```

### Data Flow

```
User Interaction → ColumnSelector
                      ↓
                 Update State
                      ↓
              Save to localStorage
                      ↓
           Re-render Table with new columns
                      ↓
              CSV Export respects selection
```

### State Management

- **Local Component State**: Current visible columns (array of column IDs)
- **localStorage**: Persisted column preferences
- **Default Fallback**: Hardcoded default column set

## Components and Interfaces

### Column Registry

A centralized configuration object that maps all available data fields to their display properties:

```typescript
interface ColumnDefinition {
  id: string                    // Unique identifier (matches data field)
  label: string                 // Display label for header
  accessor: (member) => any     // Function to extract value from member object
  formatter?: (value) => string // Optional formatting function
  sortable?: boolean            // Whether column supports sorting
  defaultVisible: boolean       // Whether included in default view
}

const COLUMN_REGISTRY: ColumnDefinition[] = [
  {
    id: 'email',
    label: 'Email',
    accessor: (m) => m.email,
    defaultVisible: true
  },
  {
    id: 'sacEmail',
    label: 'SAC Email',
    accessor: (m) => m.sacEmail,
    defaultVisible: true
  },
  {
    id: 'firstName',
    label: 'Nombre',
    accessor: (m) => m.firstName,
    defaultVisible: true
  },
  {
    id: 'initial',
    label: 'Inicial',
    accessor: (m) => m.initial,
    defaultVisible: true
  },
  {
    id: 'lastName',
    label: 'Apellidos',
    accessor: (m) => [m.lastName, m.slastName].filter(Boolean).join(' '),
    defaultVisible: true
  },
  {
    id: 'expirationDate',
    label: 'Vencimiento',
    accessor: (m) => m.expirationDate,
    formatter: formatDate,
    defaultVisible: true
  },
  {
    id: 'status',
    label: 'Estado',
    accessor: (m) => m.status,
    defaultVisible: true
  },
  {
    id: 'lastPayment',
    label: 'Ultimo Pago',
    accessor: (m) => m.lastPaymentDate,
    formatter: formatDate,
    defaultVisible: true
  },
  // New columns (not in default view)
  {
    id: 'phone',
    label: 'Teléfono',
    accessor: (m) => m.phone,
    defaultVisible: false
  },
  {
    id: 'id',
    label: 'ID',
    accessor: (m) => m.id,
    defaultVisible: false
  },
  {
    id: 'name',
    label: 'Nombre Completo',
    accessor: (m) => m.name,
    defaultVisible: false
  },
  {
    id: 'monthsSincePayment',
    label: 'Meses Sin Pago',
    accessor: (m) => m.monthsSincePayment,
    defaultVisible: false
  },
  {
    id: 'lastPaymentAmount',
    label: 'Monto Ultimo Pago',
    accessor: (m) => m.lastPaymentAmount,
    formatter: (v) => v ? `$${v}` : '-',
    defaultVisible: false
  },
  {
    id: 'lastPaymentNotes',
    label: 'Notas Ultimo Pago',
    accessor: (m) => m.lastPaymentNotes,
    defaultVisible: false
  },
  {
    id: 'lastPaymentSource',
    label: 'Fuente Ultimo Pago',
    accessor: (m) => m.lastPaymentSource,
    defaultVisible: false
  }
]
```

### ColumnSelector Component

A dropdown/popover component that displays checkboxes for all available columns:

```typescript
interface ColumnSelectorProps {
  availableColumns: ColumnDefinition[]
  visibleColumnIds: string[]
  onColumnToggle: (columnId: string) => void
  onReset: () => void
}

function ColumnSelector({
  availableColumns,
  visibleColumnIds,
  onColumnToggle,
  onReset
}: ColumnSelectorProps) {
  // Renders a button that opens a dropdown/popover
  // Dropdown contains:
  // - Checkbox list of all columns
  // - Visual indicator of which are selected
  // - "Reset to Default" button
  // - Count of visible columns
}
```

### useColumnPreferences Hook

A custom hook to manage column preferences with localStorage persistence:

```typescript
interface UseColumnPreferencesReturn {
  visibleColumns: ColumnDefinition[]
  visibleColumnIds: string[]
  toggleColumn: (columnId: string) => void
  resetToDefault: () => void
}

function useColumnPreferences(
  columnRegistry: ColumnDefinition[]
): UseColumnPreferencesReturn {
  const STORAGE_KEY = 'admin_members_columns'
  
  // Load initial state from localStorage or default
  const getInitialColumns = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          return parsed
        }
      }
    } catch (e) {
      console.error('Failed to load column preferences:', e)
    }
    return columnRegistry
      .filter(col => col.defaultVisible)
      .map(col => col.id)
  }
  
  const [visibleColumnIds, setVisibleColumnIds] = useState(getInitialColumns)
  
  // Save to localStorage whenever columns change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleColumnIds))
    } catch (e) {
      console.error('Failed to save column preferences:', e)
    }
  }, [visibleColumnIds])
  
  const toggleColumn = (columnId: string) => {
    setVisibleColumnIds(prev => {
      // Prevent hiding all columns
      if (prev.includes(columnId) && prev.length === 1) {
        return prev
      }
      
      return prev.includes(columnId)
        ? prev.filter(id => id !== columnId)
        : [...prev, columnId]
    })
  }
  
  const resetToDefault = () => {
    const defaultIds = columnRegistry
      .filter(col => col.defaultVisible)
      .map(col => col.id)
    setVisibleColumnIds(defaultIds)
  }
  
  const visibleColumns = columnRegistry.filter(col =>
    visibleColumnIds.includes(col.id)
  )
  
  return {
    visibleColumns,
    visibleColumnIds,
    toggleColumn,
    resetToDefault
  }
}
```

### Modified Table Rendering

The existing table structure will be modified to dynamically generate columns:

```typescript
// In MembersContent component
const { visibleColumns, visibleColumnIds, toggleColumn, resetToDefault } = 
  useColumnPreferences(COLUMN_REGISTRY)

// Table header generation
<thead>
  <tr>
    {visibleColumns.map(col => (
      <th key={col.id}>
        {col.label}
      </th>
    ))}
    <th>Acciones</th>
  </tr>
</thead>

// Table body generation
<tbody>
  {members.map(member => (
    <tr key={member.email}>
      {visibleColumns.map(col => (
        <td key={col.id}>
          {col.formatter 
            ? col.formatter(col.accessor(member))
            : col.accessor(member) || '-'
          }
        </td>
      ))}
      <td>
        <MemberActions member={member} onAction={handleAction} />
      </td>
    </tr>
  ))}
</tbody>
```

### CSV Export Modification

Update the CSV export function to use visible columns:

```typescript
const handleExportCsv = useCallback(async () => {
  setIsExporting(true)
  try {
    // ... fetch data ...
    
    // Build columns array from visible columns
    const columns = visibleColumns.map(col => ({
      key: col.id,
      label: col.label,
      value: col.formatter 
        ? (row) => col.formatter(col.accessor(row))
        : (row) => col.accessor(row)
    }))
    
    const csv = toCsv(json.data, columns)
    // ... download file ...
  } catch (err) {
    console.error('CSV export error:', err)
  } finally {
    setIsExporting(false)
  }
}, [visibleColumns, status, searchParam])
```

## Data Models

### Column Preference Storage Format

```typescript
// Stored in localStorage as JSON
{
  key: "admin_members_columns",
  value: ["email", "sacEmail", "firstName", "initial", "lastName", "expirationDate", "status", "lastPayment"]
}
```

### Column Definition Type

```typescript
type ColumnDefinition = {
  id: string
  label: string
  accessor: (member: Member) => any
  formatter?: (value: any) => string
  sortable?: boolean
  defaultVisible: boolean
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property Reflection

After analyzing all testable acceptance criteria, I've identified the following consolidations:

- **Redundancy 1**: Properties 2.5 and 3.4 both test reset functionality - can be combined into one property
- **Redundancy 2**: Properties 4.1 and 4.2 together form a round-trip property - can be combined
- **Redundancy 3**: Properties 6.2 and 6.3 both verify CSV matches table display - can be combined into a comprehensive property
- **Consolidation 1**: Properties 1.4 and 1.5 both test value handling/formatting - can be combined into one property about safe value rendering
- **Consolidation 2**: Properties 6.1, 6.2, 6.3, and 6.5 all verify CSV correctness - can be consolidated into fewer comprehensive properties

After reflection, the unique properties to test are:
1. Column registry completeness (1.1, 1.3)
2. Accessor functions work for all columns (1.2)
3. Safe value rendering with null handling and formatting (1.4, 1.5)
4. Column toggle updates visibility (2.3)
5. UI state reflects visible columns (2.4)
6. Reset restores defaults (2.5, 3.4)
7. Default columns on first load (3.1, 3.2, 3.3)
8. localStorage round-trip persistence (4.1, 4.2, 4.4)
9. Prevent hiding all columns (7.4)
10. Visible column count accuracy (7.5)
11. CSV matches visible columns (6.1, 6.2, 6.3, 6.5)

### Correctness Properties

**Property 1: Column registry contains all data source fields**

*For any* field provided by the getMembers function, the column registry should contain a corresponding column definition with that field as its ID or accessor target.

**Validates: Requirements 1.1, 1.3**

**Property 2: Accessor functions extract values safely**

*For any* column in the registry and any member object (including objects with missing fields), calling the column's accessor function should return a value without throwing an error.

**Validates: Requirements 1.2, 1.4**

**Property 3: Formatters produce valid output**

*For any* column with a formatter function and any valid input value (including null/undefined), applying the formatter should return a string without throwing an error.

**Validates: Requirements 1.5**

**Property 4: Column toggle updates visible columns list**

*For any* column ID in the registry, toggling that column should add it to the visible columns list if absent, or remove it if present (unless it's the last visible column).

**Validates: Requirements 2.3**

**Property 5: UI state reflects visible columns**

*For any* set of visible column IDs, the column selector UI should indicate exactly those columns as checked/selected.

**Validates: Requirements 2.4**

**Property 6: Reset restores default columns**

*For any* current column selection state, calling reset should restore the visible columns to exactly the set of columns marked as defaultVisible in the registry.

**Validates: Requirements 2.5, 3.4**

**Property 7: localStorage persistence round-trip**

*For any* valid array of column IDs, saving to localStorage then loading should produce an equivalent array of column IDs.

**Validates: Requirements 4.1, 4.2, 4.4**

**Property 8: Prevent hiding all columns**

*For any* state where only one column is visible, attempting to hide that column should leave it visible (the toggle operation should be rejected).

**Validates: Requirements 7.4**

**Property 9: Visible column count accuracy**

*For any* set of visible columns, the displayed count should equal the length of the visible columns array.

**Validates: Requirements 7.5**

**Property 10: CSV columns match visible table columns**

*For any* set of visible columns, the generated CSV should contain exactly those columns in the same order with the same labels as displayed in the table.

**Validates: Requirements 6.1, 6.2, 6.3, 6.5**

## Error Handling

### localStorage Failures

- **Scenario**: localStorage is unavailable (private browsing, quota exceeded, permissions)
- **Handling**: Wrap all localStorage operations in try-catch blocks, log errors to console, fall back to default columns
- **User Impact**: Column preferences won't persist, but functionality remains intact

### Invalid Stored Preferences

- **Scenario**: Corrupted data in localStorage (invalid JSON, wrong data type)
- **Handling**: JSON.parse wrapped in try-catch, validate that parsed value is an array, fall back to defaults if invalid
- **User Impact**: Preferences reset to defaults, user can reconfigure

### Missing Column IDs

- **Scenario**: Stored preferences reference column IDs that no longer exist in registry
- **Handling**: Filter stored IDs to only include those present in current registry
- **User Impact**: Removed columns disappear from selection, remaining preferences preserved

### Empty Column Selection

- **Scenario**: User attempts to hide the last visible column
- **Handling**: toggleColumn function checks if hiding would result in empty array, prevents the operation
- **User Impact**: Last column remains visible, no error shown (silent prevention)

### Null/Undefined Member Data

- **Scenario**: Member object missing expected fields
- **Handling**: Accessor functions use optional chaining, formatters handle null/undefined, display "-" for missing values
- **User Impact**: Table displays gracefully with fallback values

## Testing Strategy

### Unit Testing

Unit tests will focus on specific examples and edge cases:

- **Column Registry Validation**: Verify registry contains expected default columns
- **Default State**: Test initial load with empty localStorage returns default columns
- **Reset Functionality**: Test reset button restores exact default set
- **Edge Cases**: Test localStorage failures, corrupted data, empty arrays
- **Formatter Functions**: Test date formatting, currency formatting with various inputs
- **Last Column Protection**: Test that hiding last column is prevented

### Property-Based Testing

Property tests will verify universal behaviors across all inputs using a property-based testing library (fast-check for JavaScript/TypeScript). Each test will run a minimum of 100 iterations.

- **Property 1**: Generate random member objects, verify all accessors work
- **Property 2**: Generate random values including null/undefined, verify formatters don't crash
- **Property 3**: Generate random column ID selections, verify toggle adds/removes correctly
- **Property 4**: Generate random column selections, verify UI state matches
- **Property 5**: Generate random column arrays, verify localStorage round-trip
- **Property 6**: Generate random visible column sets, verify count is accurate
- **Property 7**: Generate random column selections, verify CSV matches table

Each property test must include a comment tag:
```javascript
// Feature: members-table-column-customization, Property 1: Accessor functions extract values safely
```

### Integration Testing

- Test full user flow: open selector → toggle columns → verify table updates → reload page → verify persistence
- Test CSV export with various column selections
- Test interaction between column selection and existing filters (status, search)
- Test responsive behavior (mobile vs desktop)

### Manual Testing Checklist

- Keyboard navigation through column selector
- Screen reader announces column states correctly
- Visual feedback for hover/focus states
- Scroll position maintained when toggling columns
- Mobile card layout unaffected by column settings
