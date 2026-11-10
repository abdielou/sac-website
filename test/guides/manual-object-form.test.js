// ManualObjectForm initial render: add mode with a name filled in, edit mode with values

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// The app sources rely on the automatic JSX runtime; babel-jest here uses the
// classic one, so the transformed modules need React in scope.
global.React = React

const ManualObjectForm = require('../../components/admin/ManualObjectForm').default

const render = (props) =>
  renderToStaticMarkup(
    React.createElement(ManualObjectForm, {
      objectId: 'manual-a1',
      onSubmit: () => {},
      onCancel: () => {},
      ...props,
    })
  )

test('add mode fills in the name from the search text', () => {
  const html = render({ initialName: 'Saturno' })
  expect(html).toContain('Agregar objeto manual')
  expect(html).toMatch(/id="manual-name"[^>]*value="Saturno"/)
  expect(html).toContain('>Agregar</button>')
})

test('edit mode shows the current values, with coordinates as degrees', () => {
  const html = render({
    initialValue: {
      name: 'Cometa C/2025 A1',
      designation: 'C/2025 A1',
      magnitude: 6.5,
      ra: 150.2,
      dec: 12.3,
      imageUrl: 'https://example.com/c.jpg',
    },
  })
  expect(html).toContain('Editar objeto manual')
  expect(html).toMatch(/id="manual-designation"[^>]*value="C\/2025 A1"/)
  expect(html).toMatch(/id="manual-ra"[^>]*value="150.2"/)
  expect(html).toContain('= 150.2000°')
  expect(html).toContain('src="https://example.com/c.jpg"')
  expect(html).toContain('>Guardar</button>')
})

test('lists the type suggestions', () => {
  const html = render({})
  expect(html).toContain('<option value="Cometa">')
  expect(html).toContain('<option value="Evento">')
})

test('shows no errors before the editor types or submits', () => {
  const html = render({})
  expect(html).not.toContain('obligatorio')
})
