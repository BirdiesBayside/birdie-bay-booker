# Architecture rules

- Public marketing metadata uses the shared Seo component with route-owned canonical URLs; keep static social fallbacks and business JSON-LD in index.html, without a second static canonical, to avoid duplicate page identities.
- Generate public/sitemap.xml from scripts/generate-sitemap.ts before dev and builds; list only public discovery routes and omit lastmod unless an authoritative page-specific content timestamp exists.

- Complimentary admin session extensions use `admin_extend_session` for atomic availability checks and end-time updates; retain purchased duration and payment fields to avoid altering billing/credits, and refresh door access after saving. Bay automation and timetable occupancy must derive their end from `end_time`, not purchased duration, so complimentary time is respected without changing billing.

- Local competition teams created from existing players use `teamFromCurrentPlayers` and read player handicaps again before saving; the shared player roster remains the source of truth and must not be reset by team creation.