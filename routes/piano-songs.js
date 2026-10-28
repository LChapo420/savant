/**
 * The piano song path: the song library by grade, with each learner's stars.
 *
 *   GET  /api/piano/songs             the path: grades, songs, this learner's best stars
 *   GET  /api/piano/songs/:id         one song's arrangement, for the player (public: the
 *                                     songs are public domain and our own arrangements)
 *   POST /api/piano/songs/:id/result  a take: scored again here, then kept (signed in)
 *
 * Stars are worked out on the server from the notes the page sends (content/piano-songs.js
 * scoreTake, the same piano-core functions the page uses); the page's own count is never
 * stored. One row per learner per song in `piano_song_results`.
 */
const express = require('express');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const songs = require('../content/piano-songs');
const { GRADES } = require('../content/piano-grades');

const router = express.Router();
const COLLECTION = 'piano_song_results';

function rowFor(userId, songId) {
  return db.findOne(COLLECTION, (r) => r.user_id === userId && r.song_id === songId) || null;
}

/** The learner's current piano grade, from their enrollment, or null. */
function currentGrade(userId) {
  const e = db.findOne('enrollments', (x) => x.user_id === userId && x.track_id === 'piano');
  return e ? e.grade_id : null;
}

router.get('/songs', (req, res) => {
  const user = req.user || null;
  const mine = user ? db.find(COLLECTION, (r) => r.user_id === user.id) : [];
  const best = new Map(mine.map((r) => [r.song_id, r]));
  const grades = [];
  for (const song of songs.SONGS) {
    let g = grades.find((x) => x.id === song.grade);
    if (!g) {
      const grade = GRADES.find((x) => x.id === song.grade) || {};
      g = { id: song.grade, number: songs.gradeNumber(song.grade), name: grade.name || song.grade, songs: [] };
      grades.push(g);
    }
    const r = best.get(song.id);
    const before = g.songs[g.songs.length - 1];
    g.songs.push({
      id: song.id,
      title: song.title,
      by: song.by,
      best: r ? r.best : 0,
      attempts: r ? r.attempts : 0,
      // A grade's first song is open; each next one opens once the one before has a star.
      open: !before || before.best >= 1,
    });
  }
  grades.sort((a, b) => a.number - b.number);
  res.json({ signed_in: !!user, current_grade: user ? currentGrade(user.id) : null, grades });
});

router.get('/songs/:id', (req, res) => {
  const song = songs.get(req.params.id);
  if (!song) return res.status(404).json({ error: 'No such song.' });
  res.json({ song: songs.publicSong(song) });
});

router.post('/songs/:id/result', requireAuth, (req, res) => {
  const song = songs.get(req.params.id);
  if (!song) return res.status(404).json({ error: 'No such song.' });
  const take = songs.scoreTake(song, req.body);
  if (take.error) return res.status(400).json({ error: take.error });
  const at = new Date().toISOString();
  const summary = {
    at, mode: take.mode, hands: take.hands, speed: take.speed, stars: take.stars, score: take.score,
    notes: take.notes, timing: take.timing, estimated: take.estimated,
  };
  const old = rowFor(req.user.id, song.id);
  const key = `${take.hands}/${take.mode}`;
  const row = old
    ? db.update(COLLECTION, old.id, {
      best: Math.max(old.best || 0, take.stars),
      best_by: { ...(old.best_by || {}), [key]: Math.max(((old.best_by || {})[key]) || 0, take.stars) },
      attempts: (old.attempts || 0) + 1,
      last: summary,
      recent: [summary, ...(old.recent || [])].slice(0, 10),
      updated_at: at,
    })
    : db.insert(COLLECTION, {
      user_id: req.user.id, song_id: song.id, grade_id: song.grade,
      best: take.stars, best_by: { [key]: take.stars }, attempts: 1, last: summary, recent: [summary], updated_at: at,
    });
  res.json({ stars: take.stars, score: take.score, notes: take.notes, timing: take.timing, estimated: take.estimated, best: row.best, attempts: row.attempts });
});

module.exports = router;
