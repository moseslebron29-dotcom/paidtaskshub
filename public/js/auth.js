<!DOCTYPE html><html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#0b1b34">
<title>Login or Register - PaidTasksHub</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/style.css"><style>
/* Advertisement overlay */
.ad-overlay {
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: #07101e;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 16px;
}

.ad-overlay.active {
    display: flex;
}

.ad-container {
    width: 100%;
    max-width: 440px;
    color: white;
    text-align: center;
}

.ad-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
}

.ad-brand {
    font-size: 19px;
    font-weight: 800;
}

.ad-label {
    font-size: 11px;
    color: #aab6c8;
    background: #18283e;
    padding: 6px 12px;
    border-radius: 20px;
}

.ad-video-box {
    width: 100%;
    background: #000;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid #26364d;
}

.ad-video {
    width: 100%;
    max-height: 68vh;
    display: block;
    object-fit: contain;
    background: #000;
}

.ad-heading {
    font-size: 20px;
    margin: 18px 0 8px;
}

.ad-description {
    color: #aab6c8;
    font-size: 13px;
    line-height: 1.6;
    margin-bottom: 20px;
}

.ad-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.ad-button {
    border: none;
    border-radius: 10px;
    padding: 14px;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    width: 100%;
}

.ad-exit {
    color: white;
    background: #26364d;
}

.ad-continue {
    background: #16a36a;
    color: white;
}

.ad-continue:disabled {
    opacity: .5;
    cursor: not-allowed;
}

.ad-note {
    color: #8291a6;
    font-size: 11px;
    margin-top: 14px;
}

.hidden {
    display: none !important;
}

@media (max-width: 480px) {
    .ad-overlay {
        padding: 12px;
    }

    .ad-video {
        max-height: 62vh;
    }
}
</style></head><body><!-- VIDEO ADVERTISEMENT --><div class="ad-overlay" id="adOverlay">
    <div class="ad-container">    <div class="ad-top">
        <div class="ad-brand">PaidTasksHub</div>
        <span class="ad-label">ADVERTISEMENT</span>
    </div>

    <div class="ad-video-box">
        <video
            class="ad-video"
            id="registrationAd"
            src="/media/71075.mp4"
            autoplay
            muted
            playsinline
            preload="auto">
        </video>
    </div>

    <h2 class="ad-heading">Sponsored Video</h2>

    <p class="ad-description">
        Watch this sponsored advertisement before continuing
        to PaidTasksHub registration.
    </p>

    <div class="ad-actions">

        <button
            type="button"
            class="ad-button ad-continue"
            id="continueButton"
            disabled>
            Please wait for the advert...
        </button>

        <button
            type="button"
            class="ad-button ad-exit"
            id="exitAdButton">
            ✕ Exit Ad
        </button>

    </div>

    <p class="ad-note">
        You can exit the advertisement at any time.
    </p>

</div>

</div><!-- AUTHENTICATION PAGE --><div class="auth-wrap" id="authPage"><aside class="auth-side">

    <a class="brand" href="/">
        <span class="brand-mark">P</span>
        <span>PaidTasks<b>Hub</b></span>
    </a>

    <div>
        <h2>Tasks, referrals and M-Pesa withdrawals.</h2>

        <p>
            Join PaidTasksHub, complete available tasks,
            earn rewards and manage your wallet.
        </p>
    </div>

    <p class="small" style="color:#64748b">
        © PaidTasksHub
    </p>

</aside>


<main class="auth-main">

    <div class="auth-card">

        <a class="brand auth-mobile-brand" href="/">
            <span class="brand-mark">P</span>
            <span>PaidTasks<b>Hub</b></span>
        </a>


        <!-- LOGIN AND REGISTER TABS -->
        <div class="tabs" id="tabs" role="tablist">

            <button
                type="button"
                id="loginTab"
                class="selected"
                role="tab">
                Log in
            </button>

            <button
                type="button"
                id="registerTab"
                role="tab">
                Create account
            </button>

        </div>


        <div
            id="authMessage"
            class="alert hidden"
            role="status"
            aria-live="polite">
        </div>


        <!-- LOGIN FORM -->
        <form id="loginForm" novalidate>

            <h2 style="font-size:22px">
                Welcome back
            </h2>

            <label class="field">
                <span>Email</span>
                <input
                    name="email"
                    type="email"
                    required
                    autocomplete="email"
                    inputmode="email">
            </label>

            <label class="field">
                <span>Password</span>
                <input
                    name="password"
                    type="password"
                    required
                    autocomplete="current-password">
            </label>

            <button
                class="btn btn-primary btn-block"
                type="submit">
                Log in
            </button>

            <p class="center small" style="margin:14px 0 0">
                Email not verified?
                <button
                    type="button"
                    class="link-btn"
                    id="loginResend">
                    Resend verification code
                </button>
            </p>

        </form>


        <!-- REGISTRATION FORM -->
        <form id="registerForm" class="hidden" novalidate>

            <h2 style="font-size:22px">
                Create your account
            </h2>

            <label class="field">
                <span>Full name</span>
                <input
                    name="fullName"
                    required
                    autocomplete="name">
            </label>

            <label class="field">
                <span>Username</span>
                <input
                    name="username"
                    required
                    autocomplete="username"
                    autocapitalize="none"
                    maxlength="30">

                <small class="hint">
                    3–30 letters, numbers, dot, dash or underscore.
                </small>
            </label>

            <label class="field">
                <span>Email</span>
                <input
                    name="email"
                    type="email"
                    required
                    autocomplete="email"
                    inputmode="email">

                <small class="hint">
                    We send a 6-digit verification code here.
                </small>
            </label>

            <label class="field">
                <span>M-Pesa phone number</span>
                <input
                    name="phone"
                    type="tel"
                    required
                    placeholder="07XXXXXXXX"
                    autocomplete="tel"
                    inputmode="tel">

                <small class="hint">
                    Withdrawals are paid to this number.
                </small>
            </label>

            <div class="row">

                <label class="field">
                    <span>Password</span>
                    <input
                        name="password"
                        type="password"
                        required
                        minlength="8"
                        autocomplete="new-password">
                </label>

                <label class="field">
                    <span>Confirm password</span>
                    <input
                        name="confirmPassword"
                        type="password"
                        required
                        minlength="8"
                        autocomplete="new-password">
                </label>

            </div>

            <label class="field">
                <span>
                    Referral code
                    <em class="muted" style="font-weight:400">
                        (optional)
                    </em>
                </span>

                <input
                    name="ref"
                    autocapitalize="characters"
                    maxlength="12">
            </label>

            <button
                class="btn btn-primary btn-block"
                type="submit">
                Create account
            </button>

            <p class="center small muted" style="margin:14px 0 0">
                Complete email verification and any required
                account activation steps.
            </p>

        </form>


        <!-- EMAIL VERIFICATION FORM -->
        <form id="otpForm" class="hidden" novalidate>

            <h2 style="font-size:22px">
                Verify your email
            </h2>

            <p class="muted">
                Enter the 6-digit code we sent to your email.
                It expires in 5 minutes.
            </p>

            <label class="field">
                <span>Email</span>
                <input
                    name="email"
                    type="email"
                    required
                    autocomplete="email"
                    inputmode="email">
            </label>

            <label class="field">
                <span>6-digit code</span>
                <input
                    class="otp-input"
                    name="otp"
                    inputmode="numeric"
                    pattern="[0-9]{6}"
                    maxlength="6"
                    required
                    autocomplete="one-time-code">
            </label>

            <button
                class="btn btn-primary btn-block"
                type="submit">
                Verify email
            </button>

            <p class="center small" style="margin:14px 0 0">
                <button
                    type="button"
                    class="link-btn"
                    id="otpResend">
                    Resend verification code
                </button>
            </p>

        </form>

    </div>

</main>

</div><!-- ADVERTISEMENT BEHAVIOUR --><script>
(function () {
    'use strict';

    const params = new URLSearchParams(window.location.search);

    const isRegistration =
        params.get('tab') === 'register' ||
        params.has('ref');

    const overlay = document.getElementById('adOverlay');
    const video = document.getElementById('registrationAd');
    const continueButton = document.getElementById('continueButton');
    const exitButton = document.getElementById('exitAdButton');

    if (!isRegistration) return;

    overlay.classList.add('active');

    function closeAdvertisement() {
        overlay.classList.remove('active');

        video.pause();

        try {
            sessionStorage.setItem('pth_registration_ad_seen', '1');
        } catch (error) {}
    }

    exitButton.addEventListener('click', closeAdvertisement);

    continueButton.addEventListener('click', closeAdvertisement);

    video.addEventListener('ended', function () {
        continueButton.disabled = false;
        continueButton.textContent = 'Continue to Registration';
    });

    video.addEventListener('error', function () {
        continueButton.disabled = false;
        continueButton.textContent = 'Continue to Registration';
    });

    video.addEventListener('loadedmetadata', function () {
        if (video.duration === 0) {
            continueButton.disabled = false;
            continueButton.textContent = 'Continue to Registration';
        }
    });

    const playPromise = video.play();

    if (playPromise !== undefined) {
        playPromise.catch(function () {
            continueButton.disabled = false;
            continueButton.textContent = 'Continue to Registration';
        });
    }

})();
</script><!-- EXISTING AUTHENTICATION JAVASCRIPT --><script src="/js/auth.js"></script></body>
</html>
