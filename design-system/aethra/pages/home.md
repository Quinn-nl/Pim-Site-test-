# Aethra home page: overrides on MASTER.md

These rules take precedence over `MASTER.md` for the single-page site.

| Topic | MASTER default | Decision for Aethra | Reason |
|-------|---------------|---------------------|--------|
| Mode | Dark first | Light page, dark hero and status band | Client: "mainly light"; space feel kept in two bands |
| Fonts | Exo / Roboto Mono (Google Fonts) | System font stack + system mono | No external requests (privacy, no third-party data transfer) |
| Motion | GSAP scroll reveal | CSS/IntersectionObserver reveal, 10px, 0.4s | Client: "a little"; audience is investors and municipalities; no external script |
| Accent | #3B82F6 | #1F5FD1 | 4.5:1+ against white for text and buttons |
| Imagery | Photos | Editor uploads in the admin panel; none bundled | No stock/external sources; rights stay with the client. Never present AI imagery as the prototype |
| Copy | n/a | No emission-reduction figures, no HOW (possible patent), no offer of shares or returns | ACM, AFM and patent considerations |
