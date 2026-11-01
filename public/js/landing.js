(function () {
    'use strict';

    var btn = document.getElementById('menuBtn');
    var links = document.getElementById('navLinks');

    btn.addEventListener('click', function () {
        var open = links.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    links.addEventListener('click', function (e) {
        if (e.target.tagName === 'A') {
            links.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
        }
    });

    document.getElementById('year').textContent = new Date().getFullYear();

    fetch('/api/config', { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (c) {
            if (!c) return;

            document.getElementById('minWd').textContent =
                'minimum KES ' + (c.minWithdrawal / 100);

            var parts = [];

            if (c.supportEmail) parts.push('Email: ' + c.supportEmail);
            if (c.supportPhone) parts.push('Phone: ' + c.supportPhone);

            if (parts.length) {
                document.getElementById('contactLine').textContent = parts.join('  ·  ');
            }
        })
        .catch(function () { /* the page works without this */ });
})();
