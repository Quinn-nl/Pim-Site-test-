<?php defined( 'ABSPATH' ) || exit; ?><!doctype html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo( 'charset' ); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>document.documentElement.className += ' js';</script>
<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
	<div class="wrap header-inner">
		<a class="brand" href="<?php echo esc_url( home_url( '/' ) ); ?>" aria-label="<?php echo esc_attr( get_bloginfo( 'name' ) ); ?> home">
			<?php
			if ( has_custom_logo() ) {
				the_custom_logo();
			} else {
				echo aethra_logo_svg(); // phpcs:ignore WordPress.Security.EscapeOutput -- static markup.
				echo '<span class="brand-name">' . esc_html( strtoupper( get_bloginfo( 'name' ) ) ) . '</span>';
			}
			?>
		</a>
		<nav class="site-nav" aria-label="Primary">
			<a href="#problem">Problem</a>
			<a href="#how">How it works</a>
			<a href="#applications">Applications</a>
			<a href="#status">Status</a>
			<a class="btn btn-small" href="#contact">Contact</a>
		</nav>
	</div>
</header>
