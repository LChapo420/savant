/**
 * Worker process: parses one uploaded file and sends back the result. Started by material-runner.js,
 * which enforces the time and memory limit. Gets { kind, data } over IPC and answers once.
 */
const { fromPdf, fromDocx, fromPptx } = require('./material-parsers');

process.once('message', async (msg) => {
  let out;
  try {
    const buf = Buffer.from(msg.data);
    out = msg.kind === 'pdf' ? await fromPdf(buf) : msg.kind === 'pptx' ? await fromPptx(buf) : await fromDocx(buf);
  } catch {
    out = { error: 'That file could not be read. It may be damaged.', code: 'unreadable' };
  }
  process.send(out, () => process.exit(0));
});
