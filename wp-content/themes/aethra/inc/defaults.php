<?php
/**
 * Default copy for every editable field. Editors change these in
 * Appearance > Customize; nothing here is hard-coded in the templates.
 */
defined( 'ABSPATH' ) || exit;

function aethra_defaults() {
	return array(
		// Hero.
		'hero_eyebrow'  => 'Prototype phase',
		'hero_title'    => 'Cleaner air, right where traffic is heaviest',
		'hero_text'     => 'Aethra is developing CubeSats and AI that help vehicles switch to an eco mode in areas with high air pollution.',
		'hero_cta'      => 'Get in touch',

		// Problem.
		'problem_title' => 'Air pollution is concentrated where people and traffic meet',
		'problem_text'  => 'Exhaust from road vehicles is a major local source of air pollution in many cities. Pollution is not evenly spread: it peaks in specific places and at specific times, while vehicles drive on as if every street were the same.',
		'fact1_value'   => '4.2 million',
		'fact1_label'   => 'premature deaths worldwide in 2019 were attributed to ambient (outdoor) air pollution.',
		'fact1_source'  => 'WHO, Ambient (outdoor) air quality and health',
		'fact1_url'     => 'https://www.who.int/news-room/fact-sheets/detail/ambient-(outdoor)-air-quality-and-health',
		'fact2_value'   => '182,000',
		'fact2_label'   => 'premature deaths in the EU-27 in 2023 were attributable to fine particulate matter above WHO guideline levels.',
		'fact2_source'  => 'European Environment Agency, 2025',
		'fact2_url'     => 'https://www.eea.europa.eu/en/europe-environment-2025/thematic-briefings/environment-and-human-health/air-pollution-and-impacts-on-human-health/',

		// How it works (what, not how).
		'steps_title'   => 'What Aethra does, in three steps',
		'step1_title'   => 'Detect',
		'step1_text'    => 'Recognise the places where air quality is under pressure.',
		'step2_title'   => 'Decide',
		'step2_text'    => 'AI determines when a vehicle should adapt its behaviour.',
		'step3_title'   => 'Switch',
		'step3_text'    => 'Vehicles move to an eco mode while they are in those areas.',

		// Applications.
		'apps_title'    => 'Built for the parties that shape urban mobility',
		'app1_title'    => 'Municipalities',
		'app1_text'     => 'A tool to protect the air in the places that matter most to residents.',
		'app2_title'    => 'Fleet operators',
		'app2_text'     => 'Vehicles that respond to local conditions without extra work for drivers.',
		'app3_title'    => 'Vehicle manufacturers',
		'app3_text'     => 'An additional layer of intelligence for vehicle control systems.',
		'app4_title'    => 'Mobility platforms',
		'app4_text'     => 'A way to offer cleaner trips in the busiest areas.',

		// Status.
		'status_title'  => 'Where we are',
		'status_text'   => 'Aethra is in the prototype phase. We are developing and testing the concept and are open to conversations with investors and partners who want to learn more.',
		'status_note'   => 'Results will be published once they are supported by test data.',

		// Contact.
		'contact_title' => 'Let us talk',
		'contact_text'  => 'Whether you represent a city, a fleet, a manufacturer, a platform or an investor: send us a message and we will get back to you.',
		'contact_email' => '',
		'company_line'  => 'Company details will follow.',
	);
}

function aethra_get( $key ) {
	$defaults = aethra_defaults();
	$fallback = isset( $defaults[ $key ] ) ? $defaults[ $key ] : '';
	return get_theme_mod( $key, $fallback );
}
