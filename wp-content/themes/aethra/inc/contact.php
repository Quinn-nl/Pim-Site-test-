<?php
/**
 * Contact form: nonce, honeypot, minimum fill time, validation, mail.
 * Messages are only e-mailed; nothing is stored in the database.
 */
defined( 'ABSPATH' ) || exit;

function aethra_contact_roles() {
	return array( 'Investor', 'Municipality', 'Fleet operator', 'Vehicle manufacturer', 'Mobility platform', 'Other' );
}

function aethra_handle_contact() {
	$back = wp_get_referer() ? wp_get_referer() : home_url( '/' );
	$back = remove_query_arg( 'contact', $back );

	if ( ! isset( $_POST['aethra_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['aethra_nonce'] ) ), 'aethra_contact' ) ) {
		wp_safe_redirect( add_query_arg( 'contact', 'error', $back ) . '#contact' );
		exit;
	}

	// Honeypot and minimum fill time (bots answer instantly).
	$started = isset( $_POST['aethra_t'] ) ? (int) $_POST['aethra_t'] : 0;
	if ( ! empty( $_POST['website'] ) || ( time() - $started ) < 3 ) {
		wp_safe_redirect( add_query_arg( 'contact', 'sent', $back ) . '#contact' );
		exit;
	}

	$name    = isset( $_POST['name'] ) ? sanitize_text_field( wp_unslash( $_POST['name'] ) ) : '';
	$email   = isset( $_POST['email'] ) ? sanitize_email( wp_unslash( $_POST['email'] ) ) : '';
	$org     = isset( $_POST['organisation'] ) ? sanitize_text_field( wp_unslash( $_POST['organisation'] ) ) : '';
	$role    = isset( $_POST['role'] ) ? sanitize_text_field( wp_unslash( $_POST['role'] ) ) : '';
	$message = isset( $_POST['message'] ) ? sanitize_textarea_field( wp_unslash( $_POST['message'] ) ) : '';
	$consent = ! empty( $_POST['consent'] );

	if ( ! in_array( $role, aethra_contact_roles(), true ) ) {
		$role = 'Other';
	}
	if ( '' === $name || ! is_email( $email ) || '' === $message || ! $consent || strlen( $message ) > 5000 ) {
		wp_safe_redirect( add_query_arg( 'contact', 'invalid', $back ) . '#contact' );
		exit;
	}

	$to = aethra_get( 'contact_email' );
	if ( ! is_email( $to ) ) {
		$to = get_option( 'admin_email' );
	}

	$body  = "Name: $name\nEmail: $email\nOrganisation: $org\nI am a(n): $role\n\n$message\n";
	$sent  = wp_mail(
		$to,
		'Website enquiry: ' . $role,
		$body,
		array( 'Reply-To: ' . $name . ' <' . $email . '>' )
	);

	wp_safe_redirect( add_query_arg( 'contact', $sent ? 'sent' : 'error', $back ) . '#contact' );
	exit;
}
add_action( 'admin_post_nopriv_aethra_contact', 'aethra_handle_contact' );
add_action( 'admin_post_aethra_contact', 'aethra_handle_contact' );
