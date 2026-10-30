/**
 * Worker process: parses one uploaded file and sends back the result. Started by material-runner.js,
 * which enforces the time and memory limit. Gets { kind, data } over IPC and answers once.
 */
const P = require('./material-parsers');

const PARSER = { pdf: P.fromPdf, pptx: P.fromPptx, docx: P.fromDocx, odt: P.fromOdt, epub: P.fromEpub, xlsx: P.fromXlsx, rtf: P.fromRtf, html: P.fromHtmlFile };

process.once('message', async (msg) => {
  let out;
  try {
    const buf = Buffer.from(msg.data);
    const parse = PARSER[msg.kind];
    out = parse ? await parse(buf) : { error: 'That kind of file is not supported.', code: 'bad_type' };
  } catch {
    out = { error: 'That file could not be read. It may be damaged.', code: 'unreadable' };
  }
  process.send(out, () => process.exit(0));
});
