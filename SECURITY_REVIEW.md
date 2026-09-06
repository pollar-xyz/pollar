# Security Review — @pollar/core & @pollar/react

A manual security review of the client-side packages `@pollar/core` and
`@pollar/react` was conducted, covering key handling, transaction signing
integrity (DPoP / RFC 9449), session management, storage, randomness, and
React UI security.

**Result:** No critical or high-severity findings. The signing-integrity and
key-handling architecture were assessed as sound. Three minor observations
(one LOW — missing client-side Stellar address validation — and two
informational) were documented.

The full report is maintained as a private document and shared on request.
See the linked pull request for access details.

_Reviewed by: @nadevrix · June 2026_
