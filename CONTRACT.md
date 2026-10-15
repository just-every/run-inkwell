# Inkwell contract

ACCEPTANCE.md defines the first-release jobs. Private API handlers authorize
native sessions and roles; preparation tokens may only prepare. Signing requires
a scoped verified mailbox session, order, explicit consent and the current
immutable document version. D1 atomic writes retain the evidence.

HTTP-001: `/health` includes deployment identity; Hono owns `/api/*`, and Start
serves application documents. Unknown routes return 404.
