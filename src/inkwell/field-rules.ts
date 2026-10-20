import { insist, Refusal, type Field } from './model'
import { normalizePrefill } from './prefill'
import { choiceField, selectedOptions, fieldTypes, generatedField, markField, patterns, validateBusinessValue } from './business-fields'

const simpleId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value)
const maxCents = BigInt(Number.MAX_SAFE_INTEGER)

function cents(value: unknown, label: string): bigint {
  insist(typeof value === 'string' && value.length <= 500 && /^[+-]?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(value.trim()), `Enter a USD number for ${label} with at most two decimal places.`)
  const decimal = value.trim(), negative = decimal.startsWith('-'), [whole, fraction = ''] = decimal.replace(/^[+-]/, '').split('.')
  const result = (BigInt(whole || '0') * 100n + BigInt(fraction.padEnd(2, '0'))) * (negative ? -1n : 1n)
  insist(result >= -maxCents && result <= maxCents, `The USD value for ${label} is outside the safe cents range.`)
  return result
}

const decimal = (value: bigint) => `${value < 0n ? '-' : ''}${(value < 0n ? -value : value) / 100n}.${String((value < 0n ? -value : value) % 100n).padStart(2, '0')}`

/** Normalize the complete field schema, including the combined condition/calculation dependency graph.
 * Signer/page upper bounds and required signature placement are checked by validateFields in pdf.ts. */
export function normalizeFieldSchema(value: unknown): Field[] {
  insist(Array.isArray(value) && value.length > 0 && value.length <= 100, 'Place between 1 and 100 signing fields.')
  const seen = new Set<string>()
  const fields = value.map((f: Field) => {
    insist(f && typeof f === 'object' && !Array.isArray(f) && simpleId(f.id) && !seen.has(f.id), 'Each field needs a unique simple ID.')
    seen.add(f.id)
    insist(typeof f.label === 'string' && f.label.trim().length > 0 && f.label.length <= 100, 'Name each field.')
    insist(fieldTypes.some(([type]) => type === f.type), 'Choose a supported field type.')
    insist(Number.isInteger(f.signer) && f.signer >= 0 && Number.isInteger(f.page) && f.page >= 0, 'Each field must name an existing signer and PDF page.')
    insist([f.x, f.y, f.width, f.height].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1) && f.width > 0 && f.height > 0 && f.x + f.width <= 1.000001 && f.y + f.height <= 1.000001, 'Keep each field inside its PDF page.')
    const field: Field = { id: f.id, label: f.label.trim(), type: f.type, signer: f.signer, page: f.page, x: f.x, y: f.y, width: f.width, height: f.height }
    if (f.required !== undefined) { insist(typeof f.required === 'boolean', 'Required must be true or false.'); field.required = f.required }
    for (const key of ['condition', 'requiredWhen'] as const) if (f[key] !== undefined) {
      const condition = f[key]
      insist(condition && typeof condition === 'object' && !Array.isArray(condition) && simpleId(condition.field) && typeof condition.equals === 'string' && condition.equals.length <= 500 && !/[\x00-\x1f]/.test(condition.equals), `Provide a field and comparison value for ${field.label}'s condition.`)
      field[key] = { field: condition.field, equals: condition.equals.trim() }
    }
    if (f.calculation !== undefined) {
      const calculation = f.calculation
      insist(field.type === 'number', 'Only number fields can have a calculation.')
      insist(calculation && typeof calculation === 'object' && !Array.isArray(calculation) && ['sum', 'difference', 'product'].includes(calculation.operation), `Choose sum, difference, or product for ${field.label}'s calculation.`)
      insist(Array.isArray(calculation.fields) && calculation.fields.length > 0 && calculation.fields.length <= 100 && calculation.fields.every(simpleId), `Choose number fields for ${field.label}'s calculation.`)
      field.calculation = { operation: calculation.operation, fields: [...calculation.fields] }
    }
    if (choiceField(field)) {
      insist(Array.isArray(f.options) && f.options.length >= 2 && f.options.length <= 20 && f.options.every(option => typeof option === 'string' && option.trim().length > 0 && option.length <= 100 && !/[\x00-\x1f\x7f]/.test(option)), `Give ${field.label} 2–20 single-line options of at most 100 characters.`)
      field.options = f.options.map(option => option.trim())
      insist(new Set(field.options).size === field.options.length, `Give ${field.label} distinct options.`)
      insist(JSON.stringify(field.options).length <= 500, `The options for ${field.label} must fit within 500 characters together.`)
      if (field.type === 'checkbox_group') {
        const minimum = f.minimum ?? 0, maximum = f.maximum ?? field.options.length
        insist(Number.isInteger(minimum) && Number.isInteger(maximum) && minimum >= 0 && minimum <= maximum && maximum <= field.options.length, `Choose whole-number minimum and maximum bounds within ${field.label}'s options.`)
        field.minimum = minimum; field.maximum = maximum
        insist(f.required === false || maximum > 0, `A required checkbox group needs at least one allowed selection: ${field.label}.`)
      } else insist(f.minimum === undefined && f.maximum === undefined, `Only checkbox groups have selection bounds: ${field.label}.`)
    } else insist(f.options === undefined && f.minimum === undefined && f.maximum === undefined, `Only choice fields have options or selection bounds: ${field.label}.`)
    if (f.pattern !== undefined) {
      insist(typeof f.pattern === 'string' && Object.hasOwn(patterns, f.pattern) && !generatedField(field) && !choiceField(field) && !['checkbox', 'number'].includes(field.type), `Choose a text validation pattern for ${field.label}.`)
      field.pattern = f.pattern
    }
    if (f.masked !== undefined) { insist(typeof f.masked === 'boolean' && !generatedField(field) && !choiceField(field) && field.type !== 'checkbox', 'Mask only business-data fields.'); field.masked = f.masked }
    normalizePrefill(field, f)
    if (field.prefill) validateBusinessValue(field, field.prefill.value)
    return field
  })
  const byId = new Map(fields.map(field => [field.id, field]))
  for (const field of fields) {
    const reference = (id: string) => {
      const target = byId.get(id)
      insist(target, `${field.label} refers to an unknown field: ${id}.`)
      insist(target.id !== field.id, `${field.label} cannot refer to itself.`)
      insist(target.signer === field.signer, `${field.label} can only refer to the same signer's fields.`)
      insist(!markField(target), `${field.label} cannot refer to a signature field.`)
      return target
    }
    for (const condition of [field.condition, field.requiredWhen]) if (condition) {
      const target = reference(condition.field)
      if (target.type === 'checkbox') insist(['true', 'false'].includes(condition.equals), `Compare ${target.label} with true or false.`)
      if (target.type === 'number') condition.equals = decimal(cents(condition.equals, target.label))
    }
    if (field.calculation) for (const id of field.calculation.fields) insist(reference(id).type === 'number', `${field.label}'s calculation can only use number fields.`)
  }
  dependencyOrder(fields)
  return fields
}

function dependencyOrder(fields: Field[]): Field[] {
  const byId = new Map(fields.map(field => [field.id, field])), visiting = new Set<string>(), visited = new Set<string>(), ordered: Field[] = []
  insist(byId.size === fields.length, 'Each field needs a unique simple ID.')
  const visit = (field: Field) => {
    insist(!visiting.has(field.id), `The field rules contain a dependency cycle at ${field.label}.`)
    if (visited.has(field.id)) return
    visiting.add(field.id)
    for (const id of [...(field.condition ? [field.condition.field] : []), ...(field.requiredWhen ? [field.requiredWhen.field] : []), ...(field.calculation?.fields ?? [])]) {
      const target = byId.get(id)
      insist(target, `${field.label} refers to an unknown field: ${id}.`)
      visit(target)
    }
    visiting.delete(field.id)
    visited.add(field.id)
    ordered.push(field)
  }
  fields.forEach(visit)
  return ordered
}

function calculate(field: Field, operands: bigint[]): string {
  const operation = field.calculation!.operation
  let result: bigint
  if (operation === 'sum') result = operands.reduce((a, b) => a + b, 0n)
  else if (operation === 'difference') result = operands.slice(1).reduce((a, b) => a - b, operands[0])
  else {
    const numerator = operands.reduce((a, b) => a * b, 1n), denominator = 100n ** BigInt(operands.length - 1), magnitude = numerator < 0n ? -numerator : numerator
    result = (magnitude / denominator + (magnitude % denominator * 2n >= denominator ? 1n : 0n)) * (numerator < 0n ? -1n : 1n)
  }
  insist(result >= -maxCents && result <= maxCents, `The calculated USD value for ${field.label} is outside the safe cents range.`)
  return decimal(result)
}

function evaluate(fields: Field[], raw: Record<string, unknown>, strict: boolean) {
  const values: Record<string, string> = {}, shown = new Set<string>()
  for (const field of dependencyOrder(fields)) {
    if (field.condition) {
      const source = fields.find(f => f.id === field.condition!.field)!
      let equals = field.condition.equals
      if (source.type === 'number') {
        try { equals = decimal(cents(equals, source.label)) } catch (error) { if (strict || !(error instanceof Refusal)) throw error; continue }
      }
      if (!shown.has(source.id) || values[source.id] !== equals) continue
    }
    shown.add(field.id)
    const input = field.readOnly ? field.prefill?.value : Object.hasOwn(raw, field.id) ? raw[field.id] : field.prefill?.value
    try {
      if (field.calculation) {
        if (field.calculation.fields.some(id => shown.has(id) && values[id] === undefined)) continue
        values[field.id] = calculate(field, field.calculation.fields.map(id => shown.has(id) ? cents(values[id], field.label) : 0n))
      } else if (field.type === 'checkbox') {
        const value = input
        insist(value === undefined || value === 'true' || value === 'false', `Choose true or false for ${field.label}.`)
        values[field.id] = value === 'true' ? 'true' : 'false'
      } else if (input !== undefined && input !== '') {
        if (field.type === 'number') values[field.id] = decimal(cents(input, field.label))
        else {
          insist(typeof input === 'string', `Provide a text value for ${field.label}.`)
          const value = (input as string).trim()
          validateBusinessValue(field, value)
          values[field.id] = field.type === 'checkbox_group' ? selectedOptions(value).length ? JSON.stringify(field.options!.filter(option => selectedOptions(value).includes(option))) : '' : value
        }
      }
    } catch (error) { if (strict || !(error instanceof Refusal)) throw error }
  }
  return { values, shown }
}

/** Preview visibility tolerates unfinished/invalid inputs while editing. Hidden sources never reveal dependants. */
export function visibleFields(fields: Field[], values: Record<string, unknown>): Field[] {
  const { shown } = evaluate(fields, values, false)
  return fields.filter(field => shown.has(field.id))
}

/** Recompute all derived values; discard hidden/unknown values, default visible checkboxes to false.
 * Missing inputs stay absent (the signing boundary enforces required fields). Hidden numeric operands count as zero.
 * USD inputs and outputs use exact, safe cents. Products round once, half away from zero. */
export function resolveFieldValues(fields: Field[], raw: Record<string, unknown>): Record<string, string> {
  return evaluate(fields, raw, true).values
}

/** Required independently of visibility: hidden fields are never required. Checkboxes default optional. */
export function requiredField(field: Field, fields: Field[], raw: Record<string, unknown>): boolean {
  const { shown, values } = evaluate(fields, raw, false)
  if (!shown.has(field.id)) return false
  if (field.requiredWhen) return shown.has(field.requiredWhen.field) && values[field.requiredWhen.field] === field.requiredWhen.equals
  return field.required ?? field.type !== 'checkbox'
}

/** Shared exact USD semantics for ROUTE-003 comparisons. */
export { cents as usdCents, decimal as usdDecimal }
