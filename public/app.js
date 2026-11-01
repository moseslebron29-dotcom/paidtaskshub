const $ = (selector) => document.querySelector(selector);

const auth = $('#auth');
const dashboard = $('#dashboard');
const message = $('#authMessage');

function showForm(which) {
    ['loginForm', 'registerForm', 'otpForm'].forEach(id => {
        const form = $('#' + id);
        if (form) form.classList.toggle('hidden', id !== which);
    });

    $('#loginTab')?.classList.toggle('selected', which === 'loginForm');
    $('#registerTab')?.classList.toggle('selected', which === 'registerForm');

    if (message) message.textContent = '';
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

// LOAD USER DASHBOARD
async function loadDashboard() {
    const response = await fetch('/api/me', {
        credentials: 'same-origin'
    });

    if (!response.ok) {
        throw new Error('Could not load your dashboard. Please log in again.');
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
            : 'Email verified — activation not yet completed');
}

// LOGIN
$('#loginForm').onsubmit = async (event) => {
    event.preventDefault();
    message.textContent = 'Signing in...';

    try {
        const data = Object.fromEntries(new FormData(event.target));

        await post('/api/login', data);

        await loadDashboard();

        message.textContent = '';

    } catch (error) {
        message.textContent = error.message;
    }
};

// REGISTER
$('#registerForm').onsubmit = async (event) => {
    event.preventDefault();
    message.textContent = 'Creating your account...';

    try {
        const data = Object.fromEntries(new FormData(event.target));

        await post('/api/register', data);

        $('#otpForm [name="email"]').value = data.email;

        showForm('otpForm');

        message.textContent =
            'A verification code has been sent to your email.';

    } catch (error) {
        message.textContent = error.message;
    }
};

// EMAIL VERIFICATION
$('#otpForm').onsubmit = async (event) => {
    event.preventDefault();

    message.textContent = 'Verifying your email...';

    try {
        const data = Object.fromEntries(new FormData(event.target));

        await post('/api/verify-email', data);

        message.textContent = 'Email verified! Opening your dashboard...';

        await loadDashboard();

        message.textContent = '';

    } catch (error) {
        message.textContent = error.message;
    }
};

// LOGOUT
$('#logout').onclick = async () => {
    try {
        await post('/api/logout', {});

        dashboard.classList.add('hidden');
        auth.classList.remove('hidden');

        showForm('loginForm');

        message.textContent = 'You have logged out successfully.';

    } catch (error) {
        message.textContent = error.message;
    }
};

// CHECK EXISTING LOGIN SESSION
(async function initialize() {
    try {
        await loadDashboard();
    } catch (error) {
        auth.classList.remove('hidden');
        dashboard.classList.add('hidden');
        showForm('loginForm');
    }
})();
