<?php
/**
 * Fallback template: the site is a single scrolling page (front-page.php).
 */
defined( 'ABSPATH' ) || exit;

if ( is_front_page() || is_home() ) {
	require get_template_directory() . '/front-page.php';
	return;
}

get_header();
?>
<main id="main" class="wrap prose page-main">
	<?php while ( have_posts() ) : the_post(); ?>
		<article>
			<h1><?php the_title(); ?></h1>
			<?php the_content(); ?>
		</article>
	<?php endwhile; ?>
</main>
<?php get_footer(); ?>
