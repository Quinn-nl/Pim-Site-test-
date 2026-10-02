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
	var header = document.querySelector('.site-header');
	if (header) {
		var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });
	}
})();
