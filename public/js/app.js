(function () {
    'use strict';

    var view = document.getElementById('view');
    var me = null;
    var tasksFilter = 'all';
    var adminTab = 'overview';
    var countdowns = {};

    // ---------- helpers ----------

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function kes(cents) {
        var n = (Number(cents) || 0) / 100;

        return 'KES ' + n.toLocaleString('en-KE', { maximumFractionDigits: 2 });
    }

    function when(value) {
        if (!value) return '';

        return new Date(value).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
    }

    async function api(url, method, body) {
        var options = { method: method || 'GET', credentials: 'same-origin', headers: {} };

        if (body !== undefined) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }

        var response = await fetch(url, options);
        var data = {};

        try { data = await response.json(); } catch (e) { /* ignore */ }

        if (response.status === 401) {
            location.href = '/auth';
            throw new Error('Please log in.');
        }

        if (!response.ok) throw new Error(data.error || 'Something went wrong.');

        return data;
    }

    var toastTimer;

    function toast(text, isError) {
        var el = document.getElementById('toast');

        el.textContent = text;
        el.className = 'toast show' + (isError ? ' error' : '');

        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.className = 'toast'; }, 4200);
    }

    function loading() {
        view.innerHTML = '<div class="spinner" role="status" aria-label="Loading"></div>';
    }

    function failure(error) {
        view.innerHTML = '<div class="card"><div class="alert alert-error">' + esc(error.message) +
            '</div><button class="btn btn-outline" data-action="reload">Try again</button></div>';
    }

    function header(title, sub) {
        return '<h2 class="view-title">' + esc(title) + '</h2><p class="view-sub">' + esc(sub || '') + '</p>';
    }

    function empty(icon, text) {
        return '<div class="empty"><span class="big">' + icon + '</span>' + esc(text) + '</div>';
    }

    var TYPE_LABELS = {
        task_reward: 'Task reward',
        math_reward: 'Maths reward',
        referral_reward: 'Referral reward',
        withdrawal_hold: 'Withdrawal requested',
        withdrawal_reversal: 'Withdrawal returned',
        admin_adjustment: 'Adjustment'
    };

    var STATUS_LABELS = {
        pending: 'Awaiting review',
        approved: 'Approved – awaiting payment',
        processing: 'Processing',
        paid: 'Paid',
        rejected: 'Rejected',
        failed: 'Failed'
    };

    function statusBadge(status) {
        return '<span class="badge ' + esc(status) + '">' + esc(STATUS_LABELS[status] || status) + '</span>';
    }

    // ---------- navigation ----------

    var NAV = [
        { id: 'dashboard', hash: '#/', icon: '🏠', label: 'Home' },
        { id: 'tasks', hash: '#/tasks', icon: '✅', label: 'Tasks' },
        { id: 'referrals', hash: '#/referrals', icon: '🤝', label: 'Refer' },
        { id: 'wallet', hash: '#/wallet', icon: '👛', label: 'Wallet' },
        { id: 'account', hash: '#/account', icon: '👤', label: 'Account' }
    ];

    function navItems() {
        var items = NAV.slice();

        if (me && me.user.isAdmin) {
            items.push({ id: 'admin', hash: '#/admin', icon: '🛠️', label: 'Admin' });
        }

        return items;
    }

    function renderNav(active) {
        var items = navItems();

        function link(n) {
            return '<a href="' + n.hash + '" class="' + (n.id === active ? 'active' : '') + '"' +
                (n.id === active ? ' aria-current="page"' : '') + '><span class="ico">' + n.icon +
                '</span><span>' + n.label + '</span></a>';
        }

        document.getElementById('sideNav').innerHTML = items.map(link).join('');
        document.getElementById('bottomNav').innerHTML = items.map(link).join('');
    }

    function currentRoute() {
        var h = location.hash.replace(/^#\/?/, '');
        var name = h.split('?')[0];

        if (name === 'maths') return 'maths';

        return NAV.concat([{ id: 'admin' }]).some(function (n) { return n.id === name; })
            ? name : 'dashboard';
    }

    async function refreshMe() {
        me = await api('/api/me');

        document.getElementById('topBalance').textContent = kes(me.wallet.balance);
        document.getElementById('avatar').textContent = (me.user.fullName || '?').charAt(0).toUpperCase();
        document.getElementById('sideUser').textContent = me.user.username;
    }

    async function route() {
        var name = currentRoute();

        Object.keys(countdowns).forEach(function (k) { clearInterval(countdowns[k]); });
        countdowns = {};

        var navId = name === 'maths' ? 'tasks' : name;

        renderNav(navId);
        document.getElementById('pageTitle').textContent =
            { dashboard: 'Dashboard', tasks: 'Tasks', maths: 'Tasks', referrals: 'Referrals', wallet: 'Wallet', account: 'Account', admin: 'Admin' }[name];

        loading();
        window.scrollTo(0, 0);

        try {
            if (!me) await refreshMe();

            if (name === 'dashboard') await viewDashboard();
            else if (name === 'tasks') { tasksFilter = 'all'; await viewTasks(); }
            else if (name === 'maths') { tasksFilter = 'maths'; await viewTasks(); }
            else if (name === 'referrals') await viewReferrals();
            else if (name === 'wallet') await viewWallet();
            else if (name === 'account') viewAccount();
            else if (name === 'admin') await viewAdmin();
        } catch (error) {
            failure(error);
        }
    }

    // ---------- dashboard ----------

    async function viewDashboard() {
        await refreshMe();

        var cfg = await api('/api/config');
        var w = me.wallet;
        var s = me.stats;

        var html = header('Hello, ' + me.user.fullName.split(' ')[0], 'Here is your account at a glance.');

        if (cfg.announcement) {
            html += '<div class="alert alert-info">' + esc(cfg.announcement) + '</div>';
        }

        html += '<section class="card balance-card"><div class="label">Wallet balance</div>' +
            '<div class="amount">' + kes(w.balance) + '</div>' +
            '<div class="balance-actions"><a class="btn btn-gold btn-sm" href="#/wallet">Withdraw</a>' +
            '<a class="btn btn-ghost-light btn-sm" href="#/tasks">Find tasks</a></div>' +
            (w.pendingWithdrawals > 0
                ? '<p class="sub" style="margin:14px 0 0;position:relative;z-index:1">' + kes(w.pendingWithdrawals) + ' is in a withdrawal that is not paid yet.</p>'
                : '') +
            '</section>';

        html += '<div class="stats">' +
            '<div class="stat"><span>Tasks completed</span><strong>' + s.completedTasks + '</strong></div>' +
            '<div class="stat"><span>Friends referred</span><strong>' + s.referrals + '</strong></div>' +
            '<div class="stat"><span>Open withdrawals</span><strong>' + s.openWithdrawals + '</strong></div></div>';

        html += '<section class="card"><div class="card-head"><h3>Start earning</h3></div>' +
            '<div class="task-list">' +
            quickLink('#/maths', '🧮', 'Maths questions', 'Answer a short question') +
            quickLink('#/tasks', '▶️', 'Video &amp; ad tasks', 'See what is available now') +
            quickLink('#/referrals', '🤝', 'Invite friends', 'Share your referral link') +
            '</div></section>';

        if (cfg.supportEmail || cfg.supportPhone) {
            html += '<section class="card"><h3>Support</h3><p class="muted" style="margin:0">' +
                (cfg.supportEmail ? 'Email: ' + esc(cfg.supportEmail) + '<br>' : '') +
                (cfg.supportPhone ? 'Phone: ' + esc(cfg.supportPhone) : '') + '</p></section>';
        }

        view.innerHTML = html;
    }

    function quickLink(hash, icon, title, text) {
        return '<a class="task" href="' + hash + '" style="text-decoration:none;color:inherit">' +
            '<div class="t-icon">' + icon + '</div><div class="t-body"><h4>' + title + '</h4><p>' + text +
            '</p></div><div class="t-side"><span class="reward">›</span></div></a>';
    }

    // ---------- tasks ----------

    function taskIcon(t) {
        if (t.type === 'video') return t.platform === 'tiktok' ? '🎵' : '▶️';
        if (t.type === 'ad') return '📢';
        return '⭐';
    }

    async function viewTasks() {
        var data = await api('/api/tasks');
        var list = data.tasks;

        var html = header('Available tasks', 'Finish a task to earn its listed reward. Each task can be completed once.');

        html += '<div class="filters" role="tablist">' +
            [['all', 'All'], ['maths', 'Maths'], ['video', 'Videos'], ['ad', 'Ads']].map(function (f) {
                return '<button data-action="filter" data-value="' + f[0] + '" class="' + (tasksFilter === f[0] ? 'selected' : '') + '">' + f[1] + '</button>';
            }).join('') + '</div>';

        html += '<div class="alert alert-info small">Today: ' + data.limits.rewardedToday + ' of ' +
            data.limits.dailyTaskLimit + ' rewarded tasks used.</div>';

        if (tasksFilter === 'maths' || tasksFilter === 'all') {
            html += '<div id="mathSlot"></div>';
        }

        var shown = list.filter(function (t) {
            if (tasksFilter === 'maths') return false;
            if (tasksFilter === 'all') return true;

            return t.type === tasksFilter;
        });

        if (tasksFilter !== 'maths') {
            html += '<section class="card"><div class="card-head"><h3>' +
                (tasksFilter === 'video' ? 'Video tasks' : tasksFilter === 'ad' ? 'Advertisement tasks' : 'Tasks') +
                '</h3></div>';

            if (!shown.length) {
                html += empty('🗂️', 'No tasks are available right now. New tasks are added by PaidTasksHub – check back later.');
            } else {
                html += '<div class="task-list">' + shown.map(taskRow).join('') + '</div>';
            }

            html += '</section>';
        }

        view.innerHTML = html;

        if (document.getElementById('mathSlot')) await loadMath();
    }

    function taskRow(t) {
        var reward = t.reward > 0
            ? '<span class="reward">' + kes(t.reward) + '</span>'
            : '<span class="reward none">No reward set</span>';

        var action;

        if (t.completed) {
            action = '<span class="badge done">Completed</span>';
        } else if (t.started) {
            action = '<a class="btn btn-outline btn-sm" href="' + esc(t.url) + '" target="_blank" rel="noopener noreferrer">Open link</a>' +
                '<button class="btn btn-primary btn-sm" data-action="claim" data-id="' + t.id + '">Claim reward</button>';
        } else {
            action = '<a class="btn btn-primary btn-sm" href="' + esc(t.url) + '" target="_blank" rel="noopener noreferrer" ' +
                'data-action="start" data-id="' + t.id + '" data-seconds="' + t.minSeconds + '">Start</a>';
        }

        return '<article class="task" id="task-' + t.id + '"><div class="t-icon">' + taskIcon(t) + '</div>' +
            '<div class="t-body"><h4>' + esc(t.title) + '</h4><p>' + esc(t.description || '') +
            (t.description ? ' · ' : '') + 'Minimum ' + t.minSeconds + 's</p></div>' +
            '<div class="t-side">' + reward + '<div class="actions" id="act-' + t.id + '">' + action + '</div></div></article>';
    }

    function startCountdown(id, seconds) {
        var box = document.getElementById('act-' + id);

        if (!box) return;

        var left = seconds;

        function paint() {
            if (left > 0) {
                box.innerHTML = '<button class="btn btn-outline btn-sm" disabled>Finish in ' + left + 's</button>';
            } else {
                box.innerHTML = '<button class="btn btn-primary btn-sm" data-action="claim" data-id="' + id + '">Claim reward</button>';
                clearInterval(countdowns[id]);
            }
        }

        paint();

        countdowns[id] = setInterval(function () { left -= 1; paint(); }, 1000);
    }

    // ---------- maths ----------

    async function loadMath() {
        var slot = document.getElementById('mathSlot');

        if (!slot) return;

        try {
            var q = await api('/api/math/next');
            var html = '<section class="card"><div class="card-head"><h3>🧮 Maths question</h3>' +
                (q.reward > 0 ? '<span class="reward">' + kes(q.reward) + ' per correct answer</span>' : '<span class="reward none">No reward set yet</span>') +
                '</div>';

            if (!q.available) {
                html += empty('✅', q.message);
            } else {
                html += '<div class="math-box"><div class="math-q">' + esc(q.question) + ' = ?</div>' +
                    '<form class="math-form" id="mathForm" data-id="' + esc(q.id) + '" novalidate>' +
                    '<input name="answer" type="number" inputmode="numeric" step="1" required placeholder="Your answer" autocomplete="off">' +
                    '<button class="btn btn-primary" type="submit">Submit answer</button></form></div>';
            }

            slot.innerHTML = html + '</section>';
        } catch (error) {
            slot.innerHTML = '<div class="alert alert-error">' + esc(error.message) + '</div>';
        }
    }

    // ---------- referrals ----------

    async function viewReferrals() {
        var data = await api('/api/referrals');
        var link = location.origin + '/auth?ref=' + data.code;

        var html = header('Referrals', data.reward > 0
            ? 'Earn ' + kes(data.reward) + ' when a friend you invite earns their first task reward.'
            : 'Invite friends with your personal link. A referral reward has not been set yet.');

        html += '<section class="card"><h3>Your referral link</h3>' +
            '<div class="copy-row"><input readonly id="refLink" value="' + esc(link) + '" aria-label="Referral link">' +
            '<button class="btn btn-primary" data-action="copy">Copy</button></div>' +
            '<p class="hint" style="margin-top:10px">Your code: <strong>' + esc(data.code) + '</strong></p>';

        if (navigator.share) {
            html += '<button class="btn btn-outline btn-block" style="margin-top:10px" data-action="share">Share…</button>';
        }

        html += '</section>';

        html += '<div class="stats"><div class="stat"><span>Friends joined</span><strong>' + data.referrals.length + '</strong></div>' +
            '<div class="stat"><span>Rewards earned</span><strong>' + kes(data.totalEarned) + '</strong></div>' +
            '<div class="stat"><span>Reward per friend</span><strong>' + (data.reward > 0 ? kes(data.reward) : '—') + '</strong></div></div>';

        html += '<section class="card"><div class="card-head"><h3>Your referrals</h3></div>';

        if (!data.referrals.length) {
            html += empty('👥', 'No one has joined with your link yet.');
        } else {
            html += '<div class="table-wrap"><table><thead><tr><th>Member</th><th>Joined</th><th>Reward</th></tr></thead><tbody>' +
                data.referrals.map(function (r) {
                    return '<tr><td>' + esc(r.username) + '</td><td>' + when(r.joined) + '</td><td>' +
                        (r.rewarded ? '<span class="badge done">Paid</span>' : '<span class="badge">Waiting for first task</span>') + '</td></tr>';
                }).join('') + '</tbody></table></div>';
        }

        view.innerHTML = html + '</section>';
        view.dataset.refLink = link;
    }

    // ---------- wallet ----------

    async function viewWallet() {
        var results = await Promise.all([api('/api/wallet'), api('/api/withdrawals'), api('/api/transactions')]);
        var w = results[0], wds = results[1].withdrawals, tx = results[2].transactions;

        me.wallet.balance = w.balance;
        document.getElementById('topBalance').textContent = kes(w.balance);

        var html = header('Wallet', 'Your balance is the total of all verified entries below.');

        html += '<section class="card balance-card"><div class="label">Available balance</div><div class="amount">' + kes(w.balance) +
            '</div><p class="sub" style="margin:0;position:relative;z-index:1">' +
            (w.pendingWithdrawals > 0 ? kes(w.pendingWithdrawals) + ' is in a withdrawal that is not paid yet. ' : '') +
            'Minimum withdrawal: ' + kes(w.minWithdrawal) + '.</p></section>';

        html += '<section class="card"><h3>Withdraw to M-Pesa</h3>';

        if (!w.withdrawalsEnabled) {
            html += '<div class="alert alert-warn">Withdrawals are temporarily unavailable.</div>';
        } else if (!w.payoutNumber) {
            html += '<div class="alert alert-warn">Your M-Pesa number looks invalid. <a href="#/account">Update it in Account</a>.</div>';
        } else {
            html += '<p class="muted">Payout number: <strong>' + esc(w.payoutNumber.slice(0, 5) + '****' + w.payoutNumber.slice(-2)) + '</strong>. ' +
                'Requests are reviewed first. A withdrawal is shown as paid only after M-Pesa confirms it.</p>' +
                '<form id="withdrawForm" novalidate><label class="field"><span>Amount (KES)</span>' +
                '<input name="amount" type="number" inputmode="numeric" min="1" step="1" required placeholder="e.g. 500"></label>' +
                '<button class="btn btn-primary" type="submit">Request withdrawal</button></form>';
        }

        html += '</section>';

        html += '<section class="card"><div class="card-head"><h3>Withdrawal history</h3></div>';

        if (!wds.length) {
            html += empty('💸', 'You have not requested any withdrawals.');
        } else {
            html += '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>M-Pesa receipt</th></tr></thead><tbody>' +
                wds.map(function (x) {
                    return '<tr><td>' + when(x.createdAt) + '</td><td class="amt">' + kes(x.amount) + '</td><td>' + statusBadge(x.status) +
                        (x.reason ? '<div class="small muted">' + esc(x.reason) + '</div>' : '') + '</td><td>' + esc(x.receipt || '—') + '</td></tr>';
                }).join('') + '</tbody></table></div>';
        }

        html += '</section><section class="card"><div class="card-head"><h3>Transaction history</h3></div>';

        if (!tx.length) {
            html += empty('🧾', 'No transactions yet. Completed tasks and withdrawals will appear here.');
        } else {
            html += '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Details</th><th>Amount</th></tr></thead><tbody>' +
                tx.map(function (x) {
                    return '<tr><td>' + when(x.createdAt) + '</td><td>' + esc(TYPE_LABELS[x.type] || x.type) +
                        (x.type === 'admin_adjustment' && x.note ? '<div class="small muted">' + esc(x.note) + '</div>' : '') +
                        '</td><td class="amt ' + (x.amount >= 0 ? 'pos' : 'neg') + '">' + (x.amount >= 0 ? '+' : '−') + kes(Math.abs(x.amount)) + '</td></tr>';
                }).join('') + '</tbody></table></div>';
        }

        view.innerHTML = html + '</section>';
    }

    // ---------- account ----------

    function viewAccount() {
        var u = me.user;

        view.innerHTML = header('Account', 'Manage your details and security.') +
            '<section class="card"><h3>Profile</h3><form id="profileForm" novalidate>' +
            '<label class="field"><span>Full name</span><input name="fullName" required value="' + esc(u.fullName) + '"></label>' +
            '<label class="field"><span>M-Pesa phone number</span><input name="phone" type="tel" inputmode="tel" required value="' + esc(u.phone) + '">' +
            '<small class="hint">Withdrawals are paid to this number. It cannot be changed while a withdrawal is in progress.</small></label>' +
            '<label class="field"><span>Username</span><input value="' + esc(u.username) + '" disabled></label>' +
            '<label class="field"><span>Email</span><input value="' + esc(u.email) + '" disabled></label>' +
            '<button class="btn btn-primary" type="submit">Save changes</button></form></section>' +
            '<section class="card"><h3>Change password</h3><form id="passwordForm" novalidate>' +
            '<label class="field"><span>Current password</span><input name="currentPassword" type="password" required autocomplete="current-password"></label>' +
            '<label class="field"><span>New password</span><input name="newPassword" type="password" required minlength="8" autocomplete="new-password"></label>' +
            '<button class="btn btn-primary" type="submit">Change password</button></form></section>' +
            '<section class="card"><h3>Session</h3><p class="muted">Member since ' + when(u.createdAt) + '.</p>' +
            '<button class="btn btn-danger" data-action="logout">Log out</button></section>';
    }

    // ---------- admin ----------

    var ADMIN_TABS = [
        ['overview', 'Overview'], ['withdrawals', 'Withdrawals'], ['tasks', 'Tasks'],
        ['members', 'Members'], ['settings', 'Settings'], ['log', 'Log']
    ];

    async function viewAdmin() {
        if (!me.user.isAdmin) {
            view.innerHTML = '<div class="card"><div class="alert alert-error">Admin access required.</div></div>';
            return;
        }

        var shell = header('Admin', 'Manage members, tasks and withdrawals.') +
            '<div class="sub-tabs">' + ADMIN_TABS.map(function (t) {
                return '<button data-action="admintab" data-value="' + t[0] + '" class="' + (adminTab === t[0] ? 'selected' : '') + '">' + t[1] + '</button>';
            }).join('') + '</div><div id="adminBody"><div class="spinner"></div></div>';

        view.innerHTML = shell;

        var body = document.getElementById('adminBody');

        try {
            if (adminTab === 'overview') await adminOverview(body);
            else if (adminTab === 'withdrawals') await adminWithdrawals(body);
            else if (adminTab === 'tasks') await adminTasks(body);
            else if (adminTab === 'members') await adminMembers(body, '');
            else if (adminTab === 'settings') await adminSettings(body);
            else await adminLog(body);
        } catch (error) {
            body.innerHTML = '<div class="alert alert-error">' + esc(error.message) + '</div>';
        }
    }

    async function adminOverview(body) {
        var o = await api('/api/admin/overview');

        body.innerHTML = '<div class="stats">' +
            '<div class="stat"><span>Members</span><strong>' + o.users.total + '</strong></div>' +
            '<div class="stat"><span>Verified</span><strong>' + o.users.verified + '</strong></div>' +
            '<div class="stat"><span>Tasks completed</span><strong>' + o.completedTasks + '</strong></div>' +
            '<div class="stat"><span>Open withdrawals</span><strong>' + o.openWithdrawals.n + '</strong></div>' +
            '<div class="stat"><span>Open withdrawal value</span><strong>' + kes(o.openWithdrawals.total) + '</strong></div>' +
            '<div class="stat"><span>Owed to members (all wallets)</span><strong>' + kes(o.walletLiability) + '</strong></div></div>' +
            '<div class="card"><h3>M-Pesa payouts</h3>' +
            (o.mpesaConfigured
                ? '<div class="alert alert-ok">Connected (' + esc(o.mpesaEnv) + '). Approved withdrawals are sent to M-Pesa and shown as paid only after Safaricom confirms.</div>'
                : '<div class="alert alert-warn">Automatic M-Pesa payouts are not configured. Approved withdrawals must be paid manually, then confirmed here with the M-Pesa receipt code.</div>') +
            '</div>';
    }

    async function adminWithdrawals(body) {
        var data = await api('/api/admin/withdrawals?status=open');
        var all = await api('/api/admin/withdrawals?status=all');

        function table(list, actions) {
            if (!list.length) return empty('📭', 'Nothing here.');

            return '<div class="table-wrap"><table><thead><tr><th>#</th><th>Member</th><th>Amount</th><th>Number</th><th>Status</th><th>Info</th>' +
                (actions ? '<th>Actions</th>' : '') + '</tr></thead><tbody>' + list.map(function (w) {
                    var act = '';

                    if (actions) {
                        if (w.status === 'pending') {
                            act = '<button class="btn btn-primary btn-sm" data-action="wd-approve" data-id="' + w.id + '">Approve</button> ' +
                                '<button class="btn btn-danger btn-sm" data-action="wd-reject" data-id="' + w.id + '">Reject</button>';
                        } else if (w.status === 'approved') {
                            act = '<button class="btn btn-primary btn-sm" data-action="wd-paid" data-id="' + w.id + '">Mark paid</button> ' +
                                '<button class="btn btn-danger btn-sm" data-action="wd-reject" data-id="' + w.id + '">Reject</button>';
                        } else if (w.status === 'processing') {
                            act = '<button class="btn btn-outline btn-sm" data-action="wd-paid" data-id="' + w.id + '">Confirm paid</button> ' +
                                '<button class="btn btn-danger btn-sm" data-action="wd-failed" data-id="' + w.id + '">Mark failed</button>';
                        }
                    }

                    return '<tr><td>' + w.id + '</td><td>' + esc(w.username) + '<div class="small muted">' + esc(w.email) + '</div></td>' +
                        '<td class="amt">' + kes(w.amount) + '</td><td class="nowrap">' + esc(w.phone) + '</td><td>' + statusBadge(w.status) +
                        (w.failure_reason ? '<div class="small muted">' + esc(w.failure_reason) + '</div>' : '') + '</td>' +
                        '<td class="small">Balance ' + kes(w.balance) + '<br>' + w.tasks_done + ' tasks done<br>' + when(w.created_at) +
                        (w.mpesa_receipt ? '<br>Receipt ' + esc(w.mpesa_receipt) : '') + '</td>' +
                        (actions ? '<td><div class="actions">' + act + '</div></td>' : '') + '</tr>';
                }).join('') + '</tbody></table></div>';
        }

        body.innerHTML = '<section class="card"><div class="card-head"><h3>Needs action</h3></div>' + table(data.withdrawals, true) + '</section>' +
            '<section class="card"><div class="card-head"><h3>Recent (all)</h3></div>' + table(all.withdrawals, false) + '</section>';
    }

    async function adminTasks(body) {
        var data = await api('/api/admin/tasks');

        var form = '<section class="card"><h3>Add a task</h3><form id="taskForm" novalidate>' +
            '<div class="row"><label class="field"><span>Type</span><select name="type"><option value="video">Video</option><option value="ad">Advertisement</option><option value="other">Other</option></select></label>' +
            '<label class="field"><span>Platform</span><select name="platform"><option value="youtube">YouTube</option><option value="tiktok">TikTok</option><option value="other">Other</option></select></label></div>' +
            '<label class="field"><span>Title</span><input name="title" required maxlength="120"></label>' +
            '<label class="field"><span>Description (optional)</span><input name="description" maxlength="500"></label>' +
            '<label class="field"><span>Link (https://…)</span><input name="url" type="url" required placeholder="https://"></label>' +
            '<div class="row"><label class="field"><span>Reward (KES)</span><input name="rewardKes" type="number" step="0.5" min="0" value="0" required></label>' +
            '<label class="field"><span>Minimum seconds</span><input name="minSeconds" type="number" min="10" max="600" value="15" required></label></div>' +
            '<label class="field"><span>Maximum completions (optional)</span><input name="maxCompletions" type="number" min="1"></label>' +
            '<button class="btn btn-primary" type="submit">Create task</button></form></section>';

        var list = '<section class="card"><div class="card-head"><h3>All tasks</h3></div>';

        if (!data.tasks.length) {
            list += empty('🗂️', 'No tasks yet.');
        } else {
            list += '<div class="table-wrap"><table><thead><tr><th>Title</th><th>Type</th><th>Reward</th><th>Done</th><th>Status</th><th></th></tr></thead><tbody>' +
                data.tasks.map(function (t) {
                    return '<tr><td>' + esc(t.title) + '</td><td>' + esc(t.type) + '</td><td class="amt">' + kes(t.reward) + '</td><td>' +
                        t.completions + (t.max_completions ? ' / ' + t.max_completions : '') + '</td><td>' +
                        (t.active ? '<span class="badge done">Active</span>' : '<span class="badge">Off</span>') + '</td><td>' +
                        '<button class="btn btn-outline btn-sm" data-action="task-toggle" data-id="' + t.id + '" data-active="' + (t.active ? '0' : '1') + '">' +
                        (t.active ? 'Turn off' : 'Turn on') + '</button></td></tr>';
                }).join('') + '</tbody></table></div>';
        }

        body.innerHTML = form + list + '</section>';
    }

    async function adminMembers(body, q) {
        var data = await api('/api/admin/users?q=' + encodeURIComponent(q));

        var html = '<section class="card"><form id="memberSearch" class="copy-row" novalidate>' +
            '<input name="q" placeholder="Search name, username, email or phone" value="' + esc(q) + '"><button class="btn btn-primary" type="submit">Search</button></form></section>' +
            '<section class="card"><div class="table-wrap"><table><thead><tr><th>Member</th><th>Phone</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody>' +
            data.users.map(function (u) {
                return '<tr><td>' + esc(u.username) + (u.is_admin ? ' <span class="badge">admin</span>' : '') + '<div class="small muted">' + esc(u.email) +
                    (u.verified ? '' : ' · unverified') + '</div></td><td class="nowrap">' + esc(u.phone) + '</td><td class="amt">' + kes(u.balance) + '</td><td>' +
                    (u.status === 'active' ? '<span class="badge done">Active</span>' : '<span class="badge failed">Suspended</span>') + '</td><td><div class="actions">' +
                    '<button class="btn btn-outline btn-sm" data-action="user-adjust" data-id="' + esc(u.id) + '">Adjust</button>' +
                    '<button class="btn btn-outline btn-sm" data-action="user-status" data-id="' + esc(u.id) + '" data-status="' + (u.status === 'active' ? 'suspended' : 'active') + '">' +
                    (u.status === 'active' ? 'Suspend' : 'Restore') + '</button></div></td></tr>';
            }).join('') + '</tbody></table></div>' +
            (data.users.length ? '' : empty('🔍', 'No members found.')) + '</section>';

        body.innerHTML = html;
    }

    var SETTING_FIELDS = [
        ['min_withdrawal_kes', 'Minimum withdrawal (KES)', 'number'],
        ['max_withdrawal_per_day_kes', 'Maximum withdrawn per member per day (KES)', 'number'],
        ['withdraw_min_account_age_hours', 'Hours before a new account can withdraw', 'number'],
        ['withdrawals_enabled', 'Withdrawals enabled', 'bool'],
        ['registration_open', 'Registration open', 'bool'],
        ['math_reward_kes', 'Reward per correct maths answer (KES)', 'number'],
        ['math_daily_limit', 'Maths questions per member per day', 'number'],
        ['daily_task_limit', 'Rewarded tasks per member per day', 'number'],
        ['referral_reward_kes', 'Referral reward (KES)', 'number'],
        ['support_email', 'Support email', 'text'],
        ['support_phone', 'Support phone', 'text'],
        ['announcement', 'Dashboard announcement', 'text']
    ];

    async function adminSettings(body) {
        var data = await api('/api/admin/settings');
        var s = data.settings;

        body.innerHTML = '<section class="card"><h3>Settings</h3><div class="alert alert-info small">Rewards are paid from your own funds. Set them to amounts you can afford to pay out.</div>' +
            '<form id="settingsForm" novalidate>' + SETTING_FIELDS.map(function (f) {
                var input;

                if (f[2] === 'bool') {
                    input = '<select name="' + f[0] + '"><option value="true"' + (s[f[0]] ? ' selected' : '') + '>Yes</option><option value="false"' + (!s[f[0]] ? ' selected' : '') + '>No</option></select>';
                } else {
                    input = '<input name="' + f[0] + '" type="' + (f[2] === 'number' ? 'number' : 'text') + '"' + (f[2] === 'number' ? ' step="0.5" min="0"' : ' maxlength="300"') + ' value="' + esc(s[f[0]]) + '">';
                }

                return '<label class="field"><span>' + f[1] + '</span>' + input + '</label>';
            }).join('') + '<button class="btn btn-primary" type="submit">Save settings</button></form></section>';
    }

    async function adminLog(body) {
        var data = await api('/api/admin/audit');

        body.innerHTML = '<section class="card"><div class="card-head"><h3>Recent admin and payment activity</h3></div>' +
            (data.entries.length
                ? '<div class="table-wrap"><table><thead><tr><th>Time</th><th>By</th><th>Action</th><th>Detail</th></tr></thead><tbody>' +
                data.entries.map(function (e) {
                    return '<tr><td class="nowrap">' + when(e.created_at) + '</td><td>' + esc(e.actor || '') + '</td><td>' + esc(e.action) + '</td><td class="small">' + esc(e.detail || '') + '</td></tr>';
                }).join('') + '</tbody></table></div>'
                : empty('📜', 'No activity yet.')) + '</section>';
    }

    // ---------- events ----------

    async function run(button, fn) {
        if (button) button.disabled = true;

        try {
            await fn();
        } catch (error) {
            toast(error.message, true);
        }

        if (button) button.disabled = false;
    }

    document.addEventListener('click', function (e) {
        var el = e.target.closest('[data-action]');

        if (!el) return;

        var action = el.dataset.action;
        var id = el.dataset.id;

        if (action === 'reload') { route(); return; }

        if (action === 'filter') {
            tasksFilter = el.dataset.value;
            viewTasks().catch(failure);
            return;
        }

        if (action === 'start') {
            // The link opens normally; this only records the start time.
            api('/api/tasks/' + id + '/start', 'POST', {}).catch(function (error) {
                toast(error.message, true);
            });

            startCountdown(id, parseInt(el.dataset.seconds, 10) || 15);
            return;
        }

        if (action === 'claim') {
            run(el, async function () {
                var r = await api('/api/tasks/' + id + '/complete', 'POST', {});

                toast(r.message);
                await refreshMe();
                await viewTasks();
            });
            return;
        }

        if (action === 'copy') {
            var input = document.getElementById('refLink');

            input.select();

            if (navigator.clipboard) {
                navigator.clipboard.writeText(input.value).then(function () { toast('Link copied.'); },
                    function () { toast('Press and hold the link to copy it.', true); });
            } else {
                document.execCommand('copy');
                toast('Link copied.');
            }
            return;
        }

        if (action === 'share') {
            navigator.share({ title: 'Join PaidTasksHub', text: 'Join me on PaidTasksHub.', url: view.dataset.refLink }).catch(function () { /* cancelled */ });
            return;
        }

        if (action === 'logout') {
            run(el, async function () {
                await api('/api/logout', 'POST', {});
                location.href = '/';
            });
            return;
        }

        if (action === 'admintab') {
            adminTab = el.dataset.value;
            viewAdmin().catch(failure);
            return;
        }

        if (action === 'wd-approve') {
            if (!confirm('Approve this withdrawal?')) return;

            run(el, async function () {
                var r = await api('/api/admin/withdrawals/' + id + '/approve', 'POST', {});

                toast(r.message);
                await viewAdmin();
            }).then(function () { viewAdmin().catch(function () {}); });
            return;
        }

        if (action === 'wd-paid') {
            var receipt = prompt('Enter the M-Pesa receipt code (from the confirmation SMS):');

            if (!receipt) return;

            run(el, async function () {
                var r = await api('/api/admin/withdrawals/' + id + '/mark-paid', 'POST', { receipt: receipt });

                toast(r.message);
                await viewAdmin();
            });
            return;
        }

        if (action === 'wd-reject' || action === 'wd-failed') {
            var reason = prompt(action === 'wd-reject' ? 'Reason for rejecting (shown to the member):' : 'Reason (confirmed failed in the M-Pesa portal):');

            if (!reason) return;

            run(el, async function () {
                var r = await api('/api/admin/withdrawals/' + id + (action === 'wd-reject' ? '/reject' : '/mark-failed'), 'POST', { reason: reason });

                toast(r.message);
                await viewAdmin();
            });
            return;
        }

        if (action === 'task-toggle') {
            run(el, async function () {
                await api('/api/admin/tasks/' + id + '/active', 'POST', { active: el.dataset.active === '1' });
                await viewAdmin();
            });
            return;
        }

        if (action === 'user-status') {
            if (!confirm('Change this member\'s status?')) return;

            run(el, async function () {
                await api('/api/admin/users/' + id + '/status', 'POST', { status: el.dataset.status });
                await viewAdmin();
            });
            return;
        }

        if (action === 'user-adjust') {
            var amount = prompt('Amount in KES to add (use a minus sign to deduct):');

            if (!amount) return;

            var note = prompt('Reason for this adjustment (required, kept in the log):');

            if (!note) return;

            run(el, async function () {
                var r = await api('/api/admin/users/' + id + '/adjust', 'POST', { amount: Number(amount), note: note });

                toast(r.message);
                await viewAdmin();
            });
        }
    });

    document.addEventListener('submit', function (e) {
        e.preventDefault();

        var form = e.target;
        var button = form.querySelector('button[type="submit"]');

        function data() {
            var d = {};

            new FormData(form).forEach(function (v, k) { d[k] = typeof v === 'string' ? v.trim() : v; });

            return d;
        }

        if (form.id === 'mathForm') {
            run(button, async function () {
                var r = await api('/api/math/answer', 'POST', { id: form.dataset.id, answer: data().answer });

                toast(r.message, !r.correct);
                await refreshMe();
                await loadMath();
            });
        } else if (form.id === 'withdrawForm') {
            run(button, async function () {
                var r = await api('/api/withdraw', 'POST', { amount: Number(data().amount) });

                toast(r.message);
                await refreshMe();
                await viewWallet();
            });
        } else if (form.id === 'profileForm') {
            run(button, async function () {
                var r = await api('/api/account/profile', 'POST', data());

                toast(r.message);
                await refreshMe();
                viewAccount();
            });
        } else if (form.id === 'passwordForm') {
            run(button, async function () {
                var r = await api('/api/account/password', 'POST', data());

                toast(r.message);
                form.reset();
            });
        } else if (form.id === 'taskForm') {
            run(button, async function () {
                var r = await api('/api/admin/tasks', 'POST', data());

                toast(r.message);
                await viewAdmin();
            });
        } else if (form.id === 'settingsForm') {
            run(button, async function () {
                var r = await api('/api/admin/settings', 'POST', data());

                toast(r.message);
            });
        } else if (form.id === 'memberSearch') {
            run(button, async function () {
                await adminMembers(document.getElementById('adminBody'), data().q);
            });
        }
    });

    window.addEventListener('hashchange', route);
    route();
})();
