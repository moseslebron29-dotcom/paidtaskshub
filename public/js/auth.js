(function () {
    'use strict';

    var $ = function (s) { return document.querySelector(s); };

    var message = $('#authMessage');
    var forms = ['loginForm', 'registerForm', 'otpForm'];

    function show(text, kind) {
        if (!text) {
            message.className = 'alert hidden';
            message.textContent = '';
            return;
        }

        message.className = 'alert ' + (kind === 'ok' ? 'alert-ok' : kind === 'info' ? 'alert-info' : 'alert-error');
        message.textContent = text;
    }

    function showForm(which) {
        forms.forEach(function (id) {
            $('#' + id).classList.toggle('hidden', id !== which);
        });

        $('#tabs').classList.toggle('hidden', which === 'otpForm');
        $('#loginTab').classList.toggle('selected', which === 'loginForm');
        $('#registerTab').classList.toggle('selected', which === 'registerForm');
        show('');
    }

    async function post(url, data) {
        var response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(data)
        });

        var result = {};

        try { result = await response.json(); } catch (e) { /* not JSON */ }

        if (!response.ok) {
            throw new Error(result.error || 'Something went wrong. Please try again.');
        }

        return result;
    }

    function busy(form, on, label) {
        var b = form.querySelector('button[type="submit"]');

        if (!b.dataset.label) b.dataset.label = b.textContent;

        b.disabled = on;
        b.textContent = on ? label : b.dataset.label;
    }

    function formData(form) {
        var d = {};

        new FormData(form).forEach(function (v, k) { d[k] = typeof v === 'string' ? v.trim() : v; });

        return d;
    }

    function openOtp(email, text) {
        $('#otpForm [name="email"]').value = email;
        showForm('otpForm');
        show(text || 'Enter the verification code sent to your email.', 'info');
    }

    function cooldown(button, seconds) {
        var left = seconds;
        var original = 'Resend verification code';

        button.disabled = true;

        var timer = setInterval(function () {
            left -= 1;

            if (left <= 0) {
                clearInterval(timer);
                button.disabled = false;
                button.textContent = original;
            } else {
                button.textContent = 'Resend available in ' + left + 's';
            }
        }, 1000);

        button.textContent = 'Resend available in ' + left + 's';
    }

    async function resend(email, button) {
        if (!email) {
            show('Enter your email address first.');
            return false;
        }

        button.disabled = true;
        show('Sending a new code...', 'info');

        try {
            var result = await post('/api/resend-otp', { email: email });

            show(result.message, 'ok');
            cooldown(button, 60);

            return true;
        } catch (error) {
            show(error.message);
            button.disabled = false;

            return false;
        }
    }

    $('#loginTab').onclick = function () { showForm('loginForm'); };
    $('#registerTab').onclick = function () { showForm('registerForm'); };

    $('#loginForm').addEventListener('submit', async function (e) {
        e.preventDefault();

        var form = e.target;

        show('');
        busy(form, true, 'Signing in...');

        try {
            await post('/api/login', formData(form));
            location.href = '/app';
        } catch (error) {
            show(error.message);
            busy(form, false);
        }
    });

    $('#registerForm').addEventListener('submit', async function (e) {
        e.preventDefault();

        var form = e.target;
        var data = formData(form);

        show('');

        if (data.password !== data.confirmPassword) {
            show('Passwords do not match.');
            return;
        }

        busy(form, true, 'Creating account...');

        try {
            await post('/api/register', data);

            try { localStorage.removeItem('pth_ref'); } catch (err) { /* ignore */ }

            openOtp(data.email, 'We sent a 6-digit code to ' + data.email + '.');
        } catch (error) {
            show(error.message);
        }

        busy(form, false);
    });

    $('#otpForm').addEventListener('submit', async function (e) {
        e.preventDefault();

        var form = e.target;

        show('');
        busy(form, true, 'Verifying...');

        try {
            await post('/api/verify-email', formData(form));
            location.href = '/app';
        } catch (error) {
            show(error.message);
            busy(form, false);
        }
    });

    $('#otpResend').onclick = function () {
        resend($('#otpForm [name="email"]').value.trim(), this);
    };

    $('#loginResend').onclick = async function () {
        var email = $('#loginForm [name="email"]').value.trim();
        var ok = await resend(email, this);

        if (ok) openOtp(email, 'A new code was sent. Enter it below.');
    };

    // Referral link support: /auth?ref=CODE opens the sign-up form.
    var params = new URLSearchParams(location.search);
    var ref = (params.get('ref') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (ref) {
        try { localStorage.setItem('pth_ref', ref); } catch (err) { /* ignore */ }
    } else {
        try { ref = localStorage.getItem('pth_ref') || ''; } catch (err) { ref = ''; }
    }

    if (ref) $('#registerForm [name="ref"]').value = ref;

    if (params.get('tab') === 'register' || params.get('ref')) {
        showForm('registerForm');
    }

    // Already logged in? Go straight to the dashboard.
    fetch('/api/session', { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (s) { if (s.loggedIn) location.replace('/app'); })
        .catch(function () { /* stay on the login page */ });
})();
