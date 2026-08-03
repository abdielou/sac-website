const REQUIRED_IMAGE_TEXT_PATTERNS = [
  /\b(?:imagen|afiche|cartel|arte|visual|diseño)\b[^.!?\n]{0,120}\b(?:debe|deberá|tiene\s+que|requiere)\b[^.!?\n]{0,80}\b(?:incluir|mostrar|llevar|contener|incorporar)\b[^.!?\n]{0,80}\b(?:texto|felicitación|saludo|mensaje|frase|título|nombre)\b/i,
  /\b(?:image|poster|artwork|visual|design)\b[^.!?\n]{0,120}\b(?:must|required\s+to|has\s+to)\b[^.!?\n]{0,80}\b(?:include|show|contain|display)\b[^.!?\n]{0,80}\b(?:text|greeting|message|phrase|title|name)\b/i,
]

const GREETING_RULE_PATTERN = /\b(?:felicitación|saludo|celebración|greeting|congratulat)/i

function cleanText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function collectImageRuleText(input = {}, resolvedContentTypeRules = '') {
  return [
    input.contentTypeDefinition?.generation?.rules,
    input.contentTypeDefinition?.validation?.rules,
    resolvedContentTypeRules,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join('\n')
}

function deriveGreeting(topic, ruleText) {
  const normalizedTopic = cleanText(topic)
  if (!normalizedTopic || !GREETING_RULE_PATTERN.test(ruleText)) return null
  if (/^(?:feliz|felicidades|celebramos|conmemoramos)\b/i.test(normalizedTopic)) {
    return normalizedTopic
  }
  if (/^d[ií]a\b/i.test(normalizedTopic)) return `Feliz ${normalizedTopic}`
  if (/\bnavidad\b/i.test(normalizedTopic)) return 'Feliz Navidad'
  if (/\baño\s+nuevo\b/i.test(normalizedTopic)) return 'Feliz Año Nuevo'
  return null
}

/**
 * Derive whether the active content type explicitly requires visible copy in
 * the final image. Natural-language Guidelines remain the source of truth;
 * this only resolves a conflict with the generic no-text preference.
 */
export function resolveImageTextPolicy(input = {}, resolvedContentTypeRules = '') {
  const ruleText = collectImageRuleText(input, resolvedContentTypeRules)
  const required = REQUIRED_IMAGE_TEXT_PATTERNS.some((pattern) => pattern.test(ruleText))

  return {
    required,
    suggestedText: required ? deriveGreeting(input.topic, ruleText) : null,
    ruleText,
  }
}

/** Remove generic no-text clauses when visible typography is required. */
export function stripNoTextInstructions(value) {
  return cleanText(value)
    .replace(
      /\b(?:do\s+not|don't|avoid|without|no)\s+(?:(?:include|use|add|render|show)\s+)?(?:any\s+)?(?:text(?:\s+overlays?)?|captions?|typography|lettering|words?)\b[,.]?/gi,
      ''
    )
    .replace(
      /\b(?:no\s+incluir|no\s+usar|no\s+añadir|no\s+mostrar|sin)\s+(?:texto(?:\s+superpuesto)?|captions?|tipograf[ií]a|letras?|palabras?)\b[,.]?/gi,
      ''
    )
    .replace(/(?:\s*;){2,}/g, ';')
    .replace(/\s+([,.;])/g, '$1')
    .replace(/(?:^|\s)[,;]+(?=\s|$)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;.]+|[\s,;.]+$/g, '')
}
