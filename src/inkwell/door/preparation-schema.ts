import type { JsonSchemaObject } from '../../modules/agent-door/index.ts'

// Native preparation validates PDF bytes, recipient grants, coordinates, field
// dependencies and saved-source custody. No release/provider operation is an input.
export const preparationSchema: JsonSchemaObject = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 200 }, filename: { type: 'string', minLength: 1 }, pdfBase64: { type: 'string', minLength: 1 },
    documents: { type: 'array', items: { type: 'object' } },
    signers: { type: 'array', minItems: 1, items: { type: 'object' } }, fields: { type: 'array', items: { type: 'object' } },
    anchors: { type: 'array', items: { type: 'object' } }, prefill: { type: 'object' },
    subject: { type: 'string' }, message: { type: 'string' }, expiresAt: { type: 'string' }, expiryDays: { type: 'integer' },
    reminders: { type: 'object' }, copies: { type: 'array', items: { type: 'object' } },
    tags: { type: 'array', items: { type: 'string' } }, customFields: { type: 'array', items: { type: 'object' } },
    allowPaper: { type: 'boolean' }, allowReassign: { type: 'boolean' }, freeForm: { type: 'boolean' }, adoptionMethods: { type: 'array', items: { type: 'string' } },
  }, required: ['title', 'filename', 'signers'],
}
