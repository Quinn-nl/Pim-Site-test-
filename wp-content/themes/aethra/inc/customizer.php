<?php
/**
 * Customizer: the admin panel for all text and images.
 */
defined( 'ABSPATH' ) || exit;

function aethra_customize( $wp_customize ) {
	$defaults = aethra_defaults();

	$sections = array(
		'hero'    => array( 'Hero', array( 'hero_eyebrow', 'hero_title', 'hero_text', 'hero_cta' ) ),
		'problem' => array( 'The problem', array( 'problem_title', 'problem_text', 'fact1_value', 'fact1_label', 'fact1_source', 'fact1_url', 'fact2_value', 'fact2_label', 'fact2_source', 'fact2_url' ) ),
		'steps'   => array( 'Three steps', array( 'steps_title', 'step1_title', 'step1_text', 'step2_title', 'step2_text', 'step3_title', 'step3_text' ) ),
		'apps'    => array( 'Applications', array( 'apps_title', 'app1_title', 'app1_text', 'app2_title', 'app2_text', 'app3_title', 'app3_text', 'app4_title', 'app4_text' ) ),
		'status'  => array( 'Status', array( 'status_title', 'status_text', 'status_note' ) ),
		'contact' => array( 'Contact', array( 'contact_title', 'contact_text', 'contact_email', 'company_line' ) ),
	);

	$wp_customize->add_panel( 'aethra', array( 'title' => 'Aethra content', 'priority' => 20 ) );

	foreach ( $sections as $id => $section ) {
		$wp_customize->add_section( 'aethra_' . $id, array( 'title' => $section[0], 'panel' => 'aethra' ) );
		foreach ( $section[1] as $key ) {
			$is_url   = '_url' === substr( $key, -4 );
			$is_email = 'contact_email' === $key;
			$is_long  = false !== strpos( $key, '_text' ) || false !== strpos( $key, '_label' ) || 'status_note' === $key;
			$wp_customize->add_setting( $key, array(
				'default'           => $defaults[ $key ],
				'sanitize_callback' => $is_url ? 'esc_url_raw' : ( $is_email ? 'sanitize_email' : 'sanitize_text_field' ),
			) );
			$wp_customize->add_control( $key, array(
				'label'   => ucwords( str_replace( '_', ' ', $key ) ),
				'section' => 'aethra_' . $id,
				'type'    => $is_url ? 'url' : ( $is_email ? 'email' : ( $is_long ? 'textarea' : 'text' ) ),
			) );
		}
	}

	// Photos: uploaded by the editor, so rights and sources stay under their control.
	$images = array(
		'hero_image'    => 'Hero photo (optional)',
		'problem_image' => 'Problem photo (optional)',
		'status_image'  => 'Status photo (optional)',
	);
	$wp_customize->add_section( 'aethra_images', array( 'title' => 'Photos', 'panel' => 'aethra' ) );
	foreach ( $images as $key => $label ) {
		$wp_customize->add_setting( $key, array( 'default' => 0, 'sanitize_callback' => 'absint' ) );
		$wp_customize->add_control( new WP_Customize_Media_Control( $wp_customize, $key, array(
			'label'     => $label,
			'section'   => 'aethra_images',
			'mime_type' => 'image',
		) ) );
	}
}
add_action( 'customize_register', 'aethra_customize' );

function aethra_image( $key, $size = 'large', $class = '' ) {
	$id = (int) get_theme_mod( $key, 0 );
	if ( ! $id ) {
		return '';
	}
	return wp_get_attachment_image( $id, $size, false, array( 'class' => $class, 'loading' => 'lazy', 'decoding' => 'async' ) );
}
