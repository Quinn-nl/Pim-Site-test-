(function () {
	'use strict';
	var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
	var prev = document.getElementById('prev'), next = document.getElementById('next');
	var count = document.getElementById('count'), bar = document.getElementById('bar');
	var i = 0;
	function show(n, push) {
		i = Math.max(0, Math.min(slides.length - 1, n));
		slides.forEach(function (s, k) { s.hidden = k !== i; });
		prev.disabled = i === 0; next.disabled = i === slides.length - 1;
		count.textContent = (i + 1) + ' / ' + slides.length;
		bar.style.transform = 'scaleX(' + ((i + 1) / slides.length) + ')';
		if (push) { try { history.replaceState(null, '', '#' + (i + 1)); } catch (e) { /* ignore */ } }
	}
	prev.addEventListener('click', function () { show(i - 1, true); });
	next.addEventListener('click', function () { show(i + 1, true); });
	document.addEventListener('keydown', function (e) {
		if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); show(i + 1, true); }
		else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); show(i - 1, true); }
		else if (e.key === 'Home') show(0, true);
		else if (e.key === 'End') show(slides.length - 1, true);
	});
	var x0 = null;
	document.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
	document.addEventListener('touchend', function (e) {
		if (x0 === null) return;
		var dx = e.changedTouches[0].clientX - x0; x0 = null;
		if (Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1), true);
	}, { passive: true });
	var start = parseInt((location.hash || '').slice(1), 10);
	show(isNaN(start) ? 0 : start - 1, false);
})();
