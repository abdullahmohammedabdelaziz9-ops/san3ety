# Security Policy

## Before launch
- Never commit API keys, passwords, Supabase service-role/secret keys, or provider credentials.
- `config.js` is public browser code and may contain only the Supabase Project URL and publishable/anon key. Keep `GEMINI_API_KEY` and Supabase service-role keys in Supabase Edge Function Secrets.
- Keep Row Level Security enabled. The AI matching RPC returns only public directory fields for verified and available artisans; it must not expose phone numbers, email addresses, or private profile fields.
- The AI diagnosis function is public by design for visitors and therefore has a server-side request quota. Monitor usage and add production-grade abuse controls before a public marketing launch.
- Uploaded photos are resized in the browser and processed by the Edge Function; SAN3TY does not write them to its database. Images are still sent to Google Gemini after the user consents.

## AI and privacy
- Tell users that image analysis uses an external Google AI service. Do not ask for faces, identity documents, cards, keys, access codes, or other sensitive information.
- The free Gemini API tier may use submitted content to improve Google's products. Review current provider terms and data processing conditions before launch. Consider a paid tier for sensitive workloads.
- AI provides preliminary guidance only. Never present it as a definitive diagnosis, guarantee, quote, or substitute for a qualified technician. Do not instruct users to repair electrical, gas, fire, or structural hazards themselves.

## Platform safeguards
- Keep roles, verification status, completed-job counts, ratings, booking lifecycle, and payment state under trusted server-side or administrative control.
- Do not expose customer contact information to public artisan discovery.
- Payment records are references/status only. Do not claim escrow or protected funds until a payment provider and compliant funds flow have been implemented and tested.
- Before production, add authentication, booking authorization, dispute handling, audit logs, backup/retention rules, and a reviewed privacy notice.

Report security issues privately to the project maintainers rather than publishing exploit details.
