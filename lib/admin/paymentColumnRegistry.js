// lib/admin/paymentColumnRegistry.js
// Column registry for Payments table customization

import { formatDate, formatCurrency } from '@/lib/formatters'

export const PAYMENT_COLUMN_REGISTRY = [
  // Default visible columns (current table)
  {
    id: 'date',
    label: 'Fecha',
    accessor: (p) => p.date,
    formatter: formatDate,
    defaultVisible: true,
  },
  {
    id: 'email',
    label: 'Email',
    accessor: (p) => p.email,
    defaultVisible: true,
  },
  {
    id: 'phone',
    label: 'Telefono',
    accessor: (p) => p.phone,
    defaultVisible: true,
  },
  {
    id: 'amount',
    label: 'Monto',
    accessor: (p) => p.amount,
    formatter: formatCurrency,
    defaultVisible: true,
  },
  {
    id: 'source',
    label: 'Fuente',
    accessor: (p) => p.source,
    defaultVisible: true,
  },
  {
    id: 'notes',
    label: 'Mensaje',
    accessor: (p) => p.notes,
    defaultVisible: true,
  },
  {
    id: 'is_membership',
    label: 'Membresia',
    accessor: (p) => p.is_membership,
    defaultVisible: true,
  },
  // Additional columns from PAYMENTS sheet
  {
    id: 'message_id',
    label: 'Message ID',
    accessor: (p) => p._raw?.message_id,
    defaultVisible: false,
  },
  {
    id: 'sender_name',
    label: 'Nombre',
    accessor: (p) => p._raw?.sender_name,
    defaultVisible: false,
  },
  {
    id: 'payment_time',
    label: 'Hora',
    accessor: (p) => p._raw?.payment_time,
    defaultVisible: false,
  },
  {
    id: 'payment_datetime',
    label: 'Fecha y Hora',
    accessor: (p) => p._raw?.payment_datetime,
    defaultVisible: false,
  },
  {
    id: 'recipient_name',
    label: 'Recipiente',
    accessor: (p) => p._raw?.recipient_name,
    defaultVisible: false,
  },
  {
    id: 'email_subject',
    label: 'Email Subject',
    accessor: (p) => p._raw?.email_subject,
    defaultVisible: false,
  },
  {
    id: 'email_date',
    label: 'Email Date',
    accessor: (p) => p._raw?.email_date,
    defaultVisible: false,
  },
  {
    id: 'email_from',
    label: 'Email From',
    accessor: (p) => p._raw?.email_from,
    defaultVisible: false,
  },
  {
    id: 'email_to',
    label: 'Email To',
    accessor: (p) => p._raw?.email_to,
    defaultVisible: false,
  },
  {
    id: 'original_sender',
    label: 'Original Sender',
    accessor: (p) => p._raw?.original_sender,
    defaultVisible: false,
  },
  {
    id: 'return_path',
    label: 'Return Path',
    accessor: (p) => p._raw?.return_path,
    defaultVisible: false,
  },
  {
    id: 'payment_service',
    label: 'Payment Service',
    accessor: (p) => p._raw?.payment_service,
    defaultVisible: false,
  },
  {
    id: 'service_provider',
    label: 'Service Provider',
    accessor: (p) => p._raw?.service_provider,
    defaultVisible: false,
  },
  {
    id: 'match_status',
    label: 'Match Status',
    accessor: (p) => p._raw?.match_status,
    defaultVisible: false,
  },
  // Additional columns from MANUAL_PAYMENTS sheet
  {
    id: 'payment_type',
    label: 'Tipo de Pago',
    accessor: (p) => p._raw?.payment_type,
    defaultVisible: false,
  },
  // Internal columns
  {
    id: 'rowNumber',
    label: 'Fila',
    accessor: (p) => p.rowNumber,
    defaultVisible: false,
  },
  {
    id: '_sheetName',
    label: 'Hoja',
    accessor: (p) => p._sheetName,
    defaultVisible: false,
  },
]
