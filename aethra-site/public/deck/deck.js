(function () {
	'use strict';
	var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
	var prev = document.getElementById('prev'), next = document.getElementById('next');
	var count = document.getElementById('count'), bar = document.getElementById('bar');
	var i = 0;
	function show(n, push, fade) {
		i = Math.max(0, Math.min(slides.length - 1, n));
		slides.forEach(function (s, k) { s.hidden = k !== i; });
		var inner = slides[i].firstElementChild;
		inner.classList.remove('fade');
		if (fade) { void inner.offsetWidth; inner.classList.add('fade'); }
		prev.disabled = i === 0; next.disabled = i === slides.length - 1;
		count.textContent = (i + 1) + ' / ' + slides.length;
		bar.style.transform = 'scaleX(' + ((i + 1) / slides.length) + ')';
		if (push) { try { history.replaceState(null, '', '#' + (i + 1)); } catch (e) { /* ignore */ } }
	}
	// A click with detail 0 comes from the keyboard (Enter or Space on the button): no animation then.
	prev.addEventListener('click', function (e) { show(i - 1, true, e.detail > 0); });
	next.addEventListener('click', function (e) { show(i + 1, true, e.detail > 0); });
	document.addEventListener('keydown', function (e) {
		if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); show(i + 1, true); }
		else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); show(i - 1, true); }
		else if (e.key === 'Home') show(0, true);
		else if (e.key === 'End') show(slides.length - 1, true);
	});
	// Swipe: horizontal intent must dominate (vertical scrolling inside a slide must not change slides);
	// a quick flick counts even when short.
	var t0 = null;
	document.addEventListener('touchstart', function (e) { t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }; }, { passive: true });
	document.addEventListener('touchend', function (e) {
		if (!t0) return;
		var dx = e.changedTouches[0].clientX - t0.x, dy = e.changedTouches[0].clientY - t0.y;
		var speed = Math.abs(dx) / Math.max(1, Date.now() - t0.t);
		t0 = null;
		var horizontal = Math.abs(dx) > Math.abs(dy) * 1.5;
		if (horizontal && (Math.abs(dx) > 50 || (Math.abs(dx) > 20 && speed > 0.3))) show(i + (dx < 0 ? 1 : -1), true);
	}, { passive: true });
	var start = parseInt((location.hash || '').slice(1), 10);
	show(isNaN(start) ? 0 : start - 1, false);
})();
