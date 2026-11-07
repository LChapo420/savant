/** Worker for services/passwords.js: bcryptjs off the main thread. */
const { parentPort } = require('worker_threads');
const bcrypt = require('bcryptjs');

parentPort.on('message', async ({ id, op, a, b }) => {
  try {
    const value = op === 'hash' ? await bcrypt.hash(a, b) : await bcrypt.compare(a, b);
    parentPort.postMessage({ id, value });
  } catch (err) {
    parentPort.postMessage({ id, error: err.message });
  }
});
