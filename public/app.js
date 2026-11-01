const $ = s => document.querySelector(s);

const auth = $('#auth');
const dashboard = $('#dashboard');
const message = $('#authMessage');

function showForm(which) {
    ['loginForm', 'registerForm', 'otpForm'].forEach(id => {
        $('#' + id).classList.toggle('hidden', id !== which);
    });

    $('#loginTab').classList.toggle('selected', which === 'loginForm');
    $('#registerTab').classList.toggle('selected', which === 'registerForm');

    message.textContent = '';
}

$('#loginTab').onclick = () => showForm('loginForm');
$('#registerTab').onclick = () => showForm('registerForm');

async function post(url, data) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'same-origin',
        body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.error || 'Something went wrong.');
    }

    return result;
}

async function loadDashboard() {
    const response = await fetch('/api/me', {
        credentials: 'same-origin'
    });

    if (!response.ok) {
        throw new Error('Please log in.');
    }

    const result = await response.json();

    auth.classList.add('hidden');
    dashboard.classList.remove('hidden');

    $('#welcome').textContent =
        'Hello, ' + result.user.fullName;

    $('#balance').textContent =
        'KSh ' + result.dashboard.displayedBalance.toLocaleString('en-KE');

    $('#completed').textContent =
        result.dashboard.completedTasks;

    $('#pending').textContent =
        result.dashboard.pendingTasks;

    $('#emailView').textContent =
        'Email: ' + result.user.email;

    $('#statusView').textContent =
        'Account status: ' +
        (result.user.active
            ? 'Active'
            : 'Email verified — activation not completed');
}

// OPEN OTP FORM
function openOtp(email) {
    $('#otpForm [name="email"]').value = email;
    showForm('otpForm');
    message.textContent = 'Enter the verification code sent to your email.';
}

// REGISTER
$('#registerForm').onsubmit = async e => {
    e.preventDefault();

    message.textContent = 'Creating account...';

    try {
        const data = Object.fromEntries(new FormData(e.target));

        await post('/api/register', data);

        openOtp(data.email);

    } catch (error) {
        message.textContent = error.message;
    }
};

// LOGIN
$('#loginForm').onsubmit = async e => {
    e.preventDefault();

    message.textContent = 'Signing in...';

    try {
        const data = Object.fromEntries(new FormData(e.target));

        await post('/api/login', data);

        await loadDashboard();

    } catch (error) {
        message.textContent = error.message;
    }
};

// VERIFY OTP
$('#otpForm').onsubmit = async e => {
    e.preventDefault();

    message.textContent = 'Verifying code...';

    try {
        const data = Object.fromEntries(new FormData(e.target));

        await post('/api/verify-email', data);

        message.textContent = 'Verified! Opening dashboard...';

        await loadDashboard();

    } catch (error) {
        message.textContent = error.message;
    }
};

// RESEND OTP BUTTON
const resendButton = document.createElement('button');

resendButton.type = 'button';
resendButton.textContent = 'Resend verification code';
resendButton.style.marginTop = '12px';

$('#otpForm').appendChild(resendButton);

resendButton.onclick = async () => {
    const email = $('#otpForm [name="email"]').value.trim();

    if (!email) {
        message.textContent = 'Enter your email address.';
        return;
    }

    resendButton.disabled = true;
    message.textContent = 'Sending a new code...';

    try {
        const result = await post('/api/resend-otp', { email });

        message.textContent = result.message;

    } catch (error) {
        message.textContent = error.message;

    } finally {
        setTimeout(() => {
            resendButton.disabled = false;
        }, 60000);
    }
};

// RESEND OTP FROM LOGIN
const loginResend = document.createElement('button');

loginResend.type = 'button';
loginResend.textContent = 'Resend verification code';
loginResend.style.marginTop = '12px';

$('#loginForm').appendChild(loginResend);

loginResend.onclick = async () => {
    const email = $('#loginForm [name="email"]').value.trim();

    if (!email) {
        message.textContent = 'Enter your registered email first.';
        return;
    }

    loginResend.disabled = true;
    message.textContent = 'Requesting verification code...';

    try {
        await post('/api/resend-otp', { email });

        openOtp(email);

    } catch (error) {
        message.textContent = error.message;

    } finally {
        setTimeout(() => {
            loginResend.disabled = false;
        }, 60000);
    }
};

// LOGOUT
$('#logout').onclick = async () => {
    try {
        await post('/api/logout', {});

        dashboard.classList.add('hidden');
        auth.classList.remove('hidden');

        showForm('loginForm');

    } catch (error) {
        message.textContent = error.message;
    }
};

// INITIAL PAGE LOAD
(async () => {
    try {
        await loadDashboard();
    } catch {
        auth.classList.remove('hidden');
        dashboard.classList.add('hidden');
        showForm('loginForm');
    }
})();
