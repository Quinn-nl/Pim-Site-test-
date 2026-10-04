(function () {
	'use strict';
	var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	var items = document.querySelectorAll('[data-reveal]');
	if (reduce || !('IntersectionObserver' in window)) {
		items.forEach(function (el) { el.classList.add('is-visible'); });
	} else {
		var io = new IntersectionObserver(function (entries) {
			entries.forEach(function (entry) {
				if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
			});
		}, { threshold: 0.12 });
		items.forEach(function (el) { io.observe(el); });
	}
	var toggle = document.querySelector('.nav-toggle');
	var nav = document.getElementById('site-nav');
	if (toggle && nav) {
		toggle.addEventListener('click', function () {
			var open = nav.classList.toggle('open');
			toggle.setAttribute('aria-expanded', String(open));
		});
		document.addEventListener('keydown', function (e) {
			if (e.key === 'Escape' && nav.classList.contains('open')) { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); }
		});
	}
	// Remember a deliberate language choice (one functional cookie, one year).
	document.querySelectorAll('.lang a[data-lang]').forEach(function (a) {
		a.addEventListener('click', function () {
			var secure = location.protocol === 'https:' ? '; Secure' : '';
			document.cookie = 'aethra_lang=' + a.getAttribute('data-lang') + '; Path=/; Max-Age=31536000; SameSite=Lax' + secure;
		});
	});
	// After a failed or finished submit, move focus to the message so screen readers announce it.
	var focusTarget = document.querySelector('[data-autofocus]');
	if (focusTarget) focusTarget.focus();

	// Show progress and block double submits; restore the button when the page comes back from history.
	var form = document.querySelector('form.form');
	if (form) {
		var submit = form.querySelector('button[type=submit]');
		var label = submit && submit.textContent;
		form.addEventListener('submit', function () {
			if (submit.disabled) return;
			submit.disabled = true;
			submit.textContent = submit.getAttribute('data-sending') || label;
		});
		window.addEventListener('pageshow', function () { submit.disabled = false; submit.textContent = label; });
	}
	var sticky = document.querySelector('.sticky-cta');
	var header = document.querySelector('.site-header');
	if (header) {
		var onScroll = function () {
			header.classList.toggle('is-scrolled', window.scrollY > 8);
			if (sticky) sticky.classList.toggle('show', window.scrollY > 480);
		};
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
	}
})();
