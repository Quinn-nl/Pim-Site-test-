<?php
/**
 * Single-page layout: hero, problem, three steps, applications, status, contact.
 */
defined( 'ABSPATH' ) || exit;
get_header();

$status = isset( $_GET['contact'] ) ? sanitize_key( wp_unslash( $_GET['contact'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification -- display only.
$steps  = array( 1, 2, 3 );
$apps   = array( 1, 2, 3, 4 );
$facts  = array( 1, 2 );
?>
<main id="main">

<section class="hero" aria-labelledby="hero-title">
	<div class="hero-sky" aria-hidden="true"></div>
	<div class="wrap hero-inner">
		<p class="eyebrow"><?php echo esc_html( aethra_get( 'hero_eyebrow' ) ); ?></p>
		<h1 id="hero-title"><?php echo esc_html( aethra_get( 'hero_title' ) ); ?></h1>
		<p class="lead"><?php echo esc_html( aethra_get( 'hero_text' ) ); ?></p>
		<p><a class="btn" href="#contact"><?php echo esc_html( aethra_get( 'hero_cta' ) ); ?></a></p>
		<?php echo aethra_image( 'hero_image', 'large', 'hero-photo' ); // phpcs:ignore WordPress.Security.EscapeOutput -- core-escaped. ?>
	</div>
</section>

<section id="problem" class="section" aria-labelledby="problem-title">
	<div class="wrap">
		<p class="kicker">01 · The problem</p>
		<h2 id="problem-title" data-reveal><?php echo esc_html( aethra_get( 'problem_title' ) ); ?></h2>
		<p class="section-lead" data-reveal><?php echo esc_html( aethra_get( 'problem_text' ) ); ?></p>
		<div class="facts">
			<?php foreach ( $facts as $n ) : ?>
				<figure class="fact" data-reveal>
					<p class="fact-value"><?php echo esc_html( aethra_get( "fact{$n}_value" ) ); ?></p>
					<figcaption>
						<?php echo esc_html( aethra_get( "fact{$n}_label" ) ); ?>
						<?php $url = aethra_get( "fact{$n}_url" ); ?>
						<span class="source">Source:
							<?php if ( $url ) : ?>
								<a href="<?php echo esc_url( $url ); ?>" rel="noopener noreferrer" target="_blank"><?php echo esc_html( aethra_get( "fact{$n}_source" ) ); ?></a>
							<?php else : ?>
								<?php echo esc_html( aethra_get( "fact{$n}_source" ) ); ?>
							<?php endif; ?>
						</span>
					</figcaption>
				</figure>
			<?php endforeach; ?>
		</div>
		<?php echo aethra_image( 'problem_image', 'large', 'section-photo' ); // phpcs:ignore WordPress.Security.EscapeOutput ?>
	</div>
</section>

<section id="how" class="section section-tint" aria-labelledby="how-title">
	<div class="wrap">
		<p class="kicker">02 · What it does</p>
		<h2 id="how-title" data-reveal><?php echo esc_html( aethra_get( 'steps_title' ) ); ?></h2>
		<ol class="steps">
			<?php foreach ( $steps as $n ) : ?>
				<li class="step" data-reveal>
					<span class="step-num" aria-hidden="true"><?php echo esc_html( sprintf( '%02d', $n ) ); ?></span>
					<h3><?php echo esc_html( aethra_get( "step{$n}_title" ) ); ?></h3>
					<p><?php echo esc_html( aethra_get( "step{$n}_text" ) ); ?></p>
				</li>
			<?php endforeach; ?>
		</ol>
	</div>
</section>

<section id="applications" class="section" aria-labelledby="apps-title">
	<div class="wrap">
		<p class="kicker">03 · Applications</p>
		<h2 id="apps-title" data-reveal><?php echo esc_html( aethra_get( 'apps_title' ) ); ?></h2>
		<div class="cards">
			<?php foreach ( $apps as $n ) : ?>
				<article class="card" data-reveal>
					<h3><?php echo esc_html( aethra_get( "app{$n}_title" ) ); ?></h3>
					<p><?php echo esc_html( aethra_get( "app{$n}_text" ) ); ?></p>
				</article>
			<?php endforeach; ?>
		</div>
	</div>
</section>

<section id="status" class="section section-dark" aria-labelledby="status-title">
	<div class="wrap status-grid">
		<div>
			<p class="kicker">04 · Status</p>
			<h2 id="status-title" data-reveal><?php echo esc_html( aethra_get( 'status_title' ) ); ?></h2>
			<p class="section-lead" data-reveal><?php echo esc_html( aethra_get( 'status_text' ) ); ?></p>
			<p class="status-note"><?php echo esc_html( aethra_get( 'status_note' ) ); ?></p>
		</div>
		<div class="status-track" aria-label="Development phase">
			<ul>
				<li class="done">Concept</li>
				<li class="current" aria-current="step">Prototype</li>
				<li>Validation</li>
				<li>Pilots</li>
			</ul>
		</div>
	</div>
</section>

<section id="contact" class="section" aria-labelledby="contact-title">
	<div class="wrap contact-grid">
		<div>
			<p class="kicker">05 · Contact</p>
			<h2 id="contact-title" data-reveal><?php echo esc_html( aethra_get( 'contact_title' ) ); ?></h2>
			<p class="section-lead" data-reveal><?php echo esc_html( aethra_get( 'contact_text' ) ); ?></p>
		</div>
		<div>
			<?php if ( 'sent' === $status ) : ?>
				<p class="notice notice-ok" role="status">Thank you. Your message has been sent.</p>
			<?php elseif ( 'invalid' === $status ) : ?>
				<p class="notice notice-err" role="alert">Please complete all required fields, including consent.</p>
			<?php elseif ( 'error' === $status ) : ?>
				<p class="notice notice-err" role="alert">Your message could not be sent. Please try again later.</p>
			<?php endif; ?>
			<form class="form" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="aethra_contact">
				<input type="hidden" name="aethra_t" value="<?php echo esc_attr( time() ); ?>">
				<?php wp_nonce_field( 'aethra_contact', 'aethra_nonce' ); ?>
				<div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>

				<div class="field"><label for="f-name">Name *</label><input id="f-name" name="name" type="text" autocomplete="name" required></div>
				<div class="field"><label for="f-email">Email *</label><input id="f-email" name="email" type="email" autocomplete="email" required></div>
				<div class="field"><label for="f-org">Organisation</label><input id="f-org" name="organisation" type="text" autocomplete="organization"></div>
				<div class="field">
					<label for="f-role">I am a(n)</label>
					<select id="f-role" name="role">
						<?php foreach ( aethra_contact_roles() as $role ) : ?>
							<option><?php echo esc_html( $role ); ?></option>
						<?php endforeach; ?>
					</select>
				</div>
				<div class="field"><label for="f-msg">Message *</label><textarea id="f-msg" name="message" rows="5" maxlength="5000" required></textarea></div>
				<div class="field check">
					<input id="f-consent" name="consent" type="checkbox" value="1" required>
					<label for="f-consent">
						I agree that my details are used to reply to this message.
						<?php $privacy = get_privacy_policy_url(); ?>
						<?php if ( $privacy ) : ?>
							See the <a href="<?php echo esc_url( $privacy ); ?>">privacy statement</a>.
						<?php endif; ?>
					</label>
				</div>
				<button class="btn" type="submit">Send message</button>
			</form>
		</div>
	</div>
</section>

</main>
<?php get_footer(); ?>
