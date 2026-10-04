(function () {
	'use strict';
	var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	var items = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
	var pending = items.slice();
	var revealed = function (el) {
		el.classList.add('is-visible');
		var k = pending.indexOf(el);
		if (k > -1) pending.splice(k, 1);
	};
	if (reduce || !('IntersectionObserver' in window)) {
		items.forEach(revealed);
	} else {
		var io = new IntersectionObserver(function (entries) {
			entries.forEach(function (entry) {
				if (entry.isIntersecting) { revealed(entry.target); io.unobserve(entry.target); }
			});
		}, { threshold: 0.12 });
		items.forEach(function (el) { io.observe(el); });
		// An instant jump (End key, anchor, restored scroll position) can skip items without ever intersecting:
		// anything that ended up above the viewport is shown straight away so nothing stays invisible.
		var sweep = function () {
			for (var i = pending.length - 1; i >= 0; i--) {
				if (pending[i].getBoundingClientRect().bottom < 0) { io.unobserve(pending[i]); revealed(pending[i]); }
			}
		};
		var ticking = false;
		window.addEventListener('scroll', function () {
			if (ticking || !pending.length) return;
			ticking = true;
			requestAnimationFrame(function () { ticking = false; sweep(); });
		}, { passive: true });
		sweep();
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

	// plan 005: FAQ accordion. Pointer/touch only; keyboard and reduced motion keep the native instant toggle.
	var tokens = function (name, fallback) {
		var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
		return v > 0 ? v : fallback;
	};
	var glide = 'cubic-bezier(.39,.575,.565,1)';
	var faq = document.querySelector('.faq');
	if (faq && !reduce && document.documentElement.animate) {
		faq.addEventListener('click', function (e) {
			var summary = e.target.closest && e.target.closest('summary');
			if (!summary || e.detail === 0) return;
			var el = summary.parentNode;
			e.preventDefault();
			var from = el.getBoundingClientRect().height;
			if (el._anim) el._anim.cancel();
			var opening = !el.open || el.hasAttribute('data-closing');
			var answer = el.querySelector('p');
			var to;
			if (opening) {
				el.removeAttribute('data-closing');
				el.open = true;
				to = el.scrollHeight + el.offsetHeight - el.clientHeight;
				to = Math.max(to, el.getBoundingClientRect().height);
			} else {
				el.setAttribute('data-closing', '');
				to = summary.offsetHeight + (el.offsetHeight - el.clientHeight);
			}
			var dur = opening ? tokens('--dur-accordion-open', 280) : tokens('--dur-accordion-close', 200);
			var opts = { duration: dur, easing: glide, fill: 'none' };
			var anim = el.animate([{ height: from + 'px' }, { height: to + 'px' }], opts);
			if (answer) answer.animate([{ opacity: opening ? 0 : 1 }, { opacity: opening ? 1 : 0 }], opts);
			el._anim = anim;
			anim.onfinish = function () {
				el._anim = null;
				if (!opening) { el.open = false; el.removeAttribute('data-closing'); }
			};
		});
	}
})();
