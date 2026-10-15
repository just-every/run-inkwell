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

The person opens the prepared envelope and approves document eligibility. The
native UI calls `POST /api/inkwell/commands` with `envelope.approve` and
`{id,eligible:true}`. Approval and the approver are recorded in the audit trail.
The signer, independently verified by email code, supplies their own consent.
A revoked agent token cannot prepare new documents.
