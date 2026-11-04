class ApiError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}
function errorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);
    let status = err instanceof ApiError ? err.status : 500;
    let message = err instanceof ApiError ? err.message : 'An unexpected server error occurred';
    if (err.code === 11000) { status = 400; message = 'Email is already in use'; }
    else if (err.type === 'entity.parse.failed') { status = 400; message = 'Request body must contain valid JSON'; }
    else if (['ValidationError', 'CastError', 'StrictModeError'].includes(err.name)) {
        status = 400; message = 'Invalid field value';
    }
    res.status(status).json({ message, data: null });
}
module.exports = { ApiError, errorHandler };
