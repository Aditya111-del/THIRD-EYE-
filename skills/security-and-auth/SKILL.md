---
name: security-and-auth
description: Implement secure authentication, authorization, token rotation, and OWASP top 10 security hardening across modern applications
tools: [listDir, readFile, writeFile, editFile]
---
# Security, Identity & Authentication Skill

## Goal
Harden applications against security vulnerabilities (OWASP Top 10), implement rock-solid authentication and authorization protocols, and safeguard confidential user data.

---

## Security Directives

### 1. Authentication Standards
- **Password Storage**: Never store plaintext passwords. Always hash using `bcrypt` (minimum 10-12 salt rounds) or `argon2id`.
- **JWT / Session Tokens**:
  * Store tokens in `HttpOnly`, `Secure`, `SameSite=Strict` cookies to block XSS theft.
  * Set short-lived access tokens (15-30 minutes) and long-lived refresh tokens (7-30 days) with database token revocation checks.
- **Multi-Factor & Social OAuth**: Support OAuth2 providers (Google, GitHub) with state parameter CSRF validation.

### 2. Injection & XSS Defense
- **SQL Injection**: Always use parameterized queries or trusted ORM abstraction. Never concatenate user input into SQL strings.
- **Cross-Site Scripting (XSS)**: Sanitize raw HTML rendering using `DOMPurify`. Never pass unescaped user content to `dangerouslySetInnerHTML`.
- **Content Security Policy (CSP)**: Set strict HTTP headers (`Helmet` in Express) disabling unauthorized script injection.

### 3. Rate Limiting & DoS Protection
- Apply rate limiting on authentication routes (e.g. max 5 login attempts per 15 minutes per IP).
- Validate payload sizes (`limit: '1mb'`) to prevent memory exhaustion attacks.
