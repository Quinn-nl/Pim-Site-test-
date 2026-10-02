<?php defined( 'ABSPATH' ) || exit; ?>
<footer class="site-footer">
	<div class="wrap footer-inner">
		<div>
			<p class="footer-brand"><?php echo esc_html( strtoupper( get_bloginfo( 'name' ) ) ); ?></p>
			<p class="footer-note"><?php echo esc_html( aethra_get( 'company_line' ) ); ?></p>
		</div>
		<nav aria-label="Legal">
			<?php $privacy = get_privacy_policy_url(); ?>
			<?php if ( $privacy ) : ?>
				<a href="<?php echo esc_url( $privacy ); ?>">Privacy statement</a>
			<?php endif; ?>
			<?php wp_nav_menu( array( 'theme_location' => 'footer', 'container' => false, 'items_wrap' => '%3$s', 'fallback_cb' => false, 'depth' => 1 ) ); ?>
		</nav>
	</div>
	<div class="wrap footer-bottom">
		<small>&copy; <?php echo esc_html( gmdate( 'Y' ) ); ?> <?php echo esc_html( get_bloginfo( 'name' ) ); ?>. Informational website; not an offer of securities or financial products.</small>
	</div>
</footer>
<?php wp_footer(); ?>
</body>
</html>
