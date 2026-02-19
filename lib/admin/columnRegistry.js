// lib/admin/columnRegistry.js
// Column registry and configuration system for Members table customization

import { formatDate, formatCurrency } from '@/lib/formatters'

/**
 * Column definition for Members table
 * @typedef {Object} ColumnDefinition
 * @property {string} id - Unique identifier (matches data field)
 * @property {string} label - Display label for header
 * @property {function} accessor - Function to extract value from member object
 * @property {function} [formatter] - Optional formatting function
 * @property {boolean} defaultVisible - Whether included in default view
 */

/**
 * COLUMN_REGISTRY - Centralized configuration for all available member columns
 * Defines all data fields that can be displayed in the Members table
 */
export const COLUMN_REGISTRY = [
  // Default visible columns (current implementation)
  {
    id: 'email',
    label: 'Email',
    accessor: (m) => m.email,
    defaultVisible: true,
  },
  {
    id: 'sacEmail',
    label: 'SAC Email',
    accessor: (m) => m.sacEmail,
    defaultVisible: true,
  },
  {
    id: 'firstName',
    label: 'Nombre',
    accessor: (m) => m.firstName,
    defaultVisible: true,
  },
  {
    id: 'initial',
    label: 'Inicial',
    accessor: (m) => m.initial,
    defaultVisible: true,
  },
  {
    id: 'lastName',
    label: 'Apellidos',
    accessor: (m) => [m.lastName, m.slastName].filter(Boolean).join(' '),
    defaultVisible: true,
  },
  {
    id: 'expirationDate',
    label: 'Vencimiento',
    accessor: (m) => m.expirationDate,
    formatter: formatDate,
    defaultVisible: true,
  },
  {
    id: 'status',
    label: 'Estado',
    accessor: (m) => m.status,
    defaultVisible: true,
  },
  {
    id: 'lastPayment',
    label: 'Ultimo Pago',
    accessor: (m) => m.lastPaymentDate,
    formatter: formatDate,
    defaultVisible: true,
  },
  // Additional columns (not in default view)
  {
    id: 'phone',
    label: 'Teléfono',
    accessor: (m) => m.phone,
    defaultVisible: false,
  },
  {
    id: 'id',
    label: 'ID',
    accessor: (m) => m.id,
    defaultVisible: false,
  },
  {
    id: 'name',
    label: 'Nombre Completo',
    accessor: (m) => m.name,
    defaultVisible: false,
  },
  {
    id: 'monthsSincePayment',
    label: 'Meses Sin Pago',
    accessor: (m) => m.monthsSincePayment,
    defaultVisible: false,
  },
  {
    id: 'lastPaymentAmount',
    label: 'Monto Ultimo Pago',
    accessor: (m) => m.lastPaymentAmount,
    formatter: formatCurrency,
    defaultVisible: false,
  },
  {
    id: 'lastPaymentNotes',
    label: 'Notas Ultimo Pago',
    accessor: (m) => m.lastPaymentNotes,
    defaultVisible: false,
  },
  {
    id: 'lastPaymentSource',
    label: 'Fuente Ultimo Pago',
    accessor: (m) => m.lastPaymentSource,
    defaultVisible: false,
  },
  // Spreadsheet columns
  {
    id: 'timestamp',
    label: 'Timestamp',
    accessor: (m) => m.timestamp,
    formatter: formatDate,
    defaultVisible: false,
  },
  {
    id: 'formPurpose',
    label: 'Propósito del formulario',
    accessor: (m) => m.formPurpose,
    defaultVisible: false,
  },
  {
    id: 'postalAddress',
    label: 'Dirección postal',
    accessor: (m) => m.postalAddress,
    defaultVisible: false,
  },
  {
    id: 'town',
    label: 'Pueblo',
    accessor: (m) => m.town,
    defaultVisible: false,
  },
  {
    id: 'zipcode',
    label: 'Zipcode',
    accessor: (m) => m.zipcode,
    defaultVisible: false,
  },
  {
    id: 'memberSince',
    label: 'Miembro desde',
    accessor: (m) => m.memberSince,
    defaultVisible: false,
  },
  {
    id: 'birthDate',
    label: 'Fecha de nacimiento',
    accessor: (m) => m.birthDate,
    formatter: formatDate,
    defaultVisible: false,
  },
  {
    id: 'profession',
    label: 'Profesión / Ocupación',
    accessor: (m) => m.profession,
    defaultVisible: false,
  },
  {
    id: 'areasOfInterest',
    label: 'Áreas de interés',
    accessor: (m) => m.areasOfInterest,
    defaultVisible: false,
  },
  {
    id: 'familyGroup',
    label: 'Grupo familiar',
    accessor: (m) => m.familyGroup,
    defaultVisible: false,
  },
  {
    id: 'hasTelescope',
    label: '¿Tienes telescopio?',
    accessor: (m) => m.hasTelescope,
    defaultVisible: false,
  },
  {
    id: 'telescopeModel',
    label: 'Modelo de telescopio',
    accessor: (m) => m.telescopeModel,
    defaultVisible: false,
  },
  {
    id: 'otherEquipment',
    label: 'Otros equipos',
    accessor: (m) => m.otherEquipment,
    defaultVisible: false,
  },
  {
    id: 'howDidYouHear',
    label: '¿Cómo te enteraste de nosotros?',
    accessor: (m) => m.howDidYouHear,
    defaultVisible: false,
  },
  {
    id: 'wantsToCollaborate',
    label: '¿Te gustaría colaborar con algún comité de apoyo?',
    accessor: (m) => m.wantsToCollaborate,
    defaultVisible: false,
  },
  {
    id: 'createdAt',
    label: 'created_at',
    accessor: (m) => m.createdAt,
    formatter: formatDate,
    defaultVisible: false,
  },
  {
    id: 'dataStatus',
    label: 'data_status',
    accessor: (m) => m.dataStatus,
    defaultVisible: false,
  },
]

/**
 * Get array of default column IDs
 * @returns {string[]} Array of column IDs that should be visible by default
 */
export function getDefaultColumnIds() {
  return COLUMN_REGISTRY.filter((col) => col.defaultVisible).map((col) => col.id)
}

/**
 * Get column definition by ID
 * @param {string} id - Column ID to look up
 * @returns {ColumnDefinition|undefined} Column definition or undefined if not found
 */
export function getColumnById(id) {
  return COLUMN_REGISTRY.find((col) => col.id === id)
}
