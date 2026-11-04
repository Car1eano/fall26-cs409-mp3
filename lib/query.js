const { ApiError } = require('./errors');
function parse(query, key, fallback) {
    if (query[key] === undefined) return fallback;
    try {
        if (typeof query[key] !== 'string') throw new Error();
        return JSON.parse(query[key]);
    } catch { throw new ApiError(400, `${key} must contain valid JSON`); }
}
function objectParameter(query, key) {
    const value = parse(query, key, {});
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, `${key} must be a JSON object`);
    return value;
}
function projection(query) {
    const select = objectParameter(query, 'select');
    if (Object.values(select).some(v => v !== 0 && v !== 1)) throw new ApiError(400, 'select values must be 0 or 1');
    const modes = new Set(Object.entries(select).filter(([k]) => k !== '_id').map(([, v]) => v));
    if (modes.size > 1) throw new ApiError(400, 'select cannot mix inclusion and exclusion');
    return select;
}
function integerParameter(query, key, fallback) {
    const value = parse(query, key, fallback);
    if (!Number.isSafeInteger(value) || value < 0) throw new ApiError(400, `${key} must be a nonnegative integer`);
    return value;
}
async function list(Model, query, defaultLimit) {
    const where = objectParameter(query, 'where');
    if ('$where' in where) throw new ApiError(400, 'Unsupported filter operator');
    const sort = objectParameter(query, 'sort');
    if (Object.values(sort).some(v => v !== 1 && v !== -1)) throw new ApiError(400, 'sort values must be 1 or -1');
    const select = projection(query);
    const skip = integerParameter(query, 'skip', 0);
    const limit = integerParameter(query, 'limit', defaultLimit);
    const count = parse(query, 'count', false);
    if (typeof count !== 'boolean') throw new ApiError(400, 'count must be a boolean');
    try {
        if (count) return await Model.countDocuments(where).exec();
        return await Model.find(where).sort(sort).select(select).skip(skip).limit(limit).exec();
    } catch (err) {
        if (err.name === 'CastError' || err.name === 'MongoServerError' && err.code === 2 ||
            /Invalid|invalid|Cannot use|unknown operator|Unknown operator/.test(err.message)) {
            throw new ApiError(400, 'Invalid query value or operator');
        }
        throw err;
    }
}
module.exports = { list, projection };
