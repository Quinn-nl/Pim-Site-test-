'use strict';
/** Help texts: a short explanation per screen (shown folded under the title) and the guide at /admin/help. Plain Dutch, no jargon. */
const CONTEXT = {
	dash: 'Hier zie je wat jouw aandacht vraagt. “Mijn taken” is een lijst van dingen die op jou wachten; klik er een aan om er direct heen te gaan.',
	paginas: 'Hier bewerk je de teksten van de site. De vaste pagina’s (home, het probleem, …) hebben vaste teksten per taal; eigen pagina’s maak je zelf met een sjabloon. Wijzigingen zijn pas zichtbaar als je op Publiceren klikt.',
	media: 'Foto’s bewaar je hier. Elke foto heeft een omschrijving nodig voor mensen die de foto niet zien. Kies bij “Foto’s op de site” welke foto waar komt. Een foto die ergens gebruikt wordt kun je niet verwijderen.',
	reviews: 'Een redacteur schrijft en stelt voor; een editor of beheerder beoordeelt. Goedkeuren publiceert direct, na dezelfde controles als anders.',
	planning: 'Plan in de editor met de klok-knop. Op het gekozen moment wordt gepubliceerd of offline gehaald. Lukt dat niet, dan krijg je een mail.',
	vertalingen: 'Per onderdeel de stand van elke taal. “Verouderd” betekent dat de Engelse tekst later is aangepast dan de vertaling.',
	prullenbak: 'Verwijderde pagina’s en foto’s blijven 30 dagen bewaard. Een teruggezette pagina komt terug als concept.',
	berichten: 'Alle berichten van het contactformulier. Gebruik de tabs voor de status, wijs berichten toe aan iemand en vink er meer aan voor een bulkactie. Sneltoetsen: J en K om te bladeren, E om af te ronden.',
	wachtrij: 'Mails gaan eerst in deze wachtrij en worden daarna verstuurd. Bij een storing probeert het systeem het opnieuw.',
	menu: 'Bepaal welke links in het hoofdmenu en de voettekst staan. Sleep een rij of gebruik de pijltjes om de volgorde te wijzigen. Pas na opslaan zichtbaar.',
	seo: 'Een controle van alle gepubliceerde pagina’s op titel, omschrijving, koppen en afbeeldingen, zoals zoekmachines ze zien.',
	links: 'Controleert alle links op de pagina’s. Eens per week automatisch; je kunt hem ook zelf starten.',
	redirects: 'Een oud adres stuurt bezoekers door naar een nieuw adres. Dat gebeurt vanzelf als je het adres van een pagina wijzigt.',
	stats: 'Anonieme paginaweergaven, zonder cookies. Gebruik de cijfers voor trends, niet als exacte aantallen.',
	sjablonen: 'Standaardantwoorden per taal. In een bericht kies je een sjabloon en je mailprogramma opent met de tekst al ingevuld.',
	gebruikers: 'Beheerders mogen alles; editors mogen publiceren; redacteuren schrijven en stellen voor; lezers kijken alleen. Nodig mensen uit zonder wachtwoord: zij kiezen er zelf een.',
	instellingen: 'Mededeling bovenaan de site, onderhoudsmodus en de bewaartermijn van berichten. Alleen voor beheerders.',
	regels: 'De redactionele controle die elke publicatie doorloopt. Vaste regels zitten in de software; hier voeg je eigen termen toe.',
	systeem: 'De gezondheid van de site en de back-ups. Een back-up wordt elke dag gemaakt; hier kun je er een downloaden.',
	audit: 'Het logboek van alles wat er is gewijzigd. Het kan niet worden aangepast.',
	account: 'Je eigen naam, wachtwoord, tweestapsverificatie en meldingen. Zet tweestapsverificatie aan: een gestolen wachtwoord is dan niet genoeg.',
};

const SHORTCUTS = [
	['Ctrl of ⌘ + K', 'Zoeken in het hele beheer'], ['/', 'Zoeken'], ['?', 'Deze lijst met sneltoetsen'], ['Ctrl of ⌘ + S', 'Opslaan in een editor'],
	['J / K', 'Volgend / vorig bericht (in de berichtenlijst en in een bericht)'], ['X', 'Bericht selecteren in de lijst'], ['Enter', 'Bericht openen in de lijst'],
	['E', 'Bericht als afgerond markeren'], ['U', 'Bericht als niet gelezen markeren'], ['R', 'Beantwoorden per e-mail'], ['G dan B', 'Naar de berichten'], ['G dan D', 'Naar het dashboard'],
];

const GUIDE = [
	['beginnen', 'Waar begin ik?', ['Open het dashboard: onder “Mijn taken” staat wat op jou wacht. De zijbalk links brengt je naar alle onderdelen. Rechtsonder staat je naam met “Mijn account”, hier zet je ook tweestapsverificatie aan.', 'Teksten bewerk je onder “Pagina’s en teksten”. Foto’s onder “Media”. Berichten van bezoekers onder “Berichten”.']],
	['rollen', 'Wie mag wat?', ['Beheerder: alles, ook gebruikers, instellingen, systeem en auditlog. Editor: teksten, pagina’s, media en berichten; mag publiceren en voorstellen beoordelen. Redacteur: schrijft en bewaart concepten en dient wijzigingen in ter beoordeling. Lezer: alleen kijken.']],
	['publiceren', 'Hoe publiceer ik een tekst?', ['Open de tekst, kies een taal, pas de tekst aan en klik op Publiceren. Rechts zie je direct hoe het eruit komt te zien. Elke publicatie wordt gecontroleerd op de redactionele regels: sommige dingen mogen nooit (bijvoorbeeld beloftes over rendement), bij andere krijg je een waarschuwing en kun je met een reden toch doorgaan.', 'Je werk wordt elke 30 seconden als concept bewaard. Het concept is nooit zichtbaar voor bezoekers.']],
	['talen', 'Hoe zit het met de talen?', ['Je werkt in één taal tegelijk (tabs). Vertalingen zijn eerste versies tot een moedertaalspreker ze heeft nagekeken: klik dan op “Markeer … als nagekeken”. Onder “Vertalingen” zie je per onderdeel wat nog open staat of verouderd is.']],
	['paginas', 'Een nieuwe pagina maken', ['Kies “Nieuwe pagina”, een sjabloon (of een kopie van een bestaande pagina) en vul de bouwstenen. Een pagina begint als concept. Het adres (slug) bepaalt de link. Verander je het adres van een gepubliceerde pagina, dan stuurt de oude link vanzelf door.']],
	['review', 'Voorstellen en beoordelen', ['Als redacteur klik je op “Ter beoordeling indienen”. Een editor of beheerder ziet het onder “Te beoordelen”, bekijkt de verschillen en keurt goed of wijst af met een opmerking. Je krijgt een mail met de uitkomst.']],
	['plannen', 'Plannen en delen', ['Met de klok-knop plan je publiceren of offline halen op een moment naar keuze. Met de deel-knop maak je een geheime link naar een concept, voor iemand zonder account. De link verloopt vanzelf en je kunt hem intrekken onder “Voorbeeldlinks”.']],
	['berichten', 'Berichten opvolgen', ['Nieuwe berichten staan op “Niet gelezen”. Zet een bericht op “In behandeling” zodra je eraan werkt, wijs het toe aan een collega en rond af als het klaar is. Met antwoordsjablonen beantwoord je veelgestelde vragen snel, in de taal van de afzender.', 'Berichten worden na de bewaartermijn (zie Instellingen) automatisch verwijderd.']],
	['veilig', 'Veilig werken', ['Gebruik een lang wachtwoord (een zin) en zet tweestapsverificatie aan. Log uit op een gedeelde computer. Zie je een inlogmelding die jij niet was, verander dan direct je wachtwoord. Wachtwoord vergeten? Gebruik de link op de inlogpagina of vraag een beheerder om een herstellink.']],
	['storing', 'Wat als er iets misgaat?', ['Een bericht staat altijd eerst in de database en gaat daarna per mail verder: raak je mail kwijt, dan blijft het bericht gewoon in het beheer staan. Een verwijderde pagina of foto kun je 30 dagen terugzetten. Een beheerder kan onder “Systeem” een back-up maken of downloaden.']],
];
module.exports = { CONTEXT, SHORTCUTS, GUIDE };
