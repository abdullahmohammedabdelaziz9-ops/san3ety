# Security Policy

## Scope

SAN3TY is currently a frontend prototype with a starter Supabase schema. Do not submit real customer, address, identity, payment-card, or authentication data to the demo.

## Reporting a vulnerability

Please do not publish secrets, personal data, or exploitable details in a public issue. Contact the repository owner privately through GitHub to coordinate a responsible disclosure.

## Deployment and secrets

- Never commit `.env` files, access tokens, database passwords, Supabase `service_role` keys, or AI/payment provider secrets.
- Browser code may only use public client keys protected by correctly tested Row Level Security policies.
- Put privileged operations, payment webhooks, provider verification, and AI provider calls behind trusted server-side endpoints.
- Review RLS, column grants, input validation, rate limits, logs, and backup/restore procedures before production use.