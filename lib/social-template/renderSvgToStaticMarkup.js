import React from 'react'

const ATTRIBUTE_NAMES = Object.freeze({
  className: 'class',
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontStyle: 'font-style',
  fontWeight: 'font-weight',
  letterSpacing: 'letter-spacing',
  stopColor: 'stop-color',
  strokeWidth: 'stroke-width',
  textAnchor: 'text-anchor',
  viewBox: 'viewBox',
})

function escapeText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttribute(value) {
  return escapeText(value).replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
}

function attributeName(propName) {
  if (ATTRIBUTE_NAMES[propName]) return ATTRIBUTE_NAMES[propName]
  if (propName.startsWith('data-') || propName.startsWith('aria-')) return propName
  return propName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function serializeAttributes(props) {
  return Object.entries(props)
    .filter(([name, value]) => name !== 'children' && value !== null && value !== undefined)
    .map(([name, value]) => {
      if (typeof value === 'boolean') {
        return value ? ` ${attributeName(name)}=""` : ''
      }
      if (typeof value !== 'string' && typeof value !== 'number') {
        throw new Error(`Unsupported SVG attribute value: ${name}`)
      }
      return ` ${attributeName(name)}="${escapeAttribute(value)}"`
    })
    .join('')
}

function serializeNode(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return escapeText(node)
  if (Array.isArray(node)) return node.map(serializeNode).join('')
  if (!React.isValidElement(node)) {
    throw new Error('Unsupported React node in social-template SVG')
  }

  if (node.type === React.Fragment) {
    return serializeNode(node.props.children)
  }
  if (typeof node.type === 'function') {
    return serializeNode(node.type(node.props))
  }
  if (typeof node.type !== 'string') {
    throw new Error('Unsupported React element type in social-template SVG')
  }

  const attributes = serializeAttributes(node.props)
  const children = serializeNode(node.props.children)
  return `<${node.type}${attributes}>${children}</${node.type}>`
}

/**
 * Synchronously serialize the pure React SVG tree without react-dom/server.
 * Next's React Server Component runtime intentionally blocks react-dom/server,
 * while the workflow image renderer requires a synchronous SVG string.
 */
export function renderSvgToStaticMarkup(element) {
  return serializeNode(element)
}
