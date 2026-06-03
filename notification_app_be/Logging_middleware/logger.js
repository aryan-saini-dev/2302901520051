const axios = require("axios");

/**
 * Sends a structured log entry to the centralized AffordMed logging server.
 *
 * @param {string} stack   - The stack identifier: 'backend' or 'frontend'
 * @param {string} level   - Severity: 'info', 'warn', 'error', 'fatal', 'debug'
 * @param {string} pkg     - The package/module name, e.g. 'route', 'database'
 * @param {string} message - Descriptive log message
 */
async function Log(stack, level, pkg, message) {
  const payload = {
    stack,
    level,
    package: pkg,
    message,
    timestamp: new Date().toISOString()
  };

  try {
    await axios.post(
      process.env.LOG_API_URL,
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (err) {
    console.error("Logging failed:", err.message);
  }
}

module.exports = Log;
