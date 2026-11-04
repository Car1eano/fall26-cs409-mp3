const { ApiError } = require('./errors');
const isId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
function fail(message) { throw new ApiError(400, message); }
function bodyObject(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Request body must be an object');
}
function requiredString(value, field) {
    if (typeof value !== 'string' || !value.trim()) fail(`${field} must be a nonempty string`);
    return value;
}
function optionalString(body, field, fallback) {
    if (body[field] === undefined) return fallback;
    if (typeof body[field] !== 'string') fail(`${field} must be a string`);
    return body[field];
}
function userFields(body) {
    bodyObject(body);
    const name = requiredString(body.name, 'name');
    const email = requiredString(body.email, 'email');
    const pending = body.pendingTasks === undefined ? [] : body.pendingTasks;
    if (!Array.isArray(pending) || pending.some(id => !isId(id))) fail('pendingTasks must be an array of valid task IDs');
    return { name, email, pendingTasks: [...new Set(pending.map(id => id.toLowerCase()))] };
}
function taskFields(body) {
    bodyObject(body);
    const name = requiredString(body.name, 'name');
    const deadline = body.deadline;
    if (!['string', 'number'].includes(typeof deadline) ||
        (typeof deadline === 'string' && !deadline.trim()) ||
        !Number.isFinite(new Date(deadline).getTime())) fail('deadline must be a valid date');
    if (body.completed !== undefined && typeof body.completed !== 'boolean') fail('completed must be a boolean');
    const assignedUser = optionalString(body, 'assignedUser', '');
    if (assignedUser && !isId(assignedUser)) fail('assignedUser must be a valid user ID or an empty string');
    const assignedUserName = optionalString(body, 'assignedUserName', undefined);
    if (!assignedUser && assignedUserName !== undefined && assignedUserName !== 'unassigned') {
        fail('An unassigned task must have assignedUserName unassigned');
    }
    return { name, deadline: new Date(deadline), description: optionalString(body, 'description', ''),
        completed: body.completed === undefined ? false : body.completed,
        assignedUser: assignedUser.toLowerCase(), assignedUserName };
}
module.exports = { isId, userFields, taskFields };
