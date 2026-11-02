'use strict';
const AVAILABLE_TASKS_SQL = `SELECT t.id, t.type, t.platform, t.title, t.description, t.url,
    t.reward, t.min_seconds, c.started_at, c.completed_at
    FROM tasks t LEFT JOIN task_completions c ON c.task_id = t.id AND c.user_id = $1
    WHERE t.active = true AND c.completed_at IS NULL
    AND (t.max_completions IS NULL OR
        (SELECT COUNT(*) FROM task_completions x WHERE x.task_id = t.id
         AND x.completed_at IS NOT NULL) < t.max_completions)
    ORDER BY t.id DESC`;
function profileFrom(body) {
    const skills = typeof body?.skills === 'string' ? body.skills.trim() : '';
    const interests = typeof body?.interests === 'string' ? body.interests.trim() : '';
    if (!skills && !interests) throw new Error('Describe your skills or interests first.');
    if (skills.length > 2000 || interests.length > 2000) throw new Error('Keep each description within 2,000 characters.');
    return { skills, interests };
}
function publicTask(t) {
    return { id: t.id, type: t.type, platform: t.platform, title: t.title,
        description: t.description, url: t.url, reward: t.reward,
        minSeconds: t.min_seconds, started: !!t.started_at, completed: false };
}
function selectMatches(output, available) {
    const byId = new Map(available.map(t => [String(t.id), t]));
    const seen = new Set();
    return (output?.recommendations || []).flatMap(match => {
        const id = String(match.taskId);
        const task = byId.get(id);
        if (!task || seen.has(id) || !String(match.reason || '').trim()) return [];
        seen.add(id);
        return [{ task: publicTask(task), reason: String(match.reason).slice(0, 500) }];
    }).slice(0, 5);
}
module.exports = { AVAILABLE_TASKS_SQL, profileFrom, selectMatches };
