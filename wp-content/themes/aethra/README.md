# Aethra WordPress theme

Single scrolling page: hero, problem, three steps, applications, status, contact.

## Install
1. Copy this folder to `wp-content/themes/aethra` on a WordPress 6.3+ site (PHP 7.4+).
2. Activate it under Appearance > Themes. Set the site title (working title: Aethra).
3. Settings > Reading: show a static page or latest posts; the front page uses `front-page.php` either way.
4. Settings > Privacy: create and select the privacy statement page. The footer and form link to it automatically.

## Editing (admin panel)
Appearance > Customize > **Aethra content** holds every text on the page, the contact address that receives messages, and three optional photo slots (hero, problem, status). Logo: Customize > Site Identity (until then a provisional wordmark is shown).

## Contact form
Nonce, honeypot and minimum fill time; messages are only e-mailed (no database storage). Receiving address: Customizer > Contact > Contact Email (falls back to the WordPress admin e-mail). Configure SMTP on the host so mail is delivered reliably.

## Privacy and external services
No external fonts, analytics, embeds or CDN; emoji and oEmbed remote requests are disabled. Add any such service only after a privacy assessment.

## Before launch (not handled by the theme)
- Trademark check for the name (BOIP/EUIPO); a company called AETHRA exists in the same sector.
- Verify the cited statistics against their sources, and have texts reviewed for claims (ACM) and investor communication (AFM).
- Photos: upload only images you may use; show AI imagery as atmosphere only.
- Fill in company details (legal form, registration number, address) and the privacy statement.
