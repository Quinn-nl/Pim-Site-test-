'use strict';
/**
 * One landing page per audience (/<lang>/for/<slug>). Copy is deliberately about WHAT Aethra
 * does and at which stage: no emission figures, no technical "how", no investment offer.
 */
const A = (slug, role, icon, i18n) => ({ slug, role, icon, i18n });
const T = (label, seo, title, lead, points, faq) => ({ label, seo, title, lead, points, faq });

const AUDIENCES = [
	A('municipalities', 'Municipality', 'city', {
		en: T('Municipalities', 'For municipalities: cleaner air in hotspots', 'Protect air quality where residents feel it most',
			'Aethra helps vehicles adapt automatically in the areas that matter, without relying on every driver to act.',
			['Targets the places where pollution peaks, not the whole city.', 'Designed to complement low-emission zones and local air-quality policy.', 'Prototype phase: we welcome pilots and conversations about local needs.'],
			[['Is Aethra available today?', 'Not yet. Aethra is in the prototype phase. We are open to conversations about requirements and future pilots.'], ['Does it replace existing air-quality measures?', 'No. It is intended to complement existing measures, not to replace them.']]),
		nl: T('Gemeenten', 'Voor gemeenten: schonere lucht op hotspots', 'Bescherm de luchtkwaliteit waar inwoners het meest merken',
			'Aethra helpt voertuigen zich automatisch aan te passen in de gebieden waar het ertoe doet, zonder dat elke bestuurder daarvoor iets hoeft te doen.',
			['Richt zich op de plekken waar de vervuiling piekt, niet op de hele stad.', 'Bedoeld als aanvulling op milieuzones en lokaal luchtkwaliteitsbeleid.', 'Prototypefase: wij staan open voor pilots en gesprekken over lokale behoeften.'],
			[['Is Aethra nu beschikbaar?', 'Nog niet. Aethra is in de prototypefase. Wij staan open voor gesprekken over wensen en toekomstige pilots.'], ['Vervangt het bestaande maatregelen voor luchtkwaliteit?', 'Nee. Het is bedoeld als aanvulling op bestaande maatregelen, niet als vervanging.']]),
		de: T('Kommunen', 'Für Kommunen: saubere Luft an Hotspots', 'Luftqualität dort schützen, wo Bewohner sie am stärksten spüren',
			'Aethra hilft Fahrzeugen, sich in den relevanten Gebieten automatisch anzupassen, ohne dass jeder Fahrer selbst handeln muss.',
			['Zielt auf die Orte, an denen die Belastung Spitzenwerte erreicht, nicht auf die ganze Stadt.', 'Gedacht als Ergänzung zu Umweltzonen und lokaler Luftreinhaltepolitik.', 'Prototypphase: Wir sind offen für Pilotprojekte und Gespräche über lokale Bedürfnisse.'],
			[['Ist Aethra heute verfügbar?', 'Noch nicht. Aethra befindet sich in der Prototypphase. Wir sind offen für Gespräche über Anforderungen und künftige Pilotprojekte.'], ['Ersetzt es bestehende Maßnahmen zur Luftreinhaltung?', 'Nein. Es soll bestehende Maßnahmen ergänzen, nicht ersetzen.']]),
		fr: T('Communes', 'Pour les communes : un air plus propre', 'Protéger la qualité de l’air là où les habitants la ressentent le plus',
			'Aethra aide les véhicules à s’adapter automatiquement dans les zones concernées, sans que chaque conducteur ait à agir.',
			['Cible les endroits où la pollution atteint des pics, pas toute la ville.', 'Conçu pour compléter les zones à faibles émissions et la politique locale de qualité de l’air.', 'Phase de prototype : nous sommes ouverts aux projets pilotes et aux échanges sur les besoins locaux.'],
			[['Aethra est-il disponible aujourd’hui ?', 'Pas encore. Aethra est en phase de prototype. Nous sommes ouverts aux échanges sur vos besoins et sur de futurs projets pilotes.'], ['Remplace-t-il les mesures existantes ?', 'Non. Il est conçu pour compléter les mesures existantes, pas pour les remplacer.']]),
	}),
	A('fleets', 'Fleet operator', 'fleet', {
		en: T('Fleet operators', 'For fleet operators: automatic eco mode', 'Vehicles that adapt to local air quality, automatically',
			'Aethra aims to move vehicles into an eco mode in polluted areas, with no extra work for drivers or dispatchers.',
			['No extra steps for drivers.', 'Only active where air quality is under pressure.', 'Prototype phase: we are looking for fleet partners to talk to.'],
			[['Do drivers need to do anything?', 'The aim is that they do not: vehicles switch automatically inside the relevant areas.'], ['Which vehicles will be supported?', 'That is still being defined during the prototype phase. Tell us about your fleet and we will take it into account.']]),
		nl: T('Wagenparkbeheerders', 'Voor wagenparken: automatische ecomodus', 'Voertuigen die zich automatisch aanpassen aan de luchtkwaliteit',
			'Aethra wil voertuigen in vervuilde gebieden laten overschakelen op een ecomodus, zonder extra werk voor chauffeurs of planners.',
			['Geen extra handelingen voor chauffeurs.', 'Alleen actief waar de luchtkwaliteit onder druk staat.', 'Prototypefase: wij zoeken wagenparken om mee in gesprek te gaan.'],
			[['Hoeven chauffeurs iets te doen?', 'Het streven is van niet: voertuigen schakelen automatisch binnen de betreffende gebieden.'], ['Welke voertuigen worden ondersteund?', 'Dat wordt tijdens de prototypefase nog bepaald. Vertel ons over uw wagenpark, dan nemen wij het mee.']]),
		de: T('Flottenbetreiber', 'Für Flotten: automatischer Eco-Modus', 'Fahrzeuge, die sich automatisch an die Luftqualität anpassen',
			'Aethra will Fahrzeuge in belasteten Gebieten in einen Eco-Modus wechseln lassen, ohne Mehraufwand für Fahrer oder Disponenten.',
			['Keine zusätzlichen Handgriffe für Fahrer.', 'Nur aktiv, wo die Luftqualität unter Druck steht.', 'Prototypphase: Wir suchen Flotten für erste Gespräche.'],
			[['Müssen Fahrer etwas tun?', 'Das Ziel ist, dass sie nichts tun müssen: Fahrzeuge wechseln in den betreffenden Gebieten automatisch.'], ['Welche Fahrzeuge werden unterstützt?', 'Das wird in der Prototypphase noch festgelegt. Erzählen Sie uns von Ihrer Flotte, wir berücksichtigen sie.']]),
		fr: T('Gestionnaires de flottes', 'Pour les flottes : mode éco automatique', 'Des véhicules qui s’adaptent automatiquement à la qualité de l’air',
			'Aethra vise à faire passer les véhicules en mode éco dans les zones polluées, sans travail supplémentaire pour les conducteurs ou les planificateurs.',
			['Aucune action supplémentaire pour les conducteurs.', 'Actif uniquement là où la qualité de l’air est sous pression.', 'Phase de prototype : nous cherchons des flottes avec qui échanger.'],
			[['Les conducteurs doivent-ils faire quelque chose ?', 'L’objectif est que non : les véhicules passent automatiquement en mode éco dans les zones concernées.'], ['Quels véhicules seront pris en charge ?', 'Cela sera défini pendant la phase de prototype. Parlez-nous de votre flotte, nous en tiendrons compte.']]),
	}),
	A('manufacturers', 'Vehicle manufacturer', 'factory', {
		en: T('Vehicle manufacturers', 'For vehicle manufacturers: eco-mode AI', 'An extra layer of intelligence for vehicle control systems',
			'Aethra explores how location-aware AI can help decide when a vehicle should switch to an eco mode.',
			['Designed to complement existing vehicle control systems.', 'Uses CubeSats and AI; details are shared in conversation.', 'Prototype phase: open to technical and strategic discussions.'],
			[['How does it work technically?', 'We do not publish technical details yet. We are happy to discuss integration questions in a conversation.'], ['Is the technology protected?', 'We do not comment on intellectual property publicly.']]),
		nl: T('Voertuigfabrikanten', 'Voor fabrikanten: AI voor ecomodus', 'Een extra laag intelligentie voor besturingssystemen van voertuigen',
			'Aethra onderzoekt hoe locatiebewuste AI kan helpen bepalen wanneer een voertuig moet overschakelen op een ecomodus.',
			['Bedoeld als aanvulling op bestaande besturingssystemen van voertuigen.', 'Gebruikt CubeSats en AI; details bespreken wij in een gesprek.', 'Prototypefase: open voor technische en strategische gesprekken.'],
			[['Hoe werkt het technisch?', 'Technische details publiceren wij nog niet. Vragen over integratie bespreken wij graag in een gesprek.'], ['Is de technologie beschermd?', 'Over intellectueel eigendom doen wij geen openbare uitspraken.']]),
		de: T('Fahrzeughersteller', 'Für Hersteller: KI für den Eco-Modus', 'Eine zusätzliche Intelligenzebene für Fahrzeugsteuerungssysteme',
			'Aethra untersucht, wie ortsbezogene KI mitbestimmen kann, wann ein Fahrzeug in einen Eco-Modus wechseln sollte.',
			['Gedacht als Ergänzung zu bestehenden Fahrzeugsteuerungssystemen.', 'Nutzt CubeSats und KI; Details besprechen wir im Gespräch.', 'Prototypphase: offen für technische und strategische Gespräche.'],
			[['Wie funktioniert es technisch?', 'Technische Details veröffentlichen wir noch nicht. Fragen zur Integration besprechen wir gern im Gespräch.'], ['Ist die Technologie geschützt?', 'Zu geistigem Eigentum äußern wir uns öffentlich nicht.']]),
		fr: T('Constructeurs automobiles', 'Pour les constructeurs : IA du mode éco', 'Une couche d’intelligence supplémentaire pour les systèmes de commande des véhicules',
			'Aethra étudie comment une IA tenant compte du lieu peut aider à décider quand un véhicule doit passer en mode éco.',
			['Conçu pour compléter les systèmes de commande existants des véhicules.', 'Utilise des CubeSats et de l’IA ; les détails sont partagés lors d’un échange.', 'Phase de prototype : ouverts aux échanges techniques et stratégiques.'],
			[['Comment cela fonctionne-t-il techniquement ?', 'Nous ne publions pas encore les détails techniques. Nous discutons volontiers des questions d’intégration lors d’un échange.'], ['La technologie est-elle protégée ?', 'Nous ne communiquons pas publiquement sur la propriété intellectuelle.']]),
	}),
	A('platforms', 'Mobility platform', 'route', {
		en: T('Mobility platforms', 'For mobility platforms: cleaner trips', 'Offer cleaner trips in the busiest areas',
			'Aethra aims to help vehicles on your platform adapt to local air quality.',
			['Fits platforms that rely on many different vehicles.', 'A clear story for cities and customers who care about air quality.', 'Prototype phase: open to exploring pilots.'],
			[['Can we use it today?', 'Not yet; the prototype phase comes first. Contact us to be considered for future pilots.'], ['What would we need to provide?', 'That depends on the pilot. We will define it together in a first conversation.']]),
		nl: T('Mobiliteitsplatforms', 'Voor mobiliteitsplatforms: schonere ritten', 'Bied schonere ritten aan in de drukste gebieden',
			'Aethra wil helpen dat voertuigen op uw platform zich aanpassen aan de lokale luchtkwaliteit.',
			['Past bij platforms met veel verschillende voertuigen.', 'Een duidelijk verhaal voor steden en klanten die om luchtkwaliteit geven.', 'Prototypefase: open voor het verkennen van pilots.'],
			[['Kunnen wij het nu gebruiken?', 'Nog niet; eerst komt de prototypefase. Neem contact op om in aanmerking te komen voor toekomstige pilots.'], ['Wat moeten wij aanleveren?', 'Dat hangt af van de pilot. Dat bepalen we samen in een eerste gesprek.']]),
		de: T('Mobilitätsplattformen', 'Für Mobilitätsplattformen: sauberere Fahrten', 'Sauberere Fahrten in den am stärksten belasteten Gebieten anbieten',
			'Aethra will dazu beitragen, dass Fahrzeuge Ihrer Plattform sich an die lokale Luftqualität anpassen.',
			['Passt zu Plattformen mit vielen unterschiedlichen Fahrzeugen.', 'Eine klare Botschaft für Städte und Kunden, denen Luftqualität wichtig ist.', 'Prototypphase: offen für die Erkundung von Pilotprojekten.'],
			[['Können wir es heute nutzen?', 'Noch nicht; zuerst kommt die Prototypphase. Kontaktieren Sie uns, um für künftige Pilotprojekte berücksichtigt zu werden.'], ['Was müssten wir beisteuern?', 'Das hängt vom Pilotprojekt ab. Wir klären es gemeinsam in einem ersten Gespräch.']]),
		fr: T('Plateformes de mobilité', 'Pour les plateformes : trajets plus propres', 'Proposer des trajets plus propres dans les zones les plus fréquentées',
			'Aethra vise à aider les véhicules de votre plateforme à s’adapter à la qualité de l’air locale.',
			['Convient aux plateformes qui s’appuient sur de nombreux véhicules différents.', 'Un message clair pour les villes et les clients attentifs à la qualité de l’air.', 'Phase de prototype : ouverts à l’exploration de projets pilotes.'],
			[['Pouvons-nous l’utiliser dès maintenant ?', 'Pas encore ; la phase de prototype vient d’abord. Contactez-nous pour être pris en compte pour de futurs projets pilotes.'], ['Que devrions-nous apporter ?', 'Cela dépend du projet pilote. Nous le définirons ensemble lors d’un premier échange.']]),
	}),
	A('investors', 'Investor', 'chart', {
		en: T('Investors', 'For investors: air-quality tech at prototype stage', 'Aethra is building technology for cleaner air in traffic',
			'We are in the prototype phase and open to conversations with investors who want to learn more.',
			['Problem: air pollution peaks where traffic is heaviest.', 'Approach: CubeSats and AI that help vehicles switch to an eco mode.', 'Stage: prototype. Results will be published once supported by test data.'],
			[['Is this an offer to invest?', 'No. This website is for information only and is not an offer of shares or financial products. Contact us if you would like to talk.'], ['Do you publish results or forecasts?', 'Not yet. We will share results once they are supported by test data.']]),
		nl: T('Investeerders', 'Voor investeerders: prototypefase', 'Aethra bouwt technologie voor schonere lucht in het verkeer',
			'Wij zijn in de prototypefase en staan open voor gesprekken met investeerders die meer willen weten.',
			['Probleem: luchtvervuiling piekt waar het verkeer het drukst is.', 'Aanpak: CubeSats en AI waarmee voertuigen overschakelen op een ecomodus.', 'Fase: prototype. Resultaten publiceren we zodra testdata ze onderbouwen.'],
			[['Is dit een aanbod om te investeren?', 'Nee. Deze website is uitsluitend informatief en vormt geen aanbod van aandelen of financiële producten. Neem contact op als u wilt praten.'], ['Publiceren jullie resultaten of prognoses?', 'Nog niet. Wij delen resultaten zodra ze door testdata worden onderbouwd.']]),
		de: T('Investoren', 'Für Investoren: Prototypphase', 'Aethra baut Technologie für sauberere Luft im Verkehr',
			'Wir befinden uns in der Prototypphase und sind offen für Gespräche mit Investoren, die mehr erfahren möchten.',
			['Problem: Die Luftbelastung erreicht dort Spitzen, wo der Verkehr am dichtesten ist.', 'Ansatz: CubeSats und KI, mit denen Fahrzeuge in einen Eco-Modus wechseln.', 'Stand: Prototyp. Ergebnisse veröffentlichen wir, sobald Testdaten sie belegen.'],
			[['Ist das ein Investitionsangebot?', 'Nein. Diese Website dient nur der Information und ist kein Angebot von Anteilen oder Finanzprodukten. Kontaktieren Sie uns, wenn Sie sprechen möchten.'], ['Veröffentlichen Sie Ergebnisse oder Prognosen?', 'Noch nicht. Wir teilen Ergebnisse, sobald sie durch Testdaten belegt sind.']]),
		fr: T('Investisseurs', 'Pour les investisseurs : phase de prototype', 'Aethra développe une technologie pour un air plus propre dans le trafic',
			'Nous sommes en phase de prototype et ouverts aux échanges avec les investisseurs qui souhaitent en savoir plus.',
			['Problème : la pollution atteint des pics là où le trafic est le plus dense.', 'Approche : des CubeSats et une IA qui font passer les véhicules en mode éco.', 'Stade : prototype. Les résultats seront publiés lorsqu’ils seront étayés par des données d’essai.'],
			[['S’agit-il d’une offre d’investissement ?', 'Non. Ce site est purement informatif et ne constitue pas une offre d’actions ni de produits financiers. Contactez-nous si vous souhaitez en parler.'], ['Publiez-vous des résultats ou des prévisions ?', 'Pas encore. Nous partagerons les résultats lorsqu’ils seront étayés par des données d’essai.']]),
	}),
];

/** Admin field definitions and per-language defaults generated from the data above. */
function audienceFields() {
	return AUDIENCES.map((a) => {
		const e = a.i18n.en;
		const k = (s) => `aud_${a.slug}_${s}`;
		return {
			id: `aud_${a.slug}`,
			title: `Page for ${e.label.toLowerCase()}`,
			fields: [
				{ key: k('seo'), label: 'Page title for search engines', type: 'text', default: e.seo },
				{ key: k('title'), label: 'Heading', type: 'text', default: e.title },
				{ key: k('lead'), label: 'Introduction', type: 'textarea', default: e.lead },
				...e.points.map((p, i) => ({ key: k(`p${i + 1}`), label: `Point ${i + 1}`, type: 'text', default: p })),
				...e.faq.flatMap((f, i) => [
					{ key: k(`q${i + 1}`), label: `Question ${i + 1}`, type: 'text', default: f[0] },
					{ key: k(`a${i + 1}`), label: `Answer ${i + 1}`, type: 'textarea', default: f[1] },
				]),
			],
		};
	});
}

function audienceTranslations(lang) {
	const out = {};
	for (const a of AUDIENCES) {
		const t = a.i18n[lang];
		if (!t) continue;
		const k = (s) => `aud_${a.slug}_${s}`;
		out[k('seo')] = t.seo; out[k('title')] = t.title; out[k('lead')] = t.lead;
		t.points.forEach((p, i) => { out[k(`p${i + 1}`)] = p; });
		t.faq.forEach((f, i) => { out[k(`q${i + 1}`)] = f[0]; out[k(`a${i + 1}`)] = f[1]; });
	}
	return out;
}

const labelFor = (a, lang) => (a.i18n[lang] || a.i18n.en).label;

module.exports = { AUDIENCES, audienceFields, audienceTranslations, labelFor };
