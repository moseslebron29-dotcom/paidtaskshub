// Registration advertisement. Shown only when a visitor goes to registration
// (?tab=register, a referral link, or the "Create account" tab) and only once
// per browser session. Never shown for plain login.
(function () {
    'use strict';

    var KEY = 'pth_reg_ad_passed';
    var overlay = document.getElementById('pthRegistrationAd');
    var video = document.getElementById('pthAdVideo');
    var exit = document.getElementById('pthAdExit');
    var proceed = document.getElementById('pthAdContinue');
    var full = document.getElementById('pthAdFullscreen');
    var status = document.getElementById('pthAdStatus');
    var registerTab = document.getElementById('registerTab');

    if (!overlay || !video) return;

    function passed() {
        try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; }
    }

    function markPassed() {
        try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
    }

    function enableContinue(text) {
        proceed.disabled = false;
        proceed.textContent = 'Continue to Registration';
        if (text && status) status.textContent = text;
    }

    function closeAd() {
        markPassed();
        overlay.classList.remove('is-visible');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        try { video.pause(); } catch (e) {}

        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(function () {});
        }

        // Make sure the original registration form is what the visitor sees.
        if (registerTab) registerTab.click();
    }

    function openAd() {
        if (passed() || overlay.classList.contains('is-visible')) return;

        overlay.classList.add('is-visible');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        proceed.disabled = true;
        proceed.textContent = 'Continue after video';
        if (status) status.textContent = '';

        video.muted = true;
        video.currentTime = 0;

        var p = video.play();
        if (p && p.catch) {
            p.catch(function () {
                enableContinue('Video could not play automatically. You can continue.');
            });
        }
        exit.focus();
    }

    exit.addEventListener('click', closeAd);
    proceed.addEventListener('click', closeAd);
    video.addEventListener('ended', function () { enableContinue('Thanks for watching.'); });
    video.addEventListener('error', function () { enableContinue('Video unavailable. You can continue.'); });
    video.addEventListener('stalled', function () {
        setTimeout(function () { if (video.paused || video.readyState < 3) enableContinue(); }, 8000);
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && overlay.classList.contains('is-visible')) closeAd();
    });

    if (full) {
        full.addEventListener('click', function () {
            if (video.requestFullscreen) video.requestFullscreen().catch(function () {});
            else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
        });
    }

    // Clicking "Create account" opens the ad first (once per session).
    if (registerTab) {
        registerTab.addEventListener('click', function () {
            if (!passed()) openAd();
        });
    }

    var params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'register' || params.has('ref')) openAd();
})();
