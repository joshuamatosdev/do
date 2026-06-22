// authorized / local-only security testing — see AUTH_PREAMBLE below

export const meta = {
  name: 'red-blue-sweep',
  description: 'Paired red/blue security sweep: parallel attacker lenses find vulns, matched defender lenses verify controls. Authorized, local-only targets only.',
  phases: [ { title: 'Attack' }, { title: 'Triage' }, { title: 'Defend' } ],
}

// ── Authorization gate (prepended to every dispatched prompt) ─────────────────
// This sweep reads code and config to find and verify security gaps. It is a
// review, not an attack run. The same supreme law that governs do:security-recon
// governs every agent this workflow dispatches.
const AUTH_PREAMBLE = `SUPREME LAW — authorized, local-only security review (non-negotiable):

- You REVIEW source code and configuration for security gaps. You do NOT run active
  scanning, probing, fuzzing, or exploitation against any running host.
- Any active, network-reaching tool may target ONLY local addresses — 127.0.0.1, ::1,
  localhost, the private LAN ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), or a
  lab IP the user has explicitly named for this session. Everything else is REFUSED.
- Always refused regardless of address: any environment the user has not explicitly
  authorized, and any production or shared environment (staging, CI, team services).
- REFUSE outright and surface the reason: destructive testing (DoS, resource exhaustion,
  data loss), persistence, lateral movement, malware, credential theft, phishing or other
  social-engineering of real people, data exfiltration, or public disclosure before a fix.
- If authorization or scope is unclear, say so and stop — never assume authorization.

Work only from what you can read in the codebase under review. Report gaps; do not weaponize them.

`



// ── JSON Schema ──────────────────────────────────────────────────────────────

const FINDINGS = {
  type: 'object',
  required: ['findings', 'coverage'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'ttp', 'severity', 'location', 'detail'],
        properties: {
          title:    { type: 'string', description: 'Short name for the vulnerability or gap.' },
          ttp:      { type: 'string', description: 'MITRE ATT&CK TTP ID (e.g. T1190).' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
          location: { type: 'string', description: 'File, function, config key, or endpoint where the issue lives.' },
          detail:   { type: 'string', description: 'What was found and why it is exploitable.' },
        },
      },
    },
    // Coverage ledger — one entry per area the lens was asked to probe, so the
    // reader can tell "clean" from "never looked". A missing area is not "clean".
    coverage: {
      type: 'array',
      items: {
        type: 'object',
        required: ['area', 'status'],
        properties: {
          area:           { type: 'string', description: 'The coverage area, e.g. "Concurrency / TOCTOU".' },
          status:         { type: 'string', enum: ['clean', 'gap', 'not-checked', 'not-applicable'] },
          evidence:       { type: 'string', description: 'What was inspected (file/area), or why it is clean.' },
          not_checked_reason: { type: 'string', description: 'Why the area could not be assessed (status=not-checked).' },
        },
      },
    },
  },
}

const VERDICT = {
  type: 'object',
  required: ['defended', 'control_present', 'nist', 'fix'],
  properties: {
    defended:        { type: 'boolean', description: 'true if a correct, effective control is in place.' },
    control_present: { type: 'string', description: 'What control was found (or "absent" / "partial").' },
    nist:            { type: 'string', description: 'NIST SP 800-53 Rev 5 control ID (e.g. AC-3, SI-10).' },
    fix:             { type: 'string', description: 'Specific remediation step if defended is false or partial.' },
  },
}

const TRIAGE = {
  type: 'object',
  required: ['real', 'confidence', 'reason'],
  properties: {
    real:       { type: 'boolean', description: 'true ONLY if the finding is a real, exploitable gap with evidence at the cited location. Default false when uncertain.' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reason:     { type: 'string', description: 'Why it is real or a false alarm — trace exploitability and cite the evidence.' },
  },
}

// ── Lens definitions ─────────────────────────────────────────────────────────

const LENSES = [
  {
    key: 'low-level',

    attack: `You are an offensive security researcher performing a low-level / native-layer attack review
of the target system under authorized test. Your job is to find exploitable weaknesses in memory
safety, runtime execution, cryptographic primitives, numeric arithmetic, data-access control,
dependency supply chain, and build integrity.

Probe each area below. Put each confirmed or probable gap in findings. Record EVERY area in the
coverage ledger — including clean ones; a clean area is reported as clean, never left out.

COVERAGE AREAS

1. Prototype pollution / unsafe merge (T1565)
   - Locate object merge, deep-clone, or spread of untrusted JSON into state or DB without prior
     schema validation (e.g. Object.assign, lodash merge, Jackson ObjectMapper with unknown fields).
   - Confirm whether every trust-boundary input passes through a typed schema parser before use.

2. Dynamic code execution (T1059.007)
   - Find execution of user-controlled strings as code
     (e.g. eval, new Function, setTimeout with a string arg, ScriptEngine.eval, exec, system,
     pickle.loads, ObjectInputStream, YAML.load with untrusted input).
   - Verify linter or compiler rules forbid these APIs; check CSP for unsafe-eval.

3. Type safety escape hatches (T1565)
   - Find type-system bypasses at trust boundaries: unchecked casts, any-type annotations,
     suppression pragmas (e.g. as any, @ts-ignore, @SuppressWarnings("unchecked"), type: ignore)
     in API parsers, form handlers, or serverless function entry points.
   - Find dynamic class or method loading called with values derived from external input.
   - Check whether the language's strict / type-safe mode is enabled across the project.

4. Weak cryptography and insecure randomness (T1552.004 / T1552)
   - Flag non-cryptographic random (e.g. Math.random(), java.util.Random, random.random())
     used for tokens, nonces, IDs, or invite codes.
   - Flag broken or weak algorithms (MD5, SHA-1, DES, RC4, AES/ECB) in security-relevant paths.
   - Confirm strong random (e.g. crypto.getRandomValues, SecureRandom, secrets.token_bytes)
     is used for all security material.
   - Check that private key material is zeroed after use and never logged.

5. Numeric boundary errors (T1565.001)
   - Find integer accumulators (score, count, total) using unchecked arithmetic on fixed-width
     integer types without overflow protection.
   - Find large-integer columns (64-bit IDs, amounts) mapped to a narrower native float type
     where precision loss occurs (e.g. JS number above 2^53).
   - Find string-to-integer parsing without radix or base enforcement; find division without a
     zero-denominator guard.

6. Data-access control bypass (T1190)
   - Check that record/row authorization is enforced at the data layer, not only at the API layer.
   - Find authorization logic that reads client-writable user attributes for access decisions
     instead of server-controlled identity claims.
   - Look for privileged query helpers or stored procedures that bypass authorization checks and
     accept unparameterized input.

7. Dangerous runtime extensions and OS access (T1059.003 / T1574.006)
   - Find database extensions or stored-procedure languages that allow OS-level code execution
     (e.g. untrusted procedural languages, COPY FROM PROGRAM, server-side file read functions).
   - Find shell execution with user-controlled arguments in application code
     (e.g. Runtime.exec, subprocess with shell=True, child_process.exec with interpolated input).
   - Find native library loading or unsafe deserialization in production code without input filters.

8. Supply chain integrity (T1195.002)
   - Check that a lockfile (package-lock.json, yarn.lock, Pipfile.lock, go.sum, etc.) is committed.
   - Confirm CI uses a lock-respecting install command (e.g. npm ci, pip install --require-hashes)
     and runs a dependency vulnerability audit at high severity.
   - Flag any dependency pulled from a git URL or raw tarball without checksum verification.
   - Confirm an automated dependency-update tool (Dependabot, Renovate, etc.) is configured.

9. Source and build artifact leakage (T1027)
   - Find source-map files (.map) or debug symbol files served in production builds.
   - Find heap-dump or thread-dump paths pointing to publicly accessible locations.
   - Find production processes started with debug flags, development profiles, or
     permissive runtime flags that expose internals.

10. Concurrency, races, and TOCTOU (T1565 / CWE-362, CWE-367)
   - Find check-then-use gaps: a resource (file, permission, balance, token, session) validated in
     one step and used in a later step that another actor can change in between.
   - Find non-atomic read-modify-write on shared state (counters, balances, inventory, idempotency
     keys) with no lock, transaction, or compare-and-set.
   - Find double-spend / double-submit windows: an action that must run once (payment, redeem, vote,
     coupon) with no idempotency key or single-use enforcement.
   - Find replay windows: nonces, one-time tokens, or signed requests accepted more than once.
   - Find file races: create/check/open by path rather than by handle; predictable temp-file names;
     symlink-following on a path an attacker can swap between check and use.

11. Secrets-in-memory and process-injection surface (detection only — T1055, T1003)
   - Find secrets (keys, tokens, passwords) held in long-lived memory, logged, or written to error
     reports or core/heap dumps, beyond the key-zeroing check in area 4.
   - Find heap, thread, or core dump writers pointed at a readable or shipped location.
   - Flag the PRESENCE of native/runtime injection APIs in application code (CreateRemoteThread,
     NtQueueApcThread, WriteProcessMemory, ptrace, process_vm_writev, an LD_PRELOAD hook, dlopen of
     an attacker-controlled path) for review — report them; do NOT add, enable, or run them.
   - Find debug or inspection interfaces left enabled in production: a remote debugger port, an
     in-process eval/REPL, or a thread-priority / scheduling control reachable from input.

Scope rule: Do not flag settings that exist only in dev/test configuration (files or env vars
whose name or path clearly scopes them to local, dev, test, or CI environments only). Only report
production gaps.

Return JSON matching the findings schema. Give a coverage entry for EVERY area above: status clean
if you found no gap, gap if you did (and add the matching findings entry), not-checked with a
reason if you could not assess it, or not-applicable. Put only real gaps in findings; never
drop an area silently — a missing area reads as not-probed, which is worse than clean.`,

    defend: (f) => `You are a defensive security engineer performing a low-level control verification
of the target system under authorized test. A red-team probe found the following vulnerability:

FINDING
  title:    ${f.title}
  ttp:      ${f.ttp}
  severity: ${f.severity}
  location: ${f.location}
  detail:   ${f.detail}

Your task: determine whether an effective defensive control is in place that closes this specific gap.

Use the guidance below to direct your verification.

PROTOTYPE POLLUTION (T1565)
  - Is every untrusted input validated through a typed schema (e.g. zod, class-validator,
    JSON Schema, Pydantic, Bean Validation) before use?
  - Is there a safe-merge helper that rejects dangerous prototype keys?
  - NIST: SI-10

DYNAMIC CODE (T1059.007 / SI-3)
  - Are linter or compiler rules that forbid dynamic code execution enabled as errors?
  - Does the CSP omit unsafe-eval?
  - NIST: SI-3, CM-7

TYPE SAFETY (T1565 / SI-10)
  - Is the language's strict type-safety mode enabled project-wide?
  - Are linter rules banning unchecked casts and suppression pragmas enabled?
  - NIST: SI-10, CM-6

CRYPTOGRAPHY (T1552 / SC-13)
  - Are tokens generated with a cryptographically secure random source?
  - Are prohibited algorithms (MD5, SHA-1, DES, RC4, AES/ECB) absent from security paths?
  - Is private key material zeroed after signing?
  - NIST: SC-12, SC-13

NUMERIC SAFETY (T1565.001 / SI-10)
  - Are integer accumulators guarded against overflow (checked arithmetic or wide types)?
  - Are large-integer values kept in a type that preserves full precision?
  - NIST: SI-10

DATA ACCESS (T1190 / AC-3)
  - Is record/row authorization enforced at the data layer?
  - Do authorization checks read server-controlled identity claims — not client-writable attributes?
  - Do privileged helpers use parameterized queries and restrict search path?
  - NIST: AC-3, AC-6

RUNTIME EXTENSIONS / DESERIALIZATION (T1059.003 / SI-3)
  - Are OS-execution database extensions absent from production?
  - Is shell execution restricted to constant, audited arguments?
  - Is unsafe deserialization paired with an input filter in every instantiation?
  - NIST: CM-7, SI-3

SUPPLY CHAIN (T1195.002 / SA-12)
  - Is lockfile committed? Does CI use a lock-respecting install? Is a CVE audit gate present?
  - NIST: SA-12, SI-7

ARTIFACT LEAKAGE (T1027 / SI-12)
  - Are source-map and debug symbol files excluded from production builds?
  - Are dump paths restricted to an ops-only, non-public directory?
  - NIST: SI-12

CONCURRENCY / TOCTOU (CWE-362, CWE-367 / SC-5, SI-10)
  - Is shared-state mutation atomic — a transaction, lock, or compare-and-set — not read-then-write?
  - Are once-only actions guarded by an idempotency key or a single-use token?
  - Are one-time tokens and nonces enforced as single-use within a bounded replay window?
  - Do file operations use a handle, not a re-resolved path, and reject symlink swaps?
  - NIST: SC-5, SI-10, AC-3

SECRETS-IN-MEMORY / INJECTION SURFACE (T1055 / SC-28, SI-12)
  - Are secrets kept out of logs, error reports, and dump paths, and zeroed when no longer needed?
  - Are dump writers pointed at an ops-only, non-shipped location?
  - Are native/runtime injection APIs absent from application code, or justified and guarded?
  - Are debug, eval, and inspection interfaces disabled in production?
  - NIST: SC-28, SI-12, CM-7

Return JSON matching the verdict schema. Set defended: true only if you find an effective,
correctly-configured control that specifically closes this finding. Set it false or note "partial"
in control_present if the control is missing, misconfigured, or only partially effective.`,
  },

  {
    key: 'network',

    attack: `You are an offensive security researcher performing a network and perimeter attack review
of the target system under authorized test. Your job is to find exploitable gaps in HTTP security
controls, authentication enforcement, CORS policy, SSRF vectors, rate limiting, transport security,
secret exposure, and dependency CVE surface.

Probe each area below. Put each confirmed or probable gap in findings. Record EVERY area in the
coverage ledger — including clean ones; a clean area is reported as clean, never left out.

COVERAGE AREAS

1. HTTP security headers (T1190)
   - Check for missing or misconfigured Content-Security-Policy (look for unsafe-inline, unsafe-eval).
   - Check for missing Strict-Transport-Security, X-Frame-Options (DENY), X-Content-Type-Options
     (nosniff), Referrer-Policy (strict-origin-when-cross-origin), Permissions-Policy.
   - Find any route or middleware gap that drops these headers for a subset of paths.

2. CORS misconfiguration (T1550)
   - Find Access-Control-Allow-Origin: * paired with Access-Control-Allow-Credentials: true.
   - Find CORS origin reflection without an explicit allowlist.
   - Check that preflight OPTIONS responses include Vary: Origin.
   - Find per-route CORS annotations that override a stricter global policy.

3. Authentication bypass and unauthenticated endpoints (T1078)
   - Enumerate all HTTP endpoints; find any POST/PUT/DELETE/PATCH that is publicly accessible
     without a documented rationale.
   - Find framework admin or diagnostic endpoints (e.g. heap/thread dumps, env/config introspection,
     metrics, route listings) exposed without auth.
   - Find serverless or edge function handlers where JWT verification is disabled without a
     documented rationale and compensating control.
   - Find any endpoint that returns user-specific data without an auth check.

4. SSRF in server-side fetch (T1190)
   - Find server-side HTTP client calls where the URL is partially or fully derived from user input.
   - Check whether the target URL is validated against a hardcoded host allowlist before dispatch.
   - Check whether private address ranges (127.0.0.0/8, 10.0.0.0/8, 169.254.169.254, ::1) are blocked.
   - Check whether redirects are followed blindly without re-checking the allowlist.

5. Open redirect (T1598)
   - Find redirect_to, returnUrl, next, goto, return= query parameters that accept arbitrary URLs.
   - Check whether OAuth or SSO redirect URI configuration uses wildcard patterns.
   - Verify that protocol-relative URLs (//attacker.example.com) are rejected.

6. Rate limiting gaps (T1110)
   - Find login, password-reset, signup, and OTP endpoints without per-account rate limiting.
   - Find expensive endpoints (search, export, report) without per-user rate limits.
   - Check that rate-limit keys are based on account identifier, not IP alone (IP rotation bypass).

7. Secret and key exposure in client (T1552.001)
   - Find client-bundled environment variables or build-time config that embed server-side secrets
     (service keys, signing keys, admin tokens).
   - Find server-only secrets referenced in frontend or client-side source.
   - Check committed config templates (e.g. .env.example) for real secret values.

8. Dependency CVEs (T1190)
   - Flag any direct dependency with a known CVE at CVSS >= 7.0 that has not been patched.
   - Confirm lockfile is committed and CI uses a lock-respecting install with a CVE audit gate.

9. TLS and transport (T1557)
   - Confirm HSTS max-age is at least 31536000 with includeSubDomains.
   - Find any HTTP (non-TLS) route, mixed-content resource, or redirect that downgrades transport.
   - Flag any certificate that is expired or approaching expiry (within 30 days).

10. Infrastructure port exposure (SC-7)
    - Find database, cache, debug, or admin ports mapped to host interfaces outside 127.0.0.1 in
      container or orchestration config (docker-compose, Kubernetes Services, Dockerfile EXPOSE).
    - Find remote debug agents (e.g. JDWP, debugpy, node --inspect) in production process args.
    - Find management or admin servers bound to 0.0.0.0 in production base config.

11. Webhook shared-secret timing attack (T1078)
    - Find webhook receiver endpoints that compare shared secrets with a non-constant-time equality
      operator.
    - Find webhook receivers that process the payload before verifying the signature.

Scope rule: Do not flag settings that exist only in dev/test configuration (files or env vars
whose name or path clearly scopes them to local, dev, test, or CI environments only). Only report
production gaps.

Return JSON matching the findings schema. Give a coverage entry for EVERY area above: status clean
if you found no gap, gap if you did (and add the matching findings entry), not-checked with a
reason if you could not assess it, or not-applicable. Put only real gaps in findings; never
drop an area silently — a missing area reads as not-probed, which is worse than clean.`,

    defend: (f) => `You are a defensive security engineer performing a network and perimeter control
verification of the target system under authorized test. A red-team probe found the following:

FINDING
  title:    ${f.title}
  ttp:      ${f.ttp}
  severity: ${f.severity}
  location: ${f.location}
  detail:   ${f.detail}

Your task: determine whether an effective defensive control is in place that closes this specific gap.

SECURITY HEADERS (T1190 / SC-8)
  - Are all six required headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options,
    Referrer-Policy, Permissions-Policy) present with correct values on every non-static route?
  - Does CSP omit unsafe-inline and unsafe-eval?
  - NIST: SC-8, SC-18, SI-3

CORS (T1550 / SC-8)
  - Is CORS origin validated against a hardcoded allowlist?
  - Is Access-Control-Allow-Origin: * never paired with credentials: true?
  - Is Vary: Origin present on CORS responses?
  - NIST: SC-8, AC-3

AUTH ENFORCEMENT (T1078 / AC-3)
  - Is deny-all the default fallback for unmatched routes?
  - Are admin and diagnostic endpoints excluded from public exposure?
  - Are all function handlers set to require auth unless a documented rationale exists?
  - NIST: AC-3, AC-17, CM-7

SSRF (T1190 / SC-7)
  - Is there a host allowlist checked before any server-side fetch?
  - Are private address ranges blocked?
  - Are redirects not followed blindly?
  - NIST: SC-7, SI-10

OPEN REDIRECT (T1598 / SC-8)
  - Are redirect targets validated against an explicit allowlist?
  - Are wildcard patterns absent from OAuth/SSO redirect URI config?
  - NIST: SC-8, AC-3

RATE LIMITING (T1110 / SC-5)
  - Is there per-account rate limiting on login, reset, signup, and OTP endpoints?
  - Are rate-limit keys based on account identifier (not IP alone)?
  - NIST: SC-5, SI-3

SECRET EXPOSURE (T1552.001 / SC-28)
  - Are server-only secrets absent from client-bundled variables and frontend source?
  - Are config templates free of real secret values?
  - NIST: SC-28, AC-3

CVE PATCH (T1190 / SI-2)
  - Is a dependency vulnerability audit running as a CI gate?
  - Are all flagged CVE-bearing deps at or above the minimum safe version?
  - NIST: SI-2, RA-5

TLS / HSTS (T1557 / SC-8)
  - Is HSTS set with max-age >= 31536000 and includeSubDomains?
  - Is there no HTTP-downgrade path?
  - NIST: SC-8, SC-13

PORT EXPOSURE (SC-7 / CM-7)
  - Are DB, cache, debug, and admin ports bound to 127.0.0.1 or internal network only?
  - Are remote debug agents absent from production process args?
  - NIST: SC-7, CM-7

WEBHOOK TIMING (T1078 / IA-3)
  - Is shared-secret comparison done with a constant-time function?
  - Is the signature verified before the payload is processed?
  - NIST: IA-3, SI-10

Return JSON matching the verdict schema. Set defended: true only if you find an effective,
correctly-configured control that specifically closes this finding.`,
  },

  {
    key: 'social',

    attack: `You are an offensive security researcher performing a social-engineering and credential-theft
attack review of the target system under authorized test. Your job is to find exploitable weaknesses
in identity controls, authentication flows, session handling, authorization rules, and key containment.

Probe each area below. Put each confirmed or probable gap in findings. Record EVERY area in the
coverage ledger — including clean ones; a clean area is reported as clean, never left out.

COVERAGE AREAS

1. Authentication surface mapping (T1078)
   - Enumerate all public sign-in entry points: password, OAuth, magic link, SSO, SAML, passkey.
   - Find any endpoint that accepts authentication input that is not rate-limited.
   - Find any publicly accessible endpoint that should require auth.
   - Check that high-privilege roles (admin, operator, auditor, issuer) use a stricter auth flow
     than standard users.

2. Session and token storage (T1539)
   - Find access tokens stored in browser storage accessible to JavaScript
     (e.g. localStorage, sessionStorage) instead of httpOnly cookies or in-memory state.
   - Find session cookies without HttpOnly, Secure, and SameSite=Lax/Strict flags.
   - Find tokens logged or reflected in error responses.

3. MFA enforcement and step-up gating (T1111)
   - Find whether strong second-factor (TOTP, WebAuthn, hardware key) enrollment is required for
     high-privilege roles.
   - Check whether sensitive actions are gated on a verified step-up authentication level.
   - Find OAuth, magic-link, or SSO paths that grant high-privilege access while bypassing MFA.
   - Find whether brute-force protection (lockout, exponential backoff) is enabled on login.

4. Password reset and magic-link abuse (T1110 / T1539)
   - Check whether password reset or OTP flows reveal email-exists vs. not-found via status code,
     response body, or timing difference.
   - Check whether one-time link or OTP expiry exceeds 900 seconds.
   - Check whether one-time links are enforced as single-use.
   - Check whether OTP-request rate limiting prevents flooding.

5. JWT claim source / authorization confusion (T1550.001)
   - Find authorization logic that reads client-writable user attributes for access decisions
     (self-assertable claims must not gate server-side resources).
   - Find JWT validation that is missing issuer, audience, or expiry checks.
   - Find JWT validation that accepts alg: none.
   - Find JWT validation using a variable key without pinning the expected algorithm.

6. CORS, CSP, and transport (T1550 / T1539)
   - Find CORS misconfiguration that would allow a cross-origin page to read auth tokens or
     trigger authenticated requests.
   - Find a missing or weak CSP that permits inline scripts or unrestricted connect-src,
     enabling XSS-based token theft.
   - Find missing Strict-Transport-Security that allows SSL-strip / AiTM downgrade.

7. Help-desk and admin impersonation surface (T1078.004 / T1078.001)
   - Find admin user-management endpoints (password reset, role change, MFA re-enroll) that
     are not restricted to a specific admin or operator role.
   - Find any admin endpoint that does not emit an audit event recording the performing identity.
   - Find any admin operation that accepts a user-supplied role string without validating it
     against a fixed server-side allowlist.

8. OAuth / SSO trust chain (T1550.001)
   - Find OAuth flows using implicit grant instead of authorization code + PKCE.
   - Find OAuth or SSO redirect URI configuration with wildcard patterns.
   - Find state or nonce parameters that are fixed across requests (replayable).
   - Find OAuth client secrets stored in plaintext in committed config files.

9. Secret and privileged-key exposure (T1552.001)
   - Find server-side secrets (service keys, signing keys, admin tokens) in client-bundled
     variables, committed config files, config templates, or CI log output.
   - Find secret-scanning (e.g. TruffleHog, gitleaks) absent from the CI pipeline.
   - Check git log for historical leaks of privileged secrets.

10. Account enumeration (T1589.002)
    - Check whether sign-up on an existing address leaks a distinct error vs. a new address.
    - Check whether failed login distinguishes "user not found" from "wrong password".
    - Measure timing differences between the above paths (> 50 ms median = enumeration risk).

11. SAML / SSO assertion verification (T1606.002)
    - Find SAML response handlers that do not verify the assertion signature, or that accept a
      response with the signature element removed (signature stripping).
    - Find a signature check that verifies a signature present somewhere in the document but does not
      confirm it covers the exact assertion the app then reads — an added second assertion is consumed
      while the signed one validates (XML signature wrapping).
    - Find NameID or attribute parsing that trusts XML comments or differences in how the parser reads
      the document (admin<!---->@example.com read as admin@example.com).
    - Find SAML/XML parsing that resolves external entities (XXE in the assertion), or that does not
      pin the expected identity-provider signing certificate and issuer.

Scope rule: Do not flag settings that exist only in dev/test configuration (files or env vars
whose name or path clearly scopes them to local, dev, test, or CI environments only). Only report
production gaps.

Return JSON matching the findings schema. Give a coverage entry for EVERY area above: status clean
if you found no gap, gap if you did (and add the matching findings entry), not-checked with a
reason if you could not assess it, or not-applicable. Put only real gaps in findings; never
drop an area silently — a missing area reads as not-probed, which is worse than clean.`,

    defend: (f) => `You are a defensive security engineer performing a social-engineering and
credential-theft control verification of the target system under authorized test. A red-team probe
found the following:

FINDING
  title:    ${f.title}
  ttp:      ${f.ttp}
  severity: ${f.severity}
  location: ${f.location}
  detail:   ${f.detail}

Your task: determine whether an effective defensive control is in place that closes this specific gap.

AUTH SURFACE (T1078 / AC-3)
  - Is deny-all the default fallback? Are high-privilege roles on a stricter auth flow?
  - NIST: AC-3, IA-2

TOKEN STORAGE (T1539 / SC-28)
  - Are tokens stored in httpOnly cookies or in-memory — not JS-accessible browser storage?
  - Are cookies set with HttpOnly, Secure, SameSite=Lax or Strict?
  - NIST: SC-28, IA-5

MFA / STEP-UP (T1111 / IA-2)
  - Is strong second-factor required for high-privilege roles?
  - Are sensitive actions gated on a verified step-up authentication level?
  - Is brute-force protection (lockout or backoff) enabled on login?
  - NIST: IA-2(1), IA-2(2)

PASSWORD / ONE-TIME LINK (T1110 / IA-5)
  - Is the reset response identical for found and not-found address (status, body, timing)?
  - Is OTP or link expiry <= 900 seconds?
  - Are one-time links enforced as single-use?
  - Is OTP-request rate limiting in place to prevent flooding?
  - NIST: IA-5, IA-5(1)

JWT CLAIMS (T1550.001 / IA-9)
  - Does authorization logic read only server-controlled identity claims, never client-writable
    user attributes?
  - Is JWT validation checking issuer, audience, expiry, and algorithm?
  - Is alg: none rejected?
  - NIST: IA-9, AC-6

CORS / CSP (T1550 / SI-3)
  - Is CORS restricted to the exact production origin?
  - Does CSP block inline scripts and restrict connect-src?
  - Is HSTS present with includeSubDomains?
  - NIST: SC-8, SI-3

ADMIN / HELP-DESK (T1078.001 / AC-6)
  - Are admin endpoints gated to specific high-privilege roles?
  - Do all admin account-change ops emit an audit event with the performing identity?
  - Are admin role-name inputs validated against a fixed server-side allowlist?
  - NIST: AC-6, AU-2, AU-3

OAUTH / SSO (T1550.001 / IA-8)
  - Is PKCE enforced (code_challenge + S256)?
  - Are redirect URIs exact-match (no wildcards)?
  - Do state and nonce rotate per request?
  - Are OAuth client secrets stored as env vars (not plaintext in committed config)?
  - NIST: IA-8, SC-8

SECRET CONTAINMENT (T1552.001 / SC-12)
  - Are privileged server-side secrets absent from client bundles, committed config, and
    git history?
  - Is secret scanning (e.g. TruffleHog, gitleaks) running in CI?
  - NIST: SC-12, IA-5(7), SI-12

ACCOUNT ENUMERATION (T1589.002 / IA-5)
  - Are sign-up and password-reset responses identical for existing vs. non-existing address?
  - Is timing delta < 50 ms between the two paths?
  - NIST: IA-5(1)

SAML / SSO ASSERTION (T1606.002 / IA-9)
  - Is the assertion signature verified, and is a response with no signature rejected?
  - Does the check confirm the signature covers the exact assertion the app consumes (wrapping defense)?
  - Is NameID read without trusting XML comments, and are the identity-provider certificate and issuer pinned?
  - Is external-entity processing disabled on the SAML parser?
  - NIST: IA-9, SC-23, SI-10

Return JSON matching the verdict schema. Set defended: true only if you find an effective,
correctly-configured control that specifically closes this finding.`,
  },

  {
    key: 'injection-parser',

    attack: `You are an offensive security researcher performing an injection and parser-boundary attack review
of the target system under authorized test. Your job is to find exploitable weaknesses where
untrusted input crosses into an interpreter, query language, markup parser, template engine, file
path, response header, or object deserializer without being kept apart from code.

Probe each area below. Put each confirmed or probable gap in findings. Record EVERY area in the
coverage ledger — including clean ones; a clean area is reported as clean, never left out.

COVERAGE AREAS

1. Cross-site scripting — reflected, stored, and DOM (T1059.007)
   - Find untrusted input written into HTML, an attribute, or script context without output encoding
     or a safe templating default (e.g. innerHTML, dangerouslySetInnerHTML, document.write, v-html).
   - Find sinks fed from the URL, message events, or stored records that reach the DOM unescaped.
   - Check that a Content-Security-Policy without unsafe-inline backs up the output encoding.

2. SQL injection (T1190)
   - Find database queries built by joining untrusted input into the query string.
   - Confirm every query uses parameter binding (prepared statements) or a vetted query builder.
   - Find ORDER BY, LIMIT, table, or column names taken from input without an allowlist.

3. NoSQL injection (T1190)
   - Find document-store queries that pass an untrusted object straight into a filter
     (e.g. a request body merged into a Mongo query, allowing operator injection like $ne or $gt).
   - Confirm input is cast to the expected scalar type before it reaches the query.

4. LDAP injection (T1190)
   - Find directory searches that build a filter by joining untrusted input.
   - Confirm special filter characters are escaped before the filter is built.

5. XPath / XQuery injection (T1190)
   - Find XML queries that build an XPath or XQuery expression from joined untrusted input.
   - Confirm input is bound as a variable, not spliced into the expression text.

6. XML external entity — XXE (T1190)
   - Find XML parsers that resolve external entities or document type definitions on untrusted input.
   - Confirm parsers disable external-entity and DTD processing (secure-processing feature on).

7. Server-side template injection — SSTI (T1059)
   - Find user input joined into a template before the template engine renders it.
   - Confirm input is passed as render data, never compiled as part of the template source.

8. Path traversal / local file inclusion (T1083)
   - Find file reads, writes, or includes where the path is taken from input
     (e.g. ../ sequences, absolute paths, or null bytes reaching the filesystem).
   - Confirm the resolved path is checked to stay inside an intended base directory.

9. Unrestricted file upload (T1505.003)
   - Find upload handlers that trust a client-supplied name, content type, or extension.
   - Confirm uploads are type-checked by content, stored outside the web root, and never executed.

10. CRLF / HTTP header and response-splitting injection (T1190)
    - Find untrusted input placed into a response header, a redirect Location, or a log line without
      stripping carriage-return and line-feed characters.
    - Confirm header-setting paths reject embedded newlines.

11. Unsafe deserialization at parse boundaries (T1059)
    - Find untrusted bytes passed to a native or polymorphic deserializer
      (e.g. Java ObjectInputStream, Python pickle, PHP unserialize, YAML load with type tags).
    - Confirm parsing is limited to data-only formats read under a typed schema.

Scope rule: Do not flag settings that exist only in dev/test configuration (files or env vars
whose name or path clearly scopes them to local, dev, test, or CI environments only). Only report
production gaps.

Return JSON matching the findings schema. Give a coverage entry for EVERY area above: status clean
if you found no gap, gap if you did (and add the matching findings entry), not-checked with a
reason if you could not assess it, or not-applicable. Put only real gaps in findings; never
drop an area silently — a missing area reads as not-probed, which is worse than clean.`,

    defend: (f) => `You are a defensive security engineer performing an injection and parser-boundary control
verification of the target system under authorized test. A red-team probe found the following:

FINDING
  title:    ${f.title}
  ttp:      ${f.ttp}
  severity: ${f.severity}
  location: ${f.location}
  detail:   ${f.detail}

Your task: determine whether an effective defensive control is in place that closes this specific gap.

Use the guidance below to direct your verification.

CROSS-SITE SCRIPTING (T1059.007 / SI-15)
  - Is untrusted output context-encoded by a safe templating default, never raw HTML injection?
  - Does a Content-Security-Policy without unsafe-inline back up the encoding?
  - NIST: SI-15, SI-10, SC-18

SQL INJECTION (T1190 / SI-10)
  - Are all queries parameter-bound, with identifiers restricted to an allowlist?
  - NIST: SI-10

NOSQL INJECTION (T1190 / SI-10)
  - Is input cast to the expected scalar type before it reaches a document-store filter?
  - NIST: SI-10

LDAP INJECTION (T1190 / SI-10)
  - Are special filter characters escaped before the directory search filter is built?
  - NIST: SI-10

XPATH / XQUERY INJECTION (T1190 / SI-10)
  - Is untrusted input bound as a variable, never spliced into the expression text?
  - NIST: SI-10

XXE (T1190 / SI-10)
  - Do XML parsers disable external entities and DTD processing on untrusted input?
  - NIST: SI-10, CM-7

SERVER-SIDE TEMPLATE INJECTION (T1059 / SI-10)
  - Is input passed as render data, never compiled into the template source?
  - NIST: SI-10, CM-7

PATH TRAVERSAL / LFI (T1083 / AC-3)
  - Is the resolved path verified to stay inside an intended base directory before use?
  - NIST: AC-3, SI-10

FILE UPLOAD (T1505.003 / SI-10)
  - Are uploads content-checked, stored outside the web root, and never executed?
  - NIST: SI-10, CM-7, AC-6

CRLF / HEADER INJECTION (T1190 / SI-10)
  - Do header-setting paths reject embedded carriage-return and line-feed characters?
  - NIST: SI-10

UNSAFE DESERIALIZATION (T1059 / SI-10)
  - Is parsing limited to data-only formats read under a typed schema, never a native deserializer?
  - NIST: SI-10, CM-7, SI-3

Return JSON matching the verdict schema. Set defended: true only if you find an effective,
correctly-configured control that specifically closes this finding. Set it false or note "partial"
in control_present if the control is missing, misconfigured, or only partially effective.`,
  },

  {
    key: 'api-business-ai',

    attack: `You are an offensive security researcher performing an API, business-logic, and AI-agent attack
review of the target system under authorized test. Your job is to find exploitable weaknesses in
modern API surfaces, in the authorization and integrity of multi-step workflows, and in any
large-language-model or agent feature that acts on untrusted input.

Probe each area below. Put each confirmed or probable gap in findings. Record EVERY area in the
coverage ledger — including clean ones; a clean area is reported as clean, never left out.

COVERAGE AREAS

1. GraphQL abuse (T1190)
   - Find introspection left on in production, and queries with no depth or cost limit (a deeply
     nested query can exhaust the server).
   - Find resolvers that enforce authorization at the route but not per field or per object.
   - Find batched or aliased queries that sidestep per-request rate limits.

2. WebSocket / cross-site WebSocket hijacking (T1185)
   - Find WebSocket handshakes that do not check the Origin header, letting another site open an
     authenticated socket with the victim's cookies.
   - Find sockets that carry privileged actions without re-checking authorization per message.

3. Mass assignment / over-posting (T1190)
   - Find handlers that bind a whole request body onto a model, letting a caller set fields they
     should not control (e.g. role, isAdmin, ownerId, balance, verified).
   - Confirm input binding uses an explicit allowlist of writable fields.

4. Broken object-level authorization — BOLA / IDOR (T1190)
   - Find endpoints that take an object id from the caller and return or change it without checking
     the caller owns or may access that specific object.
   - Confirm the ownership check uses server-side identity, not a client-supplied owner value.

5. Cross-site request forgery — CSRF (T1190)
   - Find state-changing endpoints that rely only on the browser auto-sending a cookie, with no
     anti-forgery token and no SameSite restriction.
   - Confirm unsafe methods require a token or a custom header a cross-site form cannot set.

6. Host-header injection and password-reset poisoning (T1190)
   - Find code that builds links (reset, verify, callback) from the inbound Host or X-Forwarded-Host
     header, letting an attacker point the link at their own domain.
   - Confirm the trusted host comes from server config, not the request.

7. Web cache poisoning and deception (T1190)
   - Find responses keyed on a cache key that omits a header the response varies on, letting an
     attacker poison a shared cache.
   - Find sensitive, per-user responses that a misrouted path could cache for everyone.

8. HTTP request smuggling (T1190)
   - Find front-end and back-end servers that disagree on where one request ends and the next begins
     (conflicting Content-Length and Transfer-Encoding handling) on a proxied path.
   - Confirm the stack rejects unclear framing rather than forwarding it.

9. Business-logic abuse (T1190)
   - Find money or quota actions (refund, coupon, transfer, vote, redeem) that can be replayed,
     run with a negative or out-of-range amount, or driven past a limit by racing requests.
   - Find multi-step flows (checkout, onboarding, approval) where a later step can be reached
     without completing a required earlier one.
   - Confirm server-side checks enforce price, quantity, state, and ownership — never the client.

10. Large-language-model and agent abuse (AML.T0051)
    - Find prompts built from untrusted input (user text, retrieved documents, tool output) that can
      override the system instruction — direct and indirect prompt injection.
    - Find model or agent tools (shell, fetch, database, send-mail) wired with broad authority, so a
      poisoned prompt can reach more than the task needs — excessive agency.
    - Find model output used to drive a request, query, or file path without being treated as
      untrusted input — tool misuse and output-handling gaps.
    - Confirm secrets and other users' data are kept out of the model context window.

Scope rule: Do not flag settings that exist only in dev/test configuration (files or env vars
whose name or path clearly scopes them to local, dev, test, or CI environments only). Only report
production gaps.

Return JSON matching the findings schema. Give a coverage entry for EVERY area above: status clean
if you found no gap, gap if you did (and add the matching findings entry), not-checked with a
reason if you could not assess it, or not-applicable. Put only real gaps in findings; never
drop an area silently — a missing area reads as not-probed, which is worse than clean.`,

    defend: (f) => `You are a defensive security engineer performing an API, business-logic, and AI-agent control
verification of the target system under authorized test. A red-team probe found the following:

FINDING
  title:    ${f.title}
  ttp:      ${f.ttp}
  severity: ${f.severity}
  location: ${f.location}
  detail:   ${f.detail}

Your task: determine whether an effective defensive control is in place that closes this specific gap.

Use the guidance below to direct your verification.

GRAPHQL (T1190 / AC-3)
  - Is introspection off in production, with a depth and cost limit on queries?
  - Is authorization enforced per field and per object, not only at the route?
  - NIST: AC-3, SC-5, CM-7

WEBSOCKET / CSWSH (T1185 / AC-3)
  - Is the Origin header checked at the handshake, and authorization re-checked per message?
  - NIST: AC-3, SC-8

MASS ASSIGNMENT (T1190 / SI-10)
  - Is request binding restricted to an explicit allowlist of writable fields?
  - NIST: SI-10, AC-3

BROKEN OBJECT-LEVEL AUTHORIZATION (T1190 / AC-3)
  - Is every object access checked against server-side identity for that specific object?
  - NIST: AC-3, AC-4

CSRF (T1190 / SC-23)
  - Do state-changing requests require an anti-forgery token or a non-settable custom header?
  - Are session cookies set with SameSite=Lax or Strict?
  - NIST: SC-23, SI-10

HOST-HEADER / RESET POISONING (T1190 / SI-10)
  - Are generated links built from trusted server config, not the inbound Host header?
  - NIST: SI-10, SC-8

CACHE POISONING (T1190 / SC-8)
  - Does the cache key include every header the response varies on?
  - Are per-user responses marked private and kept out of shared caches?
  - NIST: SC-8, SI-10

HTTP SMUGGLING (T1190 / SC-8)
  - Does the stack reject unclear Content-Length / Transfer-Encoding framing?
  - NIST: SC-8, SI-10

BUSINESS LOGIC (T1190 / AC-3)
  - Are money and quota actions idempotent, range-checked, and safe under concurrent requests?
  - Are workflow steps enforced in order against server-side state?
  - NIST: AC-3, SI-10, SC-5

LLM / AI AGENT (AML.T0051 / SI-10)
  - Is untrusted text kept apart from trusted instructions, and model output treated as untrusted?
  - Do agent tools run with least authority, scoped to the task?
  - Are secrets and other users' data kept out of the model context?
  - NIST: SI-10, AC-6, SI-15

Return JSON matching the verdict schema. Set defended: true only if you find an effective,
correctly-configured control that specifically closes this finding. Set it false or note "partial"
in control_present if the control is missing, misconfigured, or only partially effective.`,
  },

  {
    key: 'platform-supply-chain',

    attack: `You are an offensive security researcher performing a platform, build, and supply-chain attack
review of the target system under authorized test. Your job is to find exploitable weaknesses in
how software is sourced, built, signed, deployed, configured in the cloud, and watched in
production — the path from source to running service.

Probe each area below. Put each confirmed or probable gap in findings. Record EVERY area in the
coverage ledger — including clean ones; a clean area is reported as clean, never left out.

COVERAGE AREAS

1. Bill of materials, provenance, and artifact signing (T1195.002)
   - Check whether the build produces a software bill of materials and a provenance record of how
     and from what the artifact was built.
   - Find deploys that pull an image or package without verifying a signature or digest.
   - Confirm released artifacts are signed and the signature is checked before they run.

2. Pipeline integrity and action pinning (T1195.002)
   - Find third-party CI steps referenced by a moving tag or branch instead of a pinned commit
     digest (a moved tag silently changes the code that runs with pipeline secrets).
   - Find pipeline tokens granted broad write scope, or secrets exposed to steps triggered by an
     untrusted pull request.
   - Confirm the pipeline runs least-privilege and untrusted contributions cannot reach secrets.

3. Build integrity and repeatable builds (T1574)
   - Find build steps that fetch and run an unpinned remote script (curl piped to a shell) or pull a
     base image by a moving tag rather than a digest.
   - Confirm the install step respects a committed lockfile on a pinned toolchain.

4. Cloud IAM and storage misconfiguration (T1530)
   - Find object stores, buckets, snapshots, or images set to public or world-readable.
   - Find IAM roles or policies with wildcard actions or resources, or long-lived static keys where
     a short-lived role would do.
   - Confirm storage is encrypted at rest and access is scoped to least privilege.

5. Container and orchestration config (T1611)
   - Find containers that run as root, run privileged, or mount the host filesystem or host network.
   - Find workloads missing a security context (run-as-non-root, read-only root filesystem, dropped
     capabilities), resource limits, or a network policy.
   - Find secrets passed as plain environment values instead of a mounted secret.

6. Logging, monitoring, and tamper detection (T1562.001)
   - Find security-relevant events (sign-in failure, authorization denial, admin action) that are
     not logged, leaving an attack invisible.
   - Confirm logs are shipped off the host, are tamper-evident, and raise an alert on the events
     that matter.
   - Find logs that record secrets or personal data they should not hold.

7. Secret management, key custody, and rotation (T1552)
   - Find secrets kept in plain files, environment values, or committed config instead of a managed
     vault or key service.
   - Confirm a rotation policy exists and access to each secret is scoped to least privilege.
   - Find encryption keys that are never rotated or are stored beside the data they protect.

8. Dangling DNS and subdomain takeover (T1584.001)
   - Find committed DNS or infrastructure config (zone files, Terraform route records, Kubernetes
     Ingress or service hosts, CDN aliases) with a CNAME or alias that points at a third-party
     service endpoint — object storage, a platform-as-a-service app, a pages host, a SaaS target.
   - Flag any such pointer whose backing resource may be unclaimed — a removed bucket, a deleted app,
     a closed SaaS account — which an attacker can register and serve content from.
   - Confirm a cleanup step removes the DNS record when the backing service is retired, so a record
     never outlives the resource it names.

Scope rule: Do not flag settings that exist only in dev/test configuration (files or env vars
whose name or path clearly scopes them to local, dev, test, or CI environments only). Only report
production gaps.

Return JSON matching the findings schema. Give a coverage entry for EVERY area above: status clean
if you found no gap, gap if you did (and add the matching findings entry), not-checked with a
reason if you could not assess it, or not-applicable. Put only real gaps in findings; never
drop an area silently — a missing area reads as not-probed, which is worse than clean.`,

    defend: (f) => `You are a defensive security engineer performing a platform, build, and supply-chain control
verification of the target system under authorized test. A red-team probe found the following:

FINDING
  title:    ${f.title}
  ttp:      ${f.ttp}
  severity: ${f.severity}
  location: ${f.location}
  detail:   ${f.detail}

Your task: determine whether an effective defensive control is in place that closes this specific gap.

Use the guidance below to direct your verification.

BILL OF MATERIALS / PROVENANCE / SIGNING (T1195.002 / SR-4)
  - Is a software bill of materials and a build provenance record produced for each release?
  - Are artifacts signed and the signature verified before they run?
  - NIST: SR-4, SR-11, SI-7

PIPELINE INTEGRITY / ACTION PINNING (T1195.002 / SR-11)
  - Are third-party CI steps pinned to a commit digest, not a moving tag?
  - Does the pipeline run least-privilege, with secrets unreachable from untrusted pull requests?
  - NIST: SR-11, CM-7, SI-7

BUILD INTEGRITY (T1574 / SI-7)
  - Does the build avoid unpinned remote scripts and pull base images by digest?
  - Is the install lockfile-respecting on a pinned toolchain?
  - NIST: SI-7, SR-11, CM-2

CLOUD IAM / STORAGE (T1530 / AC-6)
  - Are object stores private and encrypted at rest?
  - Are IAM policies free of wildcard actions, with short-lived roles instead of static keys?
  - NIST: AC-6, AC-3, SC-28

CONTAINER / ORCHESTRATION (T1611 / CM-7)
  - Do workloads run non-root with a least-privilege security context and dropped capabilities?
  - Are host mounts, privileged mode, and plain-env secrets absent?
  - NIST: CM-7, AC-6, SC-39

LOGGING / MONITORING (T1562.001 / AU-6)
  - Are security-relevant events logged, shipped off-host, tamper-evident, and alerted on?
  - Are secrets and personal data kept out of the logs?
  - NIST: AU-2, AU-6, AU-9, SI-4

SECRET MANAGEMENT / ROTATION (T1552 / SC-12)
  - Are secrets held in a managed vault or key service, not plain files or committed config?
  - Is there a rotation policy with least-privilege access, and are encryption keys rotated?
  - NIST: SC-12, SC-28, IA-5

DANGLING DNS / SUBDOMAIN TAKEOVER (T1584.001 / CM-8)
  - Does every committed CNAME or alias to a third-party service have a still-owned backing resource?
  - Is there a cleanup step that removes the DNS record when the service is retired?
  - NIST: CM-8, SR-11

Return JSON matching the verdict schema. Set defended: true only if you find an effective,
correctly-configured control that specifically closes this finding. Set it false or note "partial"
in control_present if the control is missing, misconfigured, or only partially effective.`,
  },
]

// ── Independent triage (refute) — drop false alarms before any fix work ───────
// A separate, skeptical pass between find and defend: the same false-positive
// discipline as the adversarial-review workflow, so blue never burns effort on
// a finding that was never real.

const triagePrompt = (f) => `You are an INDEPENDENT security triager under authorized, local-only review.
You did not find this and you do not have to defend it — decide only whether it is REAL. A red-team
lens reported:

FINDING
  title:    ${f.title}
  ttp:      ${f.ttp}
  severity: ${f.severity}
  location: ${f.location}
  detail:   ${f.detail}

Decide whether this is a real, exploitable gap or a false alarm:
- Require concrete evidence at the cited location. If the evidence is not there, it is not real.
- Trace exploitability: who can trigger it, under what preconditions, and what the impact is.
- Default to real=false when the evidence is thin or you are uncertain — a false alarm wastes the fix.

Return JSON matching the triage schema.`

// ── Workflow ─────────────────────────────────────────────────────────────────

phase('Attack')
log('Authorized, local-only security review. Active probing of remote/production hosts is refused — this sweep reads code and config only.')
log('Each lens: find gaps -> independent triage (drop false alarms) -> verify the control. Coverage is recorded for every area, clean or not.')

const results = await pipeline(
  LENSES,

  // Stage 1 — attacker lens: find gaps + report coverage for every area
  (lens) => agent(AUTH_PREAMBLE + lens.attack, {
    label: `attack:${lens.key}`,
    phase: 'Attack',
    schema: FINDINGS,
  }),

  // Stage 2 — independent triage: refute each finding; only real, evidenced gaps survive
  (found, lens) => {
    const findings = found && found.findings ? found.findings : []
    const coverage = found && found.coverage ? found.coverage : []
    return parallel(
      findings.map((f) => () =>
        agent(AUTH_PREAMBLE + triagePrompt(f), {
          label: `triage:${lens.key}`,
          phase: 'Triage',
          schema: TRIAGE,
        }).then((t) => (t && t.real ? f : null))
      )
    ).then((kept) => ({ coverage, survivors: kept.filter(Boolean) }))
  },

  // Stage 3 — defender lens: verify a control exists for each surviving finding
  (triaged, lens) => {
    const survivors = triaged && triaged.survivors ? triaged.survivors : []
    const coverage = triaged && triaged.coverage ? triaged.coverage : []
    return parallel(
      survivors.map((f) => () =>
        agent(AUTH_PREAMBLE + lens.defend(f), {
          label: `defend:${lens.key}`,
          phase: 'Defend',
          schema: VERDICT,
        }).then((v) => ({
          ...f,
          lens:            lens.key,
          defended:        v ? v.defended        : null,
          control_present: v ? v.control_present : 'unknown',
          nist:            v ? v.nist            : '',
          fix:             v ? v.fix             : 'verify manually',
        }))
      )
    ).then((findings) => ({ lens: lens.key, coverage, findings: findings.filter(Boolean) }))
  },
)

const lensResults = results.filter(Boolean)
return {
  coverage: lensResults.flatMap((r) => (r.coverage || []).map((c) => ({ lens: r.lens, ...c }))),
  findings: lensResults.flatMap((r) => r.findings || []),
}
