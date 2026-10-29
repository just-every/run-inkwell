`POST /api/inkwell/agent/prepare` takes a bearer preparation token issued by the
owner. It prepares only; the human approval command requires a native signed-in
owner/admin session. An agent token has no approval or signer authority.

```json
{
  "commandId": "new-unique-request-id",
  "title": "Consulting agreement",
  "filename": "agreement.pdf",
  "pdfBase64": "base64 of the fixed PDF",
  "signers": [
    {"name": "First signer", "email": "first@example.com"},
    {"name": "Second signer", "email": "second@example.com"}
  ],
  "fields": [
    {"id":"first-signature","signer":0,"type":"signature","label":"Signature","page":0,"x":0.1,"y":0.6,"width":0.35,"height":0.06},
    {"id":"second-signature","signer":1,"type":"signature","label":"Signature","page":0,"x":0.1,"y":0.75,"width":0.35,"height":0.06}
  ]
}
```

Pages and signer indices start at zero. Coordinates are fractions of the page
from its top-left; fields must fit inside it. Each signer needs a signature
field. Signatures, text and dates are supported. No URL is fetched for a PDF.
Use a distinct `commandId` for each intended operation; replaying it must not
create a second envelope. The result is `{ok:true,result:{id}}`.

### Fields the document carries (PREP-007)

Leave out `fields` and the envelope takes the fields the PDF carries itself:

- text tags in the document, `{{type:recipient}}` or `{{type:recipient:label}}`, where
  the type is signature, initials, date_signed, full_name, email, company, title, text,
  date, checkbox or number, and the recipient is the signer's place counted from 1;
- the fillable PDF's own form fields (text, checkbox, signature, dropdown, list, radio),
  for recipient 1, each named by its full form name;
- `anchors`, Docusign-style: up to 20 exact, case-sensitive strings, each with a field
  `type`, a `recipient`, an optional `label`, and an `x`/`y` offset right and down from
  the string's top-left corner and a `width`/`height`, all in points. Every place the
  document shows the string gets the field; a string it never shows is refused.

`prefill` fills fields by field ID or by their document name (the tag's label, the
anchor string or the form field's full name), with PREP-008's value, source and
optional `readOnly`:

```json
{
  "commandId": "new-unique-request-id",
  "title": "Vendor W-9",
  "filename": "fw9.pdf",
  "pdfBase64": "base64 of the fillable IRS W-9",
  "signers": [{"name": "Vendor contact", "email": "vendor@example.com"}],
  "anchors": [
    {"text": "Signature of", "type": "signature", "recipient": 1, "x": 62, "y": -14, "width": 240, "height": 30},
    {"text": "Signature of", "type": "date_signed", "recipient": 1, "x": 329, "y": -14, "width": 150, "height": 30}
  ],
  "prefill": {
    "topmostSubform[0].Page1[0].f1_01[0]": {"value": "Acme Workshops LLC", "source": "Vendor portal record 77"}
  }
}
```

An unknown prefill name, a tag or anchor for a recipient the envelope lacks, and both
`fields` and `anchors` together are refused. On the prepare screen, a signed-in
sender's upload places the same fields through `POST /api/inkwell/documents/fields`
(`{pdfBase64, anchors?}`), which stores nothing.

The person opens the prepared envelope and approves document eligibility. The
native UI calls `POST /api/inkwell/commands` with `envelope.approve` and
`{id,eligible:true}`. Approval and the approver are recorded in the audit trail.
The signer, independently verified by email code, supplies their own consent.
A revoked agent token cannot prepare new documents.

## Company policy and MCP

Preparation credentials also enter the shared agent door. An owner must answer
the policy at `/agents` (or adopt signed Business policy) before preparation.
The legacy preparation endpoint uses the same policy, Pause, approval and audit
checks. See [the supported registry and limits](/docs/company-agents).
