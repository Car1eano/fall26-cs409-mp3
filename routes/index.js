/*
 * Connect all of your endpoints together here.
 */
module.exports = function (app, router) {
    app.use('/api', require('./home.js')(router));
    const { saveUser, saveTask } = require('../services/resources');
    const resourceRouter = require('./resources');
    app.use('/api/users', resourceRouter(require('../models/user'), saveUser, 0));
    app.use('/api/tasks', resourceRouter(require('../models/task'), saveTask, 100));
};
