<?php
/**
 * Aethra theme setup. No external requests: fonts, scripts and styles are local.
 */
defined( 'ABSPATH' ) || exit;

require_once get_template_directory() . '/inc/defaults.php';
require_once get_template_directory() . '/inc/customizer.php';
require_once get_template_directory() . '/inc/contact.php';

function aethra_setup() {
	add_theme_support( 'title-tag' );
	add_theme_support( 'post-thumbnails' );
	add_theme_support( 'html5', array( 'style', 'script', 'comment-list', 'comment-form', 'gallery', 'caption' ) );
	add_theme_support( 'custom-logo', array( 'height' => 48, 'width' => 160, 'flex-width' => true, 'flex-height' => true ) );
	register_nav_menus( array( 'footer' => 'Footer links' ) );
}
add_action( 'after_setup_theme', 'aethra_setup' );

function aethra_assets() {
	$ver = wp_get_theme()->get( 'Version' );
	wp_enqueue_style( 'aethra', get_stylesheet_uri(), array(), $ver );
	wp_enqueue_script( 'aethra', get_template_directory_uri() . '/assets/js/site.js', array(), $ver, array( 'strategy' => 'defer', 'in_footer' => true ) );
}
add_action( 'wp_enqueue_scripts', 'aethra_assets' );

// Privacy by default: no emoji CDN, no oEmbed discovery, no remote resource hints.
remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
remove_action( 'wp_print_styles', 'print_emoji_styles' );
remove_action( 'wp_head', 'wp_oembed_add_discovery_links' );
remove_action( 'wp_head', 'wp_oembed_add_host_js' );
remove_action( 'wp_head', 'wp_generator' );
add_filter( 'wp_resource_hints', '__return_empty_array' );

function aethra_head_meta() {
	echo '<meta name="theme-color" content="#0b1b33">' . "\n";
	echo '<link rel="icon" href="' . esc_url( get_template_directory_uri() . '/assets/img/favicon.svg' ) . '" type="image/svg+xml">' . "\n";
}
add_action( 'wp_head', 'aethra_head_meta', 1 );

function aethra_logo_svg( $class = 'logo-mark' ) {
	return '<svg class="' . esc_attr( $class ) . '" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="6" fill="currentColor"/><ellipse cx="16" cy="16" rx="14" ry="5.5" fill="none" stroke="currentColor" stroke-width="1.6" transform="rotate(-28 16 16)"/></svg>';
}
