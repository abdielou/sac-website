/**
 * @jest-environment jsdom
 */

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import ValidationResult from '../../components/admin/ai/ValidationResult'

describe('ValidationResult', () => {
  let container
  let root

  beforeAll(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test('explains a clean automated result without calling it approved', () => {
    act(() =>
      root.render(
        <ValidationResult
          result={{
            overallOutcome: 'pass',
            approvalRecommendation: 'ready_for_review',
            summary: 'No se detectaron problemas automáticos.',
            issues: [],
            humanReviewRequired: true,
          }}
        />
      )
    )

    expect(container.textContent).toContain('Sin problemas detectados')
    expect(container.textContent).toContain('Pendiente de revisión humana')
    expect(container.textContent).toContain('Hallazgos (0)')
    expect(container.querySelector('[data-testid="validation-no-findings"]').textContent).toMatch(
      /aún necesita revisión y aprobación humana/i
    )
    expect(container.textContent).not.toContain('Aprobado')
  })

  test('does not display Markdown markers emitted in diagnostic text', () => {
    act(() =>
      root.render(
        <ValidationResult
          result={{
            overallOutcome: 'pass',
            approvalRecommendation: 'ready_for_review',
            summary: 'Se sugiere una imagen para mejorar el *engagement*.',
            issues: [],
            imageNotes: 'Usa una imagen con **buen contraste**.',
            humanReviewRequired: true,
          }}
        />
      )
    )

    expect(container.textContent).toContain('mejorar el engagement.')
    expect(container.textContent).toContain('imagen con buen contraste.')
    expect(container.textContent).not.toMatch(/\*engagement\*|\*\*buen contraste\*\*/)
  })

  test('renders feedback for each identified image', () => {
    act(() =>
      root.render(
        <ValidationResult
          result={{
            overallOutcome: 'warning',
            approvalRecommendation: 'needs_edits',
            summary: 'Revisa las imágenes.',
            issues: [],
            imageNotesByImage: [
              { imageIndex: 1, fileName: 'luna.jpg', notes: 'Buen contraste.' },
              { imageIndex: 2, notes: 'Añade texto alternativo.' },
            ],
            humanReviewRequired: true,
          }}
        />
      )
    )

    expect(container.textContent).toContain('Revisión por imagen')
    expect(container.textContent).toContain('luna.jpg')
    expect(container.textContent).toContain('Imagen 2')
    expect(container.textContent).toContain('Añade texto alternativo.')
  })

  test('distinguishes a system failure from content noncompliance', () => {
    act(() =>
      root.render(
        <ValidationResult
          result={{
            overallOutcome: 'fail',
            approvalRecommendation: 'do_not_publish',
            summary: 'No fue posible completar la validación automática.',
            issues: [
              {
                severity: 'major',
                category: 'uncertainty_factual_risk',
                message: 'El proveedor no respondió.',
              },
            ],
            resultSource: 'system',
            humanReviewRequired: true,
          }}
        />
      )
    )

    expect(container.textContent).toContain('Validación inconclusa')
    expect(container.textContent).toContain('Revisión manual necesaria')
    expect(container.textContent).toContain('Origen: Sistema')
    expect(container.textContent).not.toContain('No cumple')
  })
})
