/**
 * Check a skill graph against the subject's drafts (the lesson lists the live CSV is built from):
 * every node must match a lesson title, every edge A -> B must have A's first lesson before B's.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DRAFTS = (subject) => path.join(__dirname, '..', '..', '..', '..', '..', 'curriculum-build', subject, 'drafts');

function lessons(subject) {
  const dir = DRAFTS(subject);
  const files = fs.readdirSync(dir).filter((f) => /^[A-Z]\d\d\.txt$/.test(f)).sort();
  const out = [];
  files.forEach((f, gi) => {
    fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/).filter(Boolean).forEach((line, li) => {
      const m = /^\[(\w+)\] (.+?) \| (.+)$/.exec(line);
      if (m) out.push({ draft: f.slice(0, 3), grade: gi + 1, line: li + 1, order: (gi + 1) * 1000 + li + 1, tag: m[1], title: m[2], desc: m[3] });
    });
  });
  return out;
}

function checkGraph(subject, graph) {
  const all = lessons(subject);
  const nodes = {};
  const problems = [];
  for (const n of graph.nodes) {
    const re = new RegExp(n.title, 'i');
    const hits = all.filter((l) => re.test(l.title));
    if (!hits.length) { problems.push({ kind: 'node_unmatched', node: n.id, pattern: n.title }); continue; }
    nodes[n.id] = { first: hits[0], count: hits.length, lessons: hits.map((h) => `${h.draft}:${h.line}`) };
  }
  const edges = [];
  for (const [a, b] of graph.edges) {
    if (!nodes[a] || !nodes[b]) { problems.push({ kind: 'edge_unknown_node', edge: [a, b] }); continue; }
    const ok = nodes[a].first.order < nodes[b].first.order;
    edges.push({ a, b, ok, at: `${nodes[a].first.draft}:${nodes[a].first.line} -> ${nodes[b].first.draft}:${nodes[b].first.line}` });
    if (!ok) problems.push({ kind: 'order', edge: [a, b], a: `${nodes[a].first.draft}:${nodes[a].first.line} ${nodes[a].first.title}`, b: `${nodes[b].first.draft}:${nodes[b].first.line} ${nodes[b].first.title}` });
  }
  return { subject, lessons: all.length, nodes: Object.keys(nodes).length, nodesDeclared: graph.nodes.length, edges: edges.length, edgesOk: edges.filter((e) => e.ok).length, problems, nodeIndex: Object.fromEntries(Object.entries(nodes).map(([k, v]) => [k, { first: `${v.first.draft}:${v.first.line}`, title: v.first.title, lessons: v.count }])) };
}

module.exports = { lessons, checkGraph };
