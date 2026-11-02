'use strict';
const express = require('express');
const { pool } = require('./db');
const { requireAuth, requireActivated, requireAdmin } = require('./util');
const { AVAILABLE_TASKS_SQL, profileFrom, selectMatches } = require('./task-matching.cjs');
const router = express.Router();
const PAUSE_KEY = 'ai_task_matching_paused';
router.use('/recommendations', requireAuth, requireActivated);

// No background jobs or automatic retries. A terminal block survives restarts.
router.post('/recommendations/resume', requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM settings WHERE key = $1', [PAUSE_KEY]);
        res.json({ message: 'Task matching enabled. A new member request will check AI availability.' });
    } catch (_) { res.status(500).json({ error: 'Could not enable task matching.' }); }
});
router.post('/recommendations', async (req, res) => {
    let profile;
    try { profile = profileFrom(req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    const controller = new AbortController();
    const stop = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', stop);
    let streamed = false;
    const send = value => { if (!res.destroyed) res.write(JSON.stringify(value) + '\n'); };
    try {
        const paused = await pool.query('SELECT value FROM settings WHERE key = $1', [PAUSE_KEY]);
        if (paused.rows[0]) {
            const state = JSON.parse(paused.rows[0].value);
            return res.status(state.status).json({ error: state.message, paused: true });
        }
        const { rows } = await pool.query(AVAILABLE_TASKS_SQL, [req.user.id]);
        if (!rows.length) return res.json({ recommendations: [], message: 'No available tasks to match right now.' });
        if (!process.env.LOVABLE_API_KEY) return res.status(503).json({ error: 'AI task matching is not configured yet.' });
        // Stream initial progress before model work so the connection stays active.
        res.set({ 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
        res.flushHeaders();
        streamed = true;
        send({ type: 'status', message: 'Matching your skills and interests…' });
        const { recommendTasks } = await import('./ai-recommendations.mjs');
        const result = await recommendTasks(profile, rows, controller.signal,
            text => send({ type: 'reasoning', text }));
        // Availability can change while the model works. Never return stale tasks.
        const fresh = await pool.query(AVAILABLE_TASKS_SQL, [req.user.id]);
        const recommendations = selectMatches(result.output, fresh.rows);
        send({ type: 'result', recommendations, runId: result.runId,
            message: recommendations.length ? '' : 'No relevant matches are available right now.' });
        res.end();
    } catch (error) {
        if (controller.signal.aborted) {
            if (!streamed && !res.destroyed) res.status(499).end();
            return;
        }
        const upstream = error.cause?.statusCode ? error.cause : error;
        const status = Number(upstream.statusCode) || 502;
        let message = error.message || 'Task matching could not finish. Please try again later.';
        try {
            const body = JSON.parse(upstream.responseBody || '{}');
            message = body.message || body.error?.message || message;
            if (status === 402 || status === 403) {
                await pool.query(`INSERT INTO settings (key, value) VALUES ($1,$2)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
                    [PAUSE_KEY, JSON.stringify({ status, message })]);
            }
        } catch (_) { /* Preserve the original safe SDK error. */ }
        console.error('Task matching failed:', status, message);
        if (streamed) { send({ type: 'error', status, message, paused: status === 402 || status === 403 }); res.end(); }
        else if (!res.destroyed) res.status(status).json({ error: message });
    } finally { res.off('close', stop); }
});
module.exports = router;
