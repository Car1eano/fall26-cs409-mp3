const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const mongoose = require('mongoose');
require('dotenv').config({ quiet: true });
const User = require('../models/user');
const Task = require('../models/task');
const base = process.env.TEST_API_URL || 'http://127.0.0.1:3099';
let child;
let checks = 0;
async function request(path, method = 'GET', body, expected = 200) {
    const res = await fetch(`${base}/api${path}`, {
        method, headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await res.text();
    assert.equal(res.status, expected, `${method} ${path}: ${text}`);
    if (expected === 204) { assert.equal(text, ''); checks++; return; }
    const result = JSON.parse(text);
    assert.equal(typeof result.message, 'string');
    assert.ok(Object.hasOwn(result, 'data'));
    checks++;
    return result.data;
}
function query(path, values) {
    return `${path}?${new URLSearchParams(Object.entries(values).map(([k, v]) => [k, JSON.stringify(v)]))}`;
}
const missing = '111111111111111111111111';
const taskBody = (fields = {}) => ({ name: 'Test task', deadline: '2026-12-01', ...fields });
async function main() {
    // Run against a separate database so existing application data stays untouched.
    const uri = new URL(process.env.MONGODB_URI);
    const database = `mp3_test_${Date.now()}`;
    uri.pathname = `/${database}`;
    await mongoose.connect(uri.toString());
    await User.init();
    await Task.init();
    child = spawn(process.execPath, ['server.js'], {
        env: { ...process.env, MONGODB_URI: uri.toString(), PORT: '3099' }, stdio: 'ignore'
    });
    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 250));
        try { if ((await fetch(`${base}/healthz`)).ok) break; } catch {}
        if (i === 59) throw new Error('Test server did not become ready');
    }
    try {
        await request('/users', 'POST', {}, 400);
        await request('/tasks', 'POST', taskBody({ name: 5 }), 400);
        await request('/tasks', 'POST', { name: 'Missing date' }, 400);
        await request('/tasks', 'POST', taskBody({ completed: 'false' }), 400);
        await request('/tasks', 'POST', taskBody({ deadline: null }), 400);
        const a = await request('/users', 'POST', { name: 'A', email: 'a@test.example', dateCreated: '2000-01-01' }, 201);
        const b = await request('/users', 'POST', { name: 'B', email: 'b@test.example' }, 201);
        assert.deepEqual(a.pendingTasks, []);
        assert.notEqual(a.dateCreated, '2000-01-01T00:00:00.000Z');
        await request('/users', 'POST', { name: 'Duplicate', email: a.email }, 400);
        const t = await request('/tasks', 'POST', taskBody({ assignedUser: a._id }), 201);
        assert.equal(t.assignedUserName, a.name);
        assert.equal(t.description, '');
        assert.equal(t.completed, false);
        assert.deepEqual((await request(`/users/${a._id}`)).pendingTasks, [t._id]);
        await request(`/tasks/${t._id}`, 'PUT', taskBody({ assignedUser: b._id, assignedUserName: 'wrong' }), 400);
        assert.equal((await request(`/tasks/${t._id}`)).assignedUser, a._id);
        await request(`/users/${b._id}`, 'PUT', { name: b.name, email: b.email, pendingTasks: [t._id] });
        assert.equal((await request(`/tasks/${t._id}`)).assignedUser, b._id);
        assert.deepEqual((await request(`/users/${a._id}`)).pendingTasks, []);
        await request(`/tasks/${t._id}`, 'PUT', taskBody({ assignedUser: b._id, completed: true }));
        assert.deepEqual((await request(`/users/${b._id}`)).pendingTasks, []);
        await request(`/users/${b._id}`, 'PUT', { name: 'Renamed', email: b.email });
        assert.equal((await request(`/tasks/${t._id}`)).assignedUserName, 'Renamed');
        await request(`/users/${a._id}`, 'PUT', { name: 'A', email: a.email, pendingTasks: [t._id] }, 400);
        await request(`/tasks/${t._id}`, 'PUT', taskBody({ assignedUser: a._id, completed: true }));
        assert.deepEqual((await request(`/users/${a._id}`)).pendingTasks, []);
        const reopened = await request(`/tasks/${t._id}`, 'PUT', taskBody({ assignedUser: a._id }));
        assert.equal(reopened.dateCreated, t.dateCreated);
        assert.deepEqual((await request(`/users/${a._id}`)).pendingTasks, [t._id]);
        const before = await request(`/users/${a._id}`);
        await request(`/users/${a._id}`, 'PUT', { name: 'Must roll back', email: a.email, pendingTasks: [t._id, missing] }, 404);
        assert.deepEqual(await request(`/users/${a._id}`), before);
        await request(`/users/${a._id}`, 'PUT', { name: a.name, email: a.email });
        assert.equal((await request(`/tasks/${t._id}`)).assignedUser, '');
        const c = await request('/users', 'POST', { name: 'C', email: 'c@test.example', pendingTasks: [t._id] }, 201);
        assert.equal((await request(`/tasks/${t._id}`)).assignedUser, c._id);
        await request(`/users/${c._id}`, 'PUT', { name: 'C2', email: c.email, pendingTasks: [t._id] });
        assert.equal((await request(`/tasks/${t._id}`)).assignedUserName, 'C2');
        const done = await request('/tasks', 'POST', taskBody({ assignedUser: c._id, completed: true }), 201);
        await request(`/users/${c._id}`, 'DELETE', undefined, 204);
        for (const id of [t._id, done._id]) {
            const doc = await request(`/tasks/${id}`);
            assert.equal(doc.assignedUser, ''); assert.equal(doc.assignedUserName, 'unassigned');
        }
        await request(`/users/${c._id}`, 'GET', undefined, 404);
        await request(`/tasks/${t._id}`, 'PUT', taskBody({ assignedUser: a._id }));
        await request(`/tasks/${t._id}`, 'DELETE', undefined, 204);
        assert.deepEqual((await request(`/users/${a._id}`)).pendingTasks, []);
        await request(`/tasks/${t._id}`, 'GET', undefined, 404);
        await request(`/tasks/${t._id}`, 'DELETE', undefined, 404);
        for (const collection of ['users', 'tasks']) {
            await request(`/${collection}/bad`, 'PUT', {}, 404);
            await request(`/${collection}/${missing}`, 'PUT', {}, 404);
            await request(`/${collection}/bad`, 'GET', undefined, 404);
            await request(`/${collection}/bad`, 'DELETE', undefined, 404);
            assert.deepEqual(await request(query(`/${collection}`, { where: { _id: missing } })), []);
            assert.equal(await request(query(`/${collection}`, { where: { _id: missing }, count: true })), 0);
            await request(`/${collection}?where=broken`, 'GET', undefined, 400);
            await request(`/${collection}?skip=-1`, 'GET', undefined, 400);
        }
        await request('/users', 'POST', { name: 'Bad', email: 'bad@test.example', pendingTasks: ['bad'] }, 400);
        await request('/tasks', 'POST', taskBody({ assignedUser: 'bad' }), 400);
        await request('/tasks', 'POST', taskBody({ assignedUser: missing }), 404);
        const selected = await request(query(`/users/${a._id}`, { select: { name: 1, _id: 0 } }));
        assert.deepEqual(selected, { name: 'A' });
        const selectedTask = await request(query(`/tasks/${done._id}`, { select: { name: 1, _id: 0 } }));
        assert.deepEqual(selectedTask, { name: 'Test task' });
        await request(`/users/${a._id}?where=broken&count=broken`);
        const docs = Array.from({ length: 105 }, (_, i) => ({ name: `Page ${String(i).padStart(3, '0')}`, deadline: new Date(), completed: false }));
        await Task.insertMany(docs);
        assert.equal((await request('/tasks')).length, 100);
        assert.equal((await request('/tasks?limit=0')).length, 106);
        assert.equal(await request(query('/tasks', { where: { completed: false }, count: true })), 105);
        const page = await request(query('/tasks', { where: { completed: false }, sort: { name: -1 }, skip: 2, limit: 3, select: { name: 1, _id: 0 } }));
        assert.deepEqual(page.map(t => t.name), ['Page 102', 'Page 101', 'Page 100']);
        const parallel = await Promise.all([a, b].map(u => request('/users', 'POST', { name: u.name, email: 'race@test.example' }, 201).then(() => 'created', () => 'rejected')));
        assert.equal(parallel.filter(r => r === 'created').length, 1);
        assert.equal(await User.countDocuments({ email: 'race@test.example' }), 1);
        console.log(`PASS: ${checks} HTTP checks plus consistency, rollback, pagination, and unique-email assertions`);
    } finally {
        child.kill();
        await Task.deleteMany({});
        await User.deleteMany({});
        await mongoose.disconnect();
    }
}
main().catch(async err => {
    if (child) child.kill();
    console.error(err.message);
    await mongoose.disconnect();
    process.exitCode = 1;
});
