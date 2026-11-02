const { test } = require('node:test');
const assert = require('node:assert/strict');
const { profileFrom, selectMatches, AVAILABLE_TASKS_SQL } = require('../src/task-matching.cjs');
test('members can describe skills without interests', () => {
    assert.deepEqual(profileFrom({skills:' Writing ',interests:''}),{skills:'Writing',interests:''});
});
test('members can describe interests without skills', () => {
    assert.deepEqual(profileFrom({skills:'',interests:'Sports'}),{skills:'',interests:'Sports'});
});
test('AI cannot recommend tasks outside the current available catalog', () => {
    const available=[{id:7,title:'Real task',reward:1500,min_seconds:15}];
    const result=selectMatches({recommendations:[{taskId:'99',reason:'Invented'},{taskId:'7',reason:'Writing fit'},{taskId:'7',reason:'Duplicate'}]},available);
    assert.deepEqual(result.map(r=>r.task.id),[7]);
    assert.equal(result[0].task.reward,1500);
});
test('a task removed while generation runs is never returned', () => {
    assert.deepEqual(selectMatches({recommendations:[{taskId:'7',reason:'Fit'}]},[]),[]);
});
test('available-task query excludes inactive completed and full tasks', () => {
    assert.match(AVAILABLE_TASKS_SQL,/t.active = true AND c.completed_at IS NULL/);
    assert.match(AVAILABLE_TASKS_SQL,/< t.max_completions/);
});
test('recommendation endpoints enforce existing verified and activated access', () => {
    const fs=require('fs'),vm=require('vm');
    const gates=[];
    const auth=()=>{},activation=()=>{};
    vm.runInNewContext(fs.readFileSync(require.resolve('../src/recommendations.js'),'utf8'),{
        require:n=>n==='express'?{Router:()=>({use:(...args)=>gates.push(args),post:()=>{}})}:
            n==='./db'?{pool:{}}:n==='./util'?{requireAuth:auth,requireActivated:activation}:require('../src/task-matching.cjs'),
        module:{exports:{}}
    });
    assert.equal(gates[0][0],'/recommendations');
    assert.equal(gates[0][1],auth);
    assert.equal(gates[0][2],activation);
});
