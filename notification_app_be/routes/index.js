var express = require('express');
var router = express.Router();
const Log = require('../Logging_middleware/logger');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.json({ message: 'API is running' });
});

/* POST /log - Manually send a log to the centralized log server */
router.post('/log', async function(req, res, next) {
  const { stack, level, package: pkg, message } = req.body;

  if (!stack || !level || !pkg || !message) {
    return res.status(400).json({ error: "Missing required fields: stack, level, package, message" });
  }

  await Log(stack, level, pkg, message);
  res.json({ status: "success", message: "Log sent to central server" });
});

module.exports = router;
