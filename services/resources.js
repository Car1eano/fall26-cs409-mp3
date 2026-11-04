const mongoose = require('mongoose');
const User = require('../models/user');
const Task = require('../models/task');
const { ApiError } = require('../lib/errors');
const { isId, userFields, taskFields } = require('../lib/validation');
async function existing(Model, id, session) {
    if (!isId(id)) throw new ApiError(404, `${Model.modelName} not found`);
    const document = await Model.findById(id).session(session || null);
    if (!document) throw new ApiError(404, `${Model.modelName} not found`);
    return document;
}
async function saveUser(id, body) {
    return mongoose.connection.transaction(async session => {
        const old = id === undefined ? null : await existing(User, id, session);
        const fields = userFields(body);
        const duplicate = await User.findOne({ email: fields.email, ...(old ? { _id: { $ne: old._id } } : {}) }).session(session);
        if (duplicate) throw new ApiError(400, 'Email is already in use');
        const tasks = await Task.find({ _id: { $in: fields.pendingTasks } }).session(session);
        if (tasks.some(task => task.completed)) throw new ApiError(400, 'pendingTasks cannot contain completed tasks');
        if (tasks.length !== fields.pendingTasks.length) throw new ApiError(404, 'A referenced task was not found');
        const user = old || new User();
        const userId = user._id.toString();
        const removed = (old ? [...old.pendingTasks] : []).filter(taskId => !fields.pendingTasks.includes(taskId));
        user.set(fields);
        await user.save({ session });
        await Task.updateMany({ _id: { $in: removed }, assignedUser: userId }, {
            $set: { assignedUser: '', assignedUserName: 'unassigned' }
        }, { session });
        if (fields.pendingTasks.length) {
            await User.updateMany({ _id: { $ne: user._id }, pendingTasks: { $in: fields.pendingTasks } }, {
                $pull: { pendingTasks: { $in: fields.pendingTasks } }
            }, { session });
            await Task.updateMany({ _id: { $in: fields.pendingTasks } }, {
                $set: { assignedUser: userId, assignedUserName: user.name }
            }, { session });
        }
        // Completed tasks keep their assignment and receive the updated user name.
        await Task.updateMany({ assignedUser: userId }, { $set: { assignedUserName: user.name } }, { session });
        return user.toObject();
    });
}
async function saveTask(id, body) {
    return mongoose.connection.transaction(async session => {
        const old = id === undefined ? null : await existing(Task, id, session);
        const fields = taskFields(body);
        if (fields.assignedUser) {
            const user = await existing(User, fields.assignedUser, session);
            if (fields.assignedUserName !== undefined && fields.assignedUserName !== user.name) {
                throw new ApiError(400, 'assignedUserName must match the assigned user name');
            }
            fields.assignedUserName = user.name;
        } else { fields.assignedUserName = 'unassigned'; }
        const task = old || new Task();
        task.set(fields);
        await task.save({ session });
        const taskId = task._id.toString();
        // Remove stale references before adding the single pending assignment.
        await User.updateMany({ pendingTasks: taskId }, { $pull: { pendingTasks: taskId } }, { session });
        if (task.assignedUser && !task.completed) {
            await User.updateOne({ _id: task.assignedUser }, { $addToSet: { pendingTasks: taskId } }, { session });
        }
        return task.toObject();
    });
}
async function deleteResource(Model, id) {
    return mongoose.connection.transaction(async session => {
        const doc = await existing(Model, id, session);
        if (Model === User) {
            await Task.updateMany({ assignedUser: doc._id.toString() }, {
                $set: { assignedUser: '', assignedUserName: 'unassigned' }
            }, { session });
        } else {
            await User.updateMany({ pendingTasks: doc._id.toString() }, { $pull: { pendingTasks: doc._id.toString() } }, { session });
        }
        await Model.deleteOne({ _id: doc._id }, { session });
    });
}
module.exports = { saveUser, saveTask, deleteResource };
