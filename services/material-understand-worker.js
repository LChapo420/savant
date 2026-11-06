/**
 * The key-point pass on a large text, off the server's main thread (services/materials.js understandAsync).
 * Started with workerData { rich, text, spoken }; posts { key_points, topics, assessed } or { error }.
 */
const { parentPort, workerData } = require('worker_threads');
const keypoints = require('./material-keypoints');

try {
  const got = keypoints.extract(workerData.rich || workerData.text, { plain: workerData.text, spoken: workerData.spoken });
  parentPort.postMessage({ key_points: got.key_points, topics: got.topics, assessed: got.assessed });
} catch (err) {
  parentPort.postMessage({ error: err.message });
}
