(function () {
    'use strict';

    var $ = function (s) { return document.querySelector(s); };
    var msg = $('#actMessage');
    var form = $('#actForm');
    var payBtn = $('#actPay');
    var waiting = $('#actWaiting');
    var pollTimer = null;
    var pollUntil = 0;
    var fee = 150;

    var MESSAGES = {
        paid: ['ok', 'Payment confirmed. Your account is active — taking you to your dashboard…'],
        failed: ['error', 'The payment did not go through. Please try again.'],
        cancelled: ['error', 'You cancelled the M-Pesa request. You can try again.'],
        timeout: ['error', 'The M-Pesa request timed out. Please try again.'],
        review: ['info', 'Your payment is being reviewed by our team. Contact support if money left your M-Pesa.'],
        processing: ['info', 'Waiting for you to enter your M-Pesa PIN…'],
        verifying: ['info', 'Payment received — confirming with M-Pesa…'],
        initiating: ['info', 'Sending the payment request…'],
        unknown: ['info', 'Checking the payment status with M-Pesa…']
    };

    function show(text, kind) {
        if (!text) { msg.className = 'alert hidden'; msg.textContent = ''; return; }
        msg.className = 'alert ' + (kind === 'ok' ? 'alert-ok' : kind === 'info' ? 'alert-info' : 'alert-error');
        msg.textContent = text;
    }

    function setWaiting(on) {
        waiting.classList.toggle('hidden', !on);
        form.classList.toggle('hidden', on);
    }

    async function api(url, method, body) {
        var opts = { method: method || 'GET', credentials: 'same-origin', headers: {} };
        if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
        var r = await fetch(url, opts);
        var d = {};
        try { d = await r.json(); } catch (e) {}
        if (r.status === 401) { location.href = '/auth'; throw new Error('Please log in.'); }
        if (!r.ok) { var err = new Error(d.error || 'Something went wrong.'); err.code = d.code; throw err; }
        return d;
    }

    function done() {
        stopPoll();
        setWaiting(false);
        show(MESSAGES.paid[1], 'ok');
        payBtn.disabled = true;
        setTimeout(function () { location.href = '/app'; }, 1500);
    }

    function stopPoll() { if (pollTimer) clearTimeout(pollTimer); pollTimer = null; }

    async function check(initial) {
        var s = await api('/api/activation/status');
        if (s.activated) return done();

        if (initial) {
            fee = s.activationFee || fee;
            $('#actFee').textContent = 'KSh ' + fee.toLocaleString('en-KE');
            payBtn.textContent = 'Pay KSh ' + fee.toLocaleString('en-KE');
            $('#actRegPhone').textContent = s.registeredPhone ? '0' + String(s.registeredPhone).slice(3) : '—';
            if (!$('#actPhone').value && s.registeredPhone) $('#actPhone').value = '0' + String(s.registeredPhone).slice(3);

            if (!s.configured && !s.devMode) {
                show('M-Pesa payments are not set up on this site yet. Please try again later or contact support.', 'error');
            }
        }

        var st = s.payment ? s.payment.status : 'unpaid';
        var open = ['initiating', 'processing', 'verifying', 'unknown'].indexOf(st) !== -1;

        if (open) {
            setWaiting(true);
            show(MESSAGES[st][1], 'info');
            if (Date.now() < pollUntil || initial) {
                if (initial) pollUntil = Date.now() + 3 * 60 * 1000;
                pollTimer = setTimeout(function () { check(false).catch(onError); }, 4000);
            } else {
                setWaiting(false);
                show('Still waiting for M-Pesa. If you did not get a prompt, try again in a moment.', 'info');
            }
            return;
        }

        setWaiting(false);
        payBtn.disabled = false;
        if (MESSAGES[st] && !initial) show(MESSAGES[st][1], MESSAGES[st][0]);
        else if (MESSAGES[st] && initial && st !== 'paid') show(MESSAGES[st][1], MESSAGES[st][0]);
    }

    function onError(e) { stopPoll(); setWaiting(false); payBtn.disabled = false; show(e.message); }

    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var phone = $('#actPhone').value.trim();

        if (!/^(?:\+?254|0)?[17]\d{8}$/.test(phone.replace(/\s/g, ''))) {
            show('Enter a valid Safaricom number, e.g. 0712345678.');
            return;
        }

        payBtn.disabled = true;
        payBtn.textContent = 'Sending request…';
        show('');

        try {
            var r = await api('/api/activation/stk', 'POST', { phone: phone });
            if (r.activated) return done();
            pollUntil = Date.now() + 3 * 60 * 1000;
            setWaiting(true);
            show(r.message, 'info');
            pollTimer = setTimeout(function () { check(false).catch(onError); }, 5000);
        } catch (err) {
            show(err.message);
            payBtn.disabled = false;
        }
        payBtn.textContent = 'Pay KSh ' + fee.toLocaleString('en-KE');
    });

    $('#actLogout').addEventListener('click', async function () {
        try { await api('/api/logout', 'POST', {}); } catch (e) {}
        location.href = '/';
    });

    check(true).catch(onError);
})();
