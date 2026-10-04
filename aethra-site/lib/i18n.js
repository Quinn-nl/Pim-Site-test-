'use strict';
/**
 * Languages, interface strings, per-language default copy and language detection.
 * English is the source language; other languages override by key.
 * All translations are a first draft: have a native speaker review them.
 */
const { DEFAULTS } = require('./fields');
const { audienceTranslations } = require('./audiences');

const LANGS = ['en', 'nl', 'de', 'fr'];
const DEFAULT_LANG = 'en';
const LANG_NAMES = { en: 'English', nl: 'Nederlands', de: 'Deutsch', fr: 'Français' };
const OG_LOCALE = { en: 'en_GB', nl: 'nl_NL', de: 'de_DE', fr: 'fr_FR' };

const UI = {
	en: {
		faq_title: 'Frequently asked questions',
		learn_more: 'Learn more',
		aud_other: 'Other audiences',
		aud_for: 'For',
		ar_subject: 'We received your message',
		ar_body: 'Thank you for contacting {name}. We have received your message and will reply by email. {reply}\n\nThis is an automatic confirmation; you do not need to reply.',
		rm_done: 'completed',
		rm_current: 'current phase',
		n_expired: 'This form expired. Your text is still here, please send it again.',
		e_name: 'Enter your name.',
		e_email: 'Enter a valid email address.',
		e_msg: 'Write a message.',
		e_consent: 'Tick the box to agree.',
		ok_title: 'Message sent',
		ok_next: 'What happens next',
		ok_1: 'We read your message.',
		ok_2: 'We reply by email.',
		ok_home: 'Back to the home page',
		ok_how: 'How it works',
		contact_aside: 'Contact',
		skip: 'Skip to content', menu: 'Menu', language: 'Language',
		nav_problem: 'The problem', nav_how: 'How it works', nav_apps: 'Applications', nav_contact: 'Contact', footer_nav: 'Footer', primary_nav: 'Primary',
		privacy: 'Privacy statement', privacy_link: 'privacy statement', disclaimer: 'Informational website; not an offer of securities or financial products.',
		how_cta: 'How it works', read_problem: 'The problem in detail', read_how: 'More about how it works', read_apps: 'See the applications', next_problem: 'How we respond',
		nav_today: 'Eco mode today', k_today: 'Context', src_title: 'Sources', more_title: 'Further reading',
		source: 'Source', phase: 'Development phase', rm: ['Concept', 'Prototype', 'Validation', 'Pilots'],
		k_problem: 'The problem', k_how: 'How it works', k_apps: 'Applications', k_status: 'Status', k_contact: 'Contact',
		card_cta: 'Talk to us about this',
		f_name: 'Name', f_email: 'Email', f_org: 'Organisation', f_role: 'I am a(n)', f_msg: 'Message', f_send: 'Send message',
		f_consent: 'I agree that my details are used to reply to this message. See the {link}.', f_trust: 'Your details are only used to reply. No newsletters, no tracking.',
		n_sent: 'Thank you. Your message has been sent.', n_invalid: 'Please complete all required fields, including consent.',  
		roles: { Investor: 'Investor', Municipality: 'Municipality', 'Fleet operator': 'Fleet operator', 'Vehicle manufacturer': 'Vehicle manufacturer', 'Mobility platform': 'Mobility platform', Other: 'Other' },
		nf_title: 'Page not found', nf_back: 'Back to the home page', privacy_title: 'Privacy statement', privacy_desc: 'How Aethra handles personal data: what the contact form stores, how long, and how to ask for access or deletion.',
		f_sending: 'Sending…',
		f_required: 'Fields marked * are required.',
		n_error: 'Your message could not be sent. Your text is still here, please try again in a moment.',
		n_limit: 'Too many messages from your network. Your text is still here, please try again later.',
	},
	nl: {
		faq_title: 'Veelgestelde vragen',
		learn_more: 'Meer informatie',
		aud_other: 'Andere doelgroepen',
		aud_for: 'Voor',
		ar_subject: 'Wij hebben uw bericht ontvangen',
		ar_body: 'Bedankt voor uw bericht aan {name}. Wij hebben het ontvangen en reageren per e-mail. {reply}\n\nDit is een automatische bevestiging; u hoeft hierop niet te antwoorden.',
		rm_done: 'afgerond',
		rm_current: 'huidige fase',
		n_expired: 'Dit formulier is verlopen. Uw tekst staat er nog, verstuur het opnieuw.',
		e_name: 'Vul uw naam in.',
		e_email: 'Vul een geldig e-mailadres in.',
		e_msg: 'Schrijf een bericht.',
		e_consent: 'Vink het vakje aan om akkoord te gaan.',
		ok_title: 'Bericht verzonden',
		ok_next: 'Wat er daarna gebeurt',
		ok_1: 'Wij lezen uw bericht.',
		ok_2: 'Wij reageren per e-mail.',
		ok_home: 'Terug naar de startpagina',
		ok_how: 'Hoe het werkt',
		contact_aside: 'Contact',
		skip: 'Ga naar de inhoud', menu: 'Menu', language: 'Taal',
		nav_problem: 'Het probleem', nav_how: 'Hoe het werkt', nav_apps: 'Toepassingen', nav_contact: 'Contact', footer_nav: 'Voettekst', primary_nav: 'Hoofdmenu',
		privacy: 'Privacyverklaring', privacy_link: 'privacyverklaring', disclaimer: 'Informatieve website; geen aanbod van effecten of financiële producten.',
		how_cta: 'Hoe het werkt', read_problem: 'Het probleem in detail', read_how: 'Meer over hoe het werkt', read_apps: 'Bekijk de toepassingen', next_problem: 'Hoe wij reageren',
		nav_today: 'Ecomodus vandaag', k_today: 'Context', src_title: 'Bronnen', more_title: 'Verder lezen',
		source: 'Bron', phase: 'Ontwikkelfase', rm: ['Concept', 'Prototype', 'Validatie', 'Pilots'],
		k_problem: 'Het probleem', k_how: 'Hoe het werkt', k_apps: 'Toepassingen', k_status: 'Status', k_contact: 'Contact',
		card_cta: 'Praat met ons hierover',
		f_name: 'Naam', f_email: 'E-mail', f_org: 'Organisatie', f_role: 'Ik ben', f_msg: 'Bericht', f_send: 'Bericht versturen',
		f_consent: 'Ik ga ermee akkoord dat mijn gegevens worden gebruikt om op dit bericht te reageren. Zie de {link}.', f_trust: 'Uw gegevens worden alleen gebruikt om te reageren. Geen nieuwsbrieven, geen tracking.',
		n_sent: 'Dank u. Uw bericht is verzonden.', n_invalid: 'Vul alle verplichte velden in, inclusief toestemming.',  
		roles: { Investor: 'Investeerder', Municipality: 'Gemeente', 'Fleet operator': 'Wagenparkbeheerder', 'Vehicle manufacturer': 'Voertuigfabrikant', 'Mobility platform': 'Mobiliteitsplatform', Other: 'Anders' },
		nf_title: 'Pagina niet gevonden', nf_back: 'Terug naar de startpagina', privacy_title: 'Privacyverklaring', privacy_desc: 'Hoe Aethra met persoonsgegevens omgaat: wat het contactformulier bewaart, hoe lang en hoe u inzage of verwijdering vraagt.',
		f_sending: 'Bezig met versturen…',
		f_required: 'Velden met * zijn verplicht.',
		n_error: 'Uw bericht kon niet worden verzonden. Uw tekst staat er nog, probeer het over enkele ogenblikken opnieuw.',
		n_limit: 'Te veel berichten vanaf uw netwerk. Uw tekst staat er nog, probeer het later opnieuw.',
	},
	de: {
		faq_title: 'Häufig gestellte Fragen',
		learn_more: 'Mehr erfahren',
		aud_other: 'Weitere Zielgruppen',
		aud_for: 'Für',
		ar_subject: 'Wir haben Ihre Nachricht erhalten',
		ar_body: 'Vielen Dank für Ihre Nachricht an {name}. Wir haben sie erhalten und antworten per E-Mail. {reply}\n\nDies ist eine automatische Bestätigung; Sie müssen nicht antworten.',
		rm_done: 'abgeschlossen',
		rm_current: 'aktuelle Phase',
		n_expired: 'Dieses Formular ist abgelaufen. Ihr Text ist noch da, bitte senden Sie es erneut.',
		e_name: 'Geben Sie Ihren Namen ein.',
		e_email: 'Geben Sie eine gültige E-Mail-Adresse ein.',
		e_msg: 'Schreiben Sie eine Nachricht.',
		e_consent: 'Setzen Sie das Häkchen, um zuzustimmen.',
		ok_title: 'Nachricht gesendet',
		ok_next: 'Wie es weitergeht',
		ok_1: 'Wir lesen Ihre Nachricht.',
		ok_2: 'Wir antworten per E-Mail.',
		ok_home: 'Zurück zur Startseite',
		ok_how: 'So funktioniert es',
		contact_aside: 'Kontakt',
		skip: 'Zum Inhalt springen', menu: 'Menü', language: 'Sprache',
		nav_problem: 'Das Problem', nav_how: 'So funktioniert es', nav_apps: 'Anwendungen', nav_contact: 'Kontakt', footer_nav: 'Fußzeile', primary_nav: 'Hauptmenü',
		privacy: 'Datenschutzerklärung', privacy_link: 'Datenschutzerklärung', disclaimer: 'Informationswebsite; kein Angebot von Wertpapieren oder Finanzprodukten.',
		how_cta: 'So funktioniert es', read_problem: 'Das Problem im Detail', read_how: 'Mehr dazu, wie es funktioniert', read_apps: 'Anwendungen ansehen', next_problem: 'Wie wir reagieren',
		nav_today: 'Eco-Modus heute', k_today: 'Kontext', src_title: 'Quellen', more_title: 'Weiterführend',
		source: 'Quelle', phase: 'Entwicklungsphase', rm: ['Konzept', 'Prototyp', 'Validierung', 'Pilotprojekte'],
		k_problem: 'Das Problem', k_how: 'So funktioniert es', k_apps: 'Anwendungen', k_status: 'Stand', k_contact: 'Kontakt',
		card_cta: 'Sprechen Sie mit uns darüber',
		f_name: 'Name', f_email: 'E-Mail', f_org: 'Organisation', f_role: 'Ich bin', f_msg: 'Nachricht', f_send: 'Nachricht senden',
		f_consent: 'Ich bin damit einverstanden, dass meine Angaben zur Beantwortung dieser Nachricht verwendet werden. Siehe {link}.', f_trust: 'Ihre Angaben werden nur zur Antwort verwendet. Keine Newsletter, kein Tracking.',
		n_sent: 'Vielen Dank. Ihre Nachricht wurde gesendet.', n_invalid: 'Bitte füllen Sie alle Pflichtfelder aus, einschließlich der Einwilligung.',  
		roles: { Investor: 'Investor', Municipality: 'Kommune', 'Fleet operator': 'Flottenbetreiber', 'Vehicle manufacturer': 'Fahrzeughersteller', 'Mobility platform': 'Mobilitätsplattform', Other: 'Sonstiges' },
		nf_title: 'Seite nicht gefunden', nf_back: 'Zurück zur Startseite', privacy_title: 'Datenschutzerklärung', privacy_desc: 'Wie Aethra mit personenbezogenen Daten umgeht: was das Kontaktformular speichert, wie lange und wie Sie Auskunft oder Löschung verlangen.',
		f_sending: 'Wird gesendet…',
		f_required: 'Mit * markierte Felder sind Pflichtfelder.',
		n_error: 'Ihre Nachricht konnte nicht gesendet werden. Ihr Text ist noch da, bitte versuchen Sie es gleich noch einmal.',
		n_limit: 'Zu viele Nachrichten aus Ihrem Netzwerk. Ihr Text ist noch da, bitte versuchen Sie es später erneut.',
	},
	fr: {
		faq_title: 'Questions fréquentes',
		learn_more: 'En savoir plus',
		aud_other: 'Autres publics',
		aud_for: 'Pour',
		ar_subject: 'Nous avons bien reçu votre message',
		ar_body: 'Merci d’avoir contacté {name}. Nous avons bien reçu votre message et répondrons par e-mail. {reply}\n\nCeci est une confirmation automatique ; vous n’avez pas besoin de répondre.',
		rm_done: 'terminée',
		rm_current: 'phase actuelle',
		n_expired: 'Ce formulaire a expiré. Votre texte est toujours là, veuillez le renvoyer.',
		e_name: 'Saisissez votre nom.',
		e_email: 'Saisissez une adresse e-mail valide.',
		e_msg: 'Écrivez un message.',
		e_consent: 'Cochez la case pour accepter.',
		ok_title: 'Message envoyé',
		ok_next: 'La suite',
		ok_1: 'Nous lisons votre message.',
		ok_2: 'Nous répondons par e-mail.',
		ok_home: 'Retour à l’accueil',
		ok_how: 'Comment ça marche',
		contact_aside: 'Contact',
		skip: 'Aller au contenu', menu: 'Menu', language: 'Langue',
		nav_problem: 'Le problème', nav_how: 'Comment ça marche', nav_apps: 'Applications', nav_contact: 'Contact', footer_nav: 'Pied de page', primary_nav: 'Menu principal',
		privacy: 'Politique de confidentialité', privacy_link: 'politique de confidentialité', disclaimer: 'Site d’information ; ne constitue pas une offre de titres ou de produits financiers.',
		how_cta: 'Comment ça marche', read_problem: 'Le problème en détail', read_how: 'En savoir plus sur le fonctionnement', read_apps: 'Voir les applications', next_problem: 'Notre réponse',
		nav_today: 'Mode éco aujourd’hui', k_today: 'Contexte', src_title: 'Sources', more_title: 'Pour aller plus loin',
		source: 'Source', phase: 'Phase de développement', rm: ['Concept', 'Prototype', 'Validation', 'Projets pilotes'],
		k_problem: 'Le problème', k_how: 'Comment ça marche', k_apps: 'Applications', k_status: 'Statut', k_contact: 'Contact',
		card_cta: 'Parlons-en',
		f_name: 'Nom', f_email: 'E-mail', f_org: 'Organisation', f_role: 'Je suis', f_msg: 'Message', f_send: 'Envoyer le message',
		f_consent: 'J’accepte que mes données soient utilisées pour répondre à ce message. Voir la {link}.', f_trust: 'Vos données servent uniquement à vous répondre. Pas de newsletter, pas de suivi.',
		n_sent: 'Merci. Votre message a été envoyé.', n_invalid: 'Veuillez remplir tous les champs obligatoires, y compris le consentement.',  
		roles: { Investor: 'Investisseur', Municipality: 'Commune', 'Fleet operator': 'Gestionnaire de flotte', 'Vehicle manufacturer': 'Constructeur automobile', 'Mobility platform': 'Plateforme de mobilité', Other: 'Autre' },
		nf_title: 'Page introuvable', nf_back: 'Retour à l’accueil', privacy_title: 'Politique de confidentialité', privacy_desc: 'Comment Aethra traite les données personnelles : ce que le formulaire de contact conserve, combien de temps, et comment demander l’accès ou la suppression.',
		f_sending: 'Envoi en cours…',
		f_required: 'Les champs marqués d’un * sont obligatoires.',
		n_error: 'Votre message n’a pas pu être envoyé. Votre texte est toujours là, veuillez réessayer dans un instant.',
		n_limit: 'Trop de messages depuis votre réseau. Votre texte est toujours là, veuillez réessayer plus tard.',
	},
};

/* Default copy per language (only keys that differ from English). */
const TR = {
	nl: {
		seo_home: 'Aethra: CubeSats en AI voor schonere lucht in het verkeer',
		seo_problem: 'Luchtvervuiling waar het verkeer het drukst is',
		seo_how: 'Hoe het werkt: detecteren, bepalen, schakelen',
		seo_apps: 'Toepassingen voor gemeenten en wagenparken',
		seo_contact: 'Contact: gemeente, wagenpark of investeerder',
		fact1_value: '4,2 miljoen', fact2_value: '182.000',
		meta_description: 'Aethra ontwikkelt CubeSats en AI waarmee voertuigen overschakelen op een ecomodus in gebieden met veel luchtvervuiling.',
		company_line: 'Bedrijfsgegevens volgen.',
		seo_today: 'Geofenced ecomodus vandaag: wat ontbreekt', today_title: 'Geofenced ecomodus vandaag: wat bestaat er en wat ontbreekt nog', today_lead: 'Meerdere autofabrikanten en vlootprojecten schakelen plug-inhybrides en bussen al automatisch naar elektrisch rijden. Deze pagina vat samen wat openbaar bekend is en waar een gat blijft.', today_exists_title: 'Wat er vandaag bestaat',
		today_item1: 'Ford Transit Custom plug-in hybride bestelwagens gebruiken live locatiegegevens om over te schakelen naar elektrisch rijden in vooraf bepaalde gebieden, zoals lage-emissiezones. Gebruikers kunnen ook eigen groene zones instellen, bijvoorbeeld rond scholen.', today_item2: 'BMW plug-inhybrides gebruiken gps-geofencing om te herkennen dat ze een lage-emissiezone binnenrijden en kunnen dan de verbrandingsmotor uitschakelen.', today_item3: 'In 2017 onderzocht een proef in Leeds of live luchtkwaliteitsgegevens de overschakeling naar elektrisch rijden bij hybride voertuigen in een wagenpark kon aansturen.', today_gap_title: 'Wat nog ontbreekt', today_gap_text: 'De hierboven beschreven producten werken met vooraf vastgelegde zones, zoals lage-emissiezones of groene zones. Luchtvervuiling volgt die lijnen niet: ze piekt op specifieke plekken en op specifieke momenten. Aethra werkt aan het dichten van dat gat. Het project zit in de prototypefase en doet geen uitspraken over resultaten.',
		about_title: 'Wie achter Aethra zit',
		home_problem_line: 'Luchtvervuiling piekt op specifieke plekken. Voertuigen rijden door alsof elke straat hetzelfde is.',
		status_short: 'Prototypefase. Open voor gesprekken met investeerders en partners.',
		cta_title: 'Wilt u meer weten?', cta_text: 'Wij staan open voor gesprekken met gemeenten, wagenparken, fabrikanten, platforms en investeerders.',
		hero_eyebrow: 'Prototypefase', hero_title: 'Schonere lucht, precies waar het verkeer het drukst is',
		hero_text: 'CubeSats en AI waarmee voertuigen overschakelen op een ecomodus in gebieden met veel luchtvervuiling.', hero_cta: 'Neem contact op',
		problem_title: 'Luchtvervuiling zit geconcentreerd waar mensen en verkeer samenkomen',
		problem_text: 'Wegverkeer is in steden een belangrijke lokale bron van luchtvervuiling. De vervuiling piekt op specifieke plekken en momenten, terwijl voertuigen doorrijden alsof elke straat hetzelfde is.',
		fact1_label: 'vroegtijdige sterfgevallen wereldwijd in 2019 werden toegeschreven aan luchtvervuiling buiten (omgevingslucht).',
		fact2_label: 'vroegtijdige sterfgevallen in de EU-27 in 2023 waren toe te schrijven aan fijnstof boven de WHO-richtwaarden.',
		steps_title: 'Wat Aethra doet, in drie stappen',
		step1_title: 'Detecteren', step1_text: 'Vaststellen waar de luchtkwaliteit onder druk staat.',
		step2_title: 'Bepalen', step2_text: 'AI bepaalt wanneer een voertuig zich moet aanpassen.',
		step3_title: 'Schakelen', step3_text: 'Voertuigen gaan binnen die gebieden over op ecomodus.',
		apps_title: 'Gebouwd voor de partijen die stedelijke mobiliteit vormgeven',
		app1_title: 'Gemeenten', app1_text: 'Bescherm de lucht waar die voor inwoners het meest telt.',
		app2_title: 'Wagenparkbeheerders', app2_text: 'Voertuigen die reageren op lokale omstandigheden, zonder extra werk voor chauffeurs.',
		app3_title: 'Voertuigfabrikanten', app3_text: 'Een extra laag intelligentie voor besturingssystemen van voertuigen.',
		app4_title: 'Mobiliteitsplatforms', app4_text: 'Bied schonere ritten aan in de drukste gebieden.',
		status_title: 'Waar we staan', status_text: 'Aethra bevindt zich in de prototypefase. Wij staan open voor gesprekken met investeerders en partners.',
		status_note: 'Resultaten publiceren we zodra ze door testdata worden onderbouwd.',
		contact_title: 'Laten we praten', contact_text: 'Gemeente, wagenpark, fabrikant, platform of investeerder: stuur ons een bericht en wij reageren.',
		contact_reply: 'Wij reageren doorgaans binnen twee werkdagen.',
	},
	de: {
		seo_home: 'Aethra: CubeSats und KI für sauberere Luft im Verkehr',
		seo_problem: 'Luftverschmutzung, wo der Verkehr am dichtesten ist',
		seo_how: 'So funktioniert es: erkennen, entscheiden, schalten',
		seo_apps: 'Anwendungen für Kommunen und Flotten',
		seo_contact: 'Kontakt: Kommune, Flotte, Hersteller oder Investor',
		fact1_value: '4,2 Millionen', fact2_value: '182.000',
		meta_description: 'Aethra entwickelt CubeSats und KI, mit denen Fahrzeuge in Gebieten mit hoher Luftverschmutzung in einen Eco-Modus wechseln.',
		company_line: 'Unternehmensangaben folgen.',
		seo_today: 'Geofencing-Eco-Modus heute: was noch fehlt', today_title: 'Geofencing-Eco-Modus heute: was es gibt und was noch fehlt', today_lead: 'Mehrere Fahrzeughersteller und Flottenprojekte schalten Plug-in-Hybride und Busse bereits automatisch auf Elektrofahrt um. Diese Seite fasst zusammen, was öffentlich dokumentiert ist und wo eine Lücke bleibt.', today_exists_title: 'Was es heute gibt',
		today_item1: 'Ford Transit Custom Plug-in-Hybridtransporter nutzen Live-Standortdaten, um in vordefinierten Gebieten wie Niedrigemissionszonen auf Elektrofahrt umzuschalten. Betreiber können außerdem eigene grüne Zonen festlegen, zum Beispiel rund um Schulen.', today_item2: 'BMW Plug-in-Hybride erkennen per GPS-Geofencing, dass sie in eine Niedrigemissionszone einfahren, und können dann den Verbrennungsmotor abschalten.', today_item3: 'Ein Versuch in Leeds untersuchte 2017, ob Live-Luftqualitätsdaten das Umschalten auf Elektrofahrt bei Hybridfahrzeugen einer Flotte auslösen können.', today_gap_title: 'Was noch fehlt', today_gap_text: 'Die oben beschriebenen Produkte arbeiten mit im Voraus festgelegten Zonen, etwa Niedrigemissionszonen oder grünen Zonen. Luftverschmutzung folgt diesen Linien nicht: Sie erreicht an bestimmten Orten und zu bestimmten Zeiten ihre Spitzen. Aethra arbeitet daran, diese Lücke zu schließen. Das Projekt befindet sich in der Prototypphase und trifft keine Aussagen über Ergebnisse.',
		about_title: 'Wer hinter Aethra steht',
		home_problem_line: 'Die Luftbelastung konzentriert sich auf bestimmte Orte. Fahrzeuge fahren weiter, als wäre jede Straße gleich.',
		status_short: 'Prototypphase. Offen für Gespräche mit Investoren und Partnern.',
		cta_title: 'Möchten Sie mehr erfahren?', cta_text: 'Wir sind offen für Gespräche mit Kommunen, Flottenbetreibern, Herstellern, Plattformen und Investoren.',
		hero_eyebrow: 'Prototypphase', hero_title: 'Sauberere Luft, genau dort, wo der Verkehr am dichtesten ist',
		hero_text: 'CubeSats und KI, mit denen Fahrzeuge in Gebieten mit hoher Luftverschmutzung in einen Eco-Modus wechseln.', hero_cta: 'Kontakt aufnehmen',
		problem_title: 'Luftverschmutzung konzentriert sich dort, wo Menschen und Verkehr zusammentreffen',
		problem_text: 'Der Straßenverkehr ist in Städten eine wichtige lokale Quelle der Luftverschmutzung. Sie erreicht an bestimmten Orten und zu bestimmten Zeiten Spitzenwerte, während Fahrzeuge weiterfahren, als wäre jede Straße gleich.',
		fact1_label: 'vorzeitige Todesfälle weltweit wurden 2019 der Außenluftverschmutzung zugeschrieben.',
		fact2_label: 'vorzeitige Todesfälle in der EU-27 waren 2023 auf Feinstaub oberhalb der WHO-Richtwerte zurückzuführen.',
		steps_title: 'Was Aethra tut, in drei Schritten',
		step1_title: 'Erkennen', step1_text: 'Orte finden, an denen die Luftqualität unter Druck steht.',
		step2_title: 'Entscheiden', step2_text: 'KI entscheidet, wann ein Fahrzeug sich anpassen sollte.',
		step3_title: 'Schalten', step3_text: 'Fahrzeuge wechseln in diesen Gebieten in den Eco-Modus.',
		apps_title: 'Entwickelt für die Akteure, die urbane Mobilität gestalten',
		app1_title: 'Kommunen', app1_text: 'Die Luft dort schützen, wo sie den Einwohnern am wichtigsten ist.',
		app2_title: 'Flottenbetreiber', app2_text: 'Fahrzeuge, die auf lokale Bedingungen reagieren, ohne Mehraufwand für Fahrer.',
		app3_title: 'Fahrzeughersteller', app3_text: 'Eine zusätzliche Intelligenzebene für Fahrzeugsteuerungssysteme.',
		app4_title: 'Mobilitätsplattformen', app4_text: 'Sauberere Fahrten in den am stärksten belasteten Gebieten anbieten.',
		status_title: 'Unser Stand', status_text: 'Aethra befindet sich in der Prototypphase. Wir sind offen für Gespräche mit Investoren und Partnern.',
		status_note: 'Ergebnisse veröffentlichen wir, sobald sie durch Testdaten belegt sind.',
		contact_title: 'Lassen Sie uns sprechen', contact_text: 'Kommune, Flotte, Hersteller, Plattform oder Investor: Senden Sie uns eine Nachricht, wir antworten.',
		contact_reply: 'Wir antworten in der Regel innerhalb von zwei Werktagen.',
	},
	fr: {
		seo_home: 'Aethra : CubeSats et IA pour un air plus propre en ville',
		seo_problem: 'Pollution de l’air là où le trafic est dense',
		seo_how: 'Comment ça marche : détecter, décider, basculer',
		seo_apps: 'Applications pour communes et flottes',
		seo_contact: 'Contact : commune, flotte ou investisseur',
		fact1_value: '4,2 millions', fact2_value: '182 000',
		meta_description: 'Aethra développe des CubeSats et une IA qui permettent aux véhicules de passer en mode éco dans les zones très polluées.',
		company_line: 'Les informations sur la société suivront.',
		seo_today: 'Mode éco géolocalisé : ce qui manque', today_title: 'Le mode éco géolocalisé aujourd’hui : ce qui existe et ce qui manque encore', today_lead: 'Plusieurs constructeurs et projets de flottes font déjà passer automatiquement des hybrides rechargeables et des bus en conduite électrique. Cette page résume ce qui est documenté publiquement et où subsiste une lacune.', today_exists_title: 'Ce qui existe aujourd’hui',
		today_item1: 'Les fourgons hybrides rechargeables Ford Transit Custom utilisent des données de localisation en direct pour passer en conduite électrique dans des zones prédéfinies, comme les zones à faibles émissions. Les exploitants peuvent aussi définir leurs propres zones vertes, par exemple autour des écoles.', today_item2: 'Les hybrides rechargeables BMW utilisent la géolocalisation GPS pour détecter l’entrée dans une zone à faibles émissions et peuvent alors couper le moteur thermique.', today_item3: 'Un essai mené à Leeds en 2017 a étudié la possibilité de déclencher le passage en mode électrique de véhicules hybrides d’une flotte à partir de données de qualité de l’air en direct.', today_gap_title: 'Ce qui manque encore', today_gap_text: 'Les produits décrits ci-dessus fonctionnent avec des zones définies à l’avance, comme les zones à faibles émissions ou les zones vertes. La pollution de l’air ne suit pas ces lignes : elle culmine à des endroits précis et à des moments précis. Aethra travaille à combler cet écart. Le projet est en phase de prototype et ne fait aucune déclaration sur des résultats.',
		about_title: 'Qui est derrière Aethra',
		home_problem_line: 'La pollution atteint des pics à des endroits précis. Les véhicules roulent comme si chaque rue était identique.',
		status_short: 'Phase de prototype. Ouverts aux échanges avec les investisseurs et les partenaires.',
		cta_title: 'Envie d’en savoir plus ?', cta_text: 'Nous sommes ouverts aux échanges avec les communes, les gestionnaires de flottes, les constructeurs, les plateformes et les investisseurs.',
		hero_eyebrow: 'Phase de prototype', hero_title: 'Un air plus propre, là où le trafic est le plus dense',
		hero_text: 'Des CubeSats et une IA qui permettent aux véhicules de passer en mode éco dans les zones très polluées.', hero_cta: 'Nous contacter',
		problem_title: 'La pollution se concentre là où les personnes et le trafic se rencontrent',
		problem_text: 'Le trafic routier est une source locale majeure de pollution de l’air en ville. La pollution atteint des pics à des endroits et des moments précis, alors que les véhicules roulent comme si chaque rue était identique.',
		fact1_label: 'décès prématurés dans le monde en 2019 ont été attribués à la pollution de l’air extérieur.',
		fact2_label: 'décès prématurés dans l’UE-27 en 2023 étaient imputables aux particules fines au-dessus des valeurs guides de l’OMS.',
		steps_title: 'Ce que fait Aethra, en trois étapes',
		step1_title: 'Détecter', step1_text: 'Repérer où la qualité de l’air est sous pression.',
		step2_title: 'Décider', step2_text: 'L’IA décide quand un véhicule doit s’adapter.',
		step3_title: 'Basculer', step3_text: 'Les véhicules passent en mode éco dans ces zones.',
		apps_title: 'Conçu pour les acteurs qui façonnent la mobilité urbaine',
		app1_title: 'Communes', app1_text: 'Protéger l’air là où il compte le plus pour les habitants.',
		app2_title: 'Gestionnaires de flottes', app2_text: 'Des véhicules qui réagissent aux conditions locales, sans travail supplémentaire pour les conducteurs.',
		app3_title: 'Constructeurs automobiles', app3_text: 'Une couche d’intelligence supplémentaire pour les systèmes de commande des véhicules.',
		app4_title: 'Plateformes de mobilité', app4_text: 'Proposer des trajets plus propres dans les zones les plus fréquentées.',
		status_title: 'Où nous en sommes', status_text: 'Aethra est en phase de prototype. Nous sommes ouverts aux échanges avec les investisseurs et les partenaires.',
		status_note: 'Les résultats seront publiés lorsqu’ils seront étayés par des données d’essai.',
		contact_title: 'Parlons-en', contact_text: 'Commune, flotte, constructeur, plateforme ou investisseur : envoyez-nous un message, nous vous répondrons.',
		contact_reply: 'Nous répondons généralement sous deux jours ouvrés.',
	},
};

const PRIVACY = {
	en: `[Draft: complete every part in brackets and have this statement reviewed before launch.]

This website is operated by [company name and legal form], [address], [registration number].

# What we collect
When you use the contact form we receive the details you enter: name, email address, organisation, your role and your message. This website does not use tracking, advertising or analytics cookies and does not load content from third parties. We count page views in anonymous totals (page, language and referring site) without cookies and without storing IP addresses or any personal identifier. If you choose a language, one functional cookie remembers that choice for one year.

# Why and on what basis
We use these details only to reply to your message. The basis is your consent, which you give by ticking the box before sending.

# How long we keep it
Messages are stored in the website's inbox and deleted after [retention period, e.g. 12 months], or earlier on request.

# Your rights
You can ask us to access, correct or delete your details, and withdraw your consent at any time. Contact: [email address]. You can also complain to the Dutch Data Protection Authority (Autoriteit Persoonsgegevens).`,
	nl: `[Concept: vul alle onderdelen tussen haken in en laat deze verklaring controleren voor de lancering.]

Deze website wordt beheerd door [bedrijfsnaam en rechtsvorm], [adres], [inschrijvingsnummer].

# Wat wij verzamelen
Als u het contactformulier gebruikt, ontvangen wij de gegevens die u invult: naam, e-mailadres, organisatie, uw rol en uw bericht. Deze website gebruikt geen tracking-, advertentie- of analysecookies en laadt geen inhoud van derden. Wij tellen paginaweergaven in anonieme totalen (pagina, taal en verwijzende site), zonder cookies en zonder IP-adressen of andere persoonlijke kenmerken op te slaan. Als u een taal kiest, onthoudt één functionele cookie die keuze een jaar.

# Waarom en op welke grondslag
Wij gebruiken deze gegevens alleen om op uw bericht te reageren. De grondslag is uw toestemming, die u geeft door het vakje aan te vinken voordat u verzendt.

# Hoe lang wij ze bewaren
Berichten worden bewaard in de inbox van de website en verwijderd na [bewaartermijn, bijv. 12 maanden], of eerder op verzoek.

# Uw rechten
U kunt ons vragen uw gegevens in te zien, te corrigeren of te verwijderen en uw toestemming op elk moment intrekken. Contact: [e-mailadres]. U kunt ook een klacht indienen bij de Autoriteit Persoonsgegevens.`,
	de: `[Entwurf: Ergänzen Sie alle Angaben in Klammern und lassen Sie diese Erklärung vor dem Start prüfen.]

Diese Website wird betrieben von [Firmenname und Rechtsform], [Adresse], [Registernummer].

# Was wir erfassen
Wenn Sie das Kontaktformular nutzen, erhalten wir Ihre Eingaben: Name, E-Mail-Adresse, Organisation, Ihre Rolle und Ihre Nachricht. Diese Website verwendet keine Tracking-, Werbe- oder Analysecookies und lädt keine Inhalte von Dritten. Wir zählen Seitenaufrufe in anonymen Summen (Seite, Sprache und verweisende Website), ohne Cookies und ohne IP-Adressen oder andere persönliche Kennungen zu speichern. Wenn Sie eine Sprache wählen, merkt sich ein funktionales Cookie diese Wahl ein Jahr lang.

# Zweck und Rechtsgrundlage
Wir verwenden diese Angaben nur, um auf Ihre Nachricht zu antworten. Rechtsgrundlage ist Ihre Einwilligung, die Sie durch Anklicken des Kästchens vor dem Absenden erteilen.

# Speicherdauer
Nachrichten werden im Posteingang der Website gespeichert und nach [Aufbewahrungsfrist, z. B. 12 Monaten] oder auf Wunsch früher gelöscht.

# Ihre Rechte
Sie können Auskunft, Berichtigung oder Löschung Ihrer Daten verlangen und Ihre Einwilligung jederzeit widerrufen. Kontakt: [E-Mail-Adresse]. Sie können sich außerdem bei der niederländischen Datenschutzbehörde (Autoriteit Persoonsgegevens) beschweren.`,
	fr: `[Projet : complétez toutes les parties entre crochets et faites relire cette politique avant le lancement.]

Ce site est exploité par [nom de la société et forme juridique], [adresse], [numéro d’immatriculation].

# Ce que nous collectons
Lorsque vous utilisez le formulaire de contact, nous recevons les informations que vous saisissez : nom, adresse e-mail, organisation, votre rôle et votre message. Ce site n’utilise ni cookies de suivi, de publicité ou d’analyse, ni contenu de tiers. Nous comptons les pages vues en totaux anonymes (page, langue et site de provenance), sans cookies et sans conserver d’adresses IP ni d’identifiant personnel. Si vous choisissez une langue, un cookie fonctionnel mémorise ce choix pendant un an.

# Finalité et base juridique
Nous utilisons ces données uniquement pour répondre à votre message. La base juridique est votre consentement, que vous donnez en cochant la case avant l’envoi.

# Durée de conservation
Les messages sont conservés dans la boîte de réception du site et supprimés après [durée de conservation, p. ex. 12 mois], ou plus tôt sur demande.

# Vos droits
Vous pouvez demander l’accès, la rectification ou la suppression de vos données et retirer votre consentement à tout moment. Contact : [adresse e-mail]. Vous pouvez aussi déposer une plainte auprès de l’autorité néerlandaise de protection des données (Autoriteit Persoonsgegevens).`,
};

const isLang = (l) => LANGS.includes(l);
const defaultsFor = (lang) => ({ ...DEFAULTS, ...(TR[lang] || {}), ...audienceTranslations(lang) });

/** Best supported language from an Accept-Language header (honours q-values). */
function fromAcceptLanguage(header) {
	const prefs = String(header || '').split(',').map((part, i) => {
		const [tag, ...params] = part.trim().split(';');
		const q = params.map((p) => /^\s*q=([\d.]+)/.exec(p)).find(Boolean);
		return { lang: tag.trim().toLowerCase().split('-')[0], q: q ? Number(q[1]) : 1, i };
	}).filter((p) => p.lang && p.q > 0).sort((a, b) => b.q - a.q || a.i - b.i);
	const hit = prefs.find((p) => isLang(p.lang));
	return hit ? hit.lang : null;
}

/** Cookie choice first, then browser language, then English. */
function detectLang(cookieLang, acceptLanguage) {
	if (isLang(cookieLang)) return cookieLang;
	return fromAcceptLanguage(acceptLanguage) || DEFAULT_LANG;
}

module.exports = { LANGS, DEFAULT_LANG, LANG_NAMES, OG_LOCALE, UI, TR, PRIVACY, isLang, defaultsFor, fromAcceptLanguage, detectLang };
