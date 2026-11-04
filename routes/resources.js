const express = require('express');
const { list, projection } = require('../lib/query');
const { isId } = require('../lib/validation');
const { ApiError } = require('../lib/errors');
const { deleteResource } = require('../services/resources');
module.exports = function resourceRouter(Model, save, defaultLimit) {
    const router = express.Router();
    router.get('/', async (req, res) => {
        res.status(200).json({ message: 'OK', data: await list(Model, req.query, defaultLimit) });
    });
    router.post('/', async (req, res) => {
        res.status(201).json({ message: `${Model.modelName} created`, data: await save(undefined, req.body) });
    });
    router.get('/:id', async (req, res) => {
        if (!isId(req.params.id)) throw new ApiError(404, `${Model.modelName} not found`);
        const document = await Model.findById(req.params.id).select(projection(req.query));
        if (!document) throw new ApiError(404, `${Model.modelName} not found`);
        res.status(200).json({ message: 'OK', data: document });
    });
    router.put('/:id', async (req, res) => {
        res.status(200).json({ message: `${Model.modelName} updated`, data: await save(req.params.id, req.body) });
    });
    router.delete('/:id', async (req, res) => {
        await deleteResource(Model, req.params.id);
        res.status(204).end();
    });
    return router;
};
