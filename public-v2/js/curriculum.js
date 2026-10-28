/* The whole curriculum: every subject, every grade, every level, on one page. */
App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'curriculum');

  const root = document.getElementById('root');
  if (!user.can_browse) {
    root.innerHTML = '<div class="notice notice-error">Not available on this account. '
      + '<a href="/dashboard">Back to dashboard</a>.</div>';
    return;
  }

  // The catalogue is intentionally small. Full level rows are loaded only for
  // the grade being inspected, so all 57 Spanish grades can appear immediately.
  const data = await App.api.get('/api/curriculum?view=summary');
  const tracks = Array.isArray(data.tracks) ? data.tracks : [];
  const wantedTrack = App.query('track') || null;
  const wantedGrade = App.query('grade') || null;
  const SLICE = 100;
  const OUTLINE_PAGE = 150;
  const state = {
    track: wantedTrack,
    grade: wantedGrade,
    from: Math.max(0, Number(App.query('from')) || 0),
    onlyLessons: App.query('lessons') === '1',
  };
  const detailCache = new Map();
  let requestNumber = 0;

  const trackOf = (id) => tracks.find((track) => track.id === id) || tracks[0];
  const gradeOf = (track) => track && (track.grades.find((grade) => grade.id === state.grade)
    || track.grades[0]);

  async function loadGradeDetails(trackId, gradeId) {
    const key = `${trackId}/${gradeId}`;
    if (detailCache.has(key)) return detailCache.get(key);

    const query = `view=detail&track=${encodeURIComponent(trackId)}&grade=${encodeURIComponent(gradeId)}`;
    const detail = await App.api.get(`/api/curriculum?${query}`);
    const detailedTrack = (detail.tracks || []).find((track) => track.id === trackId);
    const detailedGrade = detailedTrack
      && detailedTrack.grades.find((grade) => grade.id === gradeId);
    if (!detailedGrade || !Array.isArray(detailedGrade.nodes)) {
      throw new Error('The selected grade could not be loaded.');
    }

    const catalogueTrack = trackOf(trackId);
    const catalogueGrade = catalogueTrack
      && catalogueTrack.grades.find((grade) => grade.id === gradeId);
    if (!catalogueGrade) throw new Error('The selected grade is no longer available.');
    Object.assign(catalogueGrade, detailedGrade);
    detailCache.set(key, catalogueGrade);
    return catalogueGrade;
  }

  async function openGrade(trackId, gradeId, from = 0) {
    const track = trackOf(trackId);
    const grade = track && track.grades.find((item) => item.id === gradeId);
    if (!track || !grade) return;

    const token = ++requestNumber;
    state.track = track.id;
    state.grade = grade.id;
    state.from = Math.max(0, Number(from) || 0);
    state.onlyLessons = false;
    root.innerHTML = '<div class="loading"><span class="spinner"></span>Loading the selected grade</div>';
    try {
      await loadGradeDetails(track.id, grade.id);
      if (token === requestNumber) render();
    } catch (err) {
      if (token !== requestNumber) return;
      root.innerHTML = `<div class="notice notice-error">${App.escapeHtml(err.message || 'Unable to load this grade.')} `
        + '<a href="/curriculum">Reload the curriculum</a>.</div>';
    }
  }

  const initialTrack = trackOf(state.track);
  if (!initialTrack || !initialTrack.grades || !initialTrack.grades.length) {
    root.innerHTML = '<div class="notice notice-error">No curriculum grades are available.</div>';
    return;
  }
  state.track = initialTrack.id;
  state.grade = gradeOf(initialTrack).id;
  await loadGradeDetails(state.track, state.grade);

  const matching = (grade, query) => {
    const all = grade.topics || [];
    if (!query) return all.slice(0, OUTLINE_PAGE);
    const hits = [];
    for (const topic of all) {
      const hay = `${topic.level} ${topic.type || ''} ${topic.topic || ''} ${topic.covers || ''}`.toLowerCase();
      if (hay.includes(query)) hits.push(topic);
      if (hits.length >= OUTLINE_PAGE * 4) break;
    }
    return hits;
  };

  const countMatching = (grade, query) => {
    const all = grade.topics || [];
    if (!query) return Math.min(OUTLINE_PAGE, all.length);
    return all.reduce((count, topic) => {
      const hay = `${topic.level} ${topic.type || ''} ${topic.topic || ''} ${topic.covers || ''}`.toLowerCase();
      return count + (hay.includes(query) ? 1 : 0);
    }, 0);
  };

  const outlineRows = (grade, query) => matching(grade, query).map((topic) => `
    <tr>
      <td class="tiny muted nowrap" style="width:40px">${topic.level || ''}</td>
      <td class="tiny muted nowrap" style="width:120px">${App.escapeHtml(topic.type || '')}</td>
      <td>${App.escapeHtml(topic.topic || '')}</td>
    </tr>`).join('');

  function nodeRow(node) {
    const isLesson = node.kind === 'lesson';
    const isCheckpoint = App.isCheckpointLevel(node)
      || ['master', 'grand', 'graduation', 'essay'].includes(node.delivered || node.kind);
    const named = node.level_title || node.topic;
    const kindName = node.type
      || (isLesson ? 'Lesson' : isCheckpoint ? App.levelName(node.delivered) : 'Practice');
    const title = `Level ${node.level} - ${App.escapeHtml(kindName)}`
      + (named ? `: ${App.escapeHtml(named)}` : '');
    const detail = node.covers
      ? App.escapeHtml(node.covers)
      : isCheckpoint
        ? `${App.escapeHtml(node.focus_name || '')} &middot; ${App.escapeHtml(node.label || '')}`
        : `${App.escapeHtml(node.focus_name || '')} &middot; difficulty ${node.difficulty}`;
    const badge = node.state === 'done' ? window.icon('check')
      : node.state === 'current' ? window.icon('arrow-right')
        : node.state === 'unjoined' ? '' : String(node.level);
    const stateText = node.state === 'unjoined'
      ? '<span class="tiny muted">not joined</span>'
      : node.state === 'current'
        ? '<span class="tiny" style="color:var(--accent)">you are here</span>'
        : node.state === 'done' ? '<span class="tiny muted">done</span>' : '';
    return `
      <div class="node node-${node.state}${isCheckpoint ? ' node-checkpoint' : ''}${isLesson ? ' node-lesson' : ''}">
        ${badge ? `<span class="badge">${badge}</span>` : '<span class="badge"></span>'}
        <span>
          <span class="title">${title}</span>
          <span class="tiny muted detail">${detail}${stateText ? ` &middot; ${stateText}` : ''}</span>
        </span>
      </div>`;
  }

  function levelBlock(grade) {
    const nodes = grade.nodes || [];
    const lessons = nodes.filter((node) => node.kind === 'lesson');
    const shown = state.onlyLessons ? lessons : nodes;
    const found = state.onlyLessons
      ? shown.findIndex((node) => node.level >= state.from)
      : state.from;
    const start = Math.max(0, found < 0 ? 0 : found);
    const slice = shown.slice(start, start + SLICE);
    const first = slice[0] ? slice[0].level : 0;
    const last = slice.length ? slice[slice.length - 1].level : 0;
    const hasBefore = start > 0;
    const hasAfter = start + SLICE < shown.length;
    return `
      <div class="row-wrap" style="margin:10px 0 8px">
        ${hasBefore ? `<button class="btn btn-sm btn-ghost" type="button" data-jump="-1">${window.icon('arrow-left')}Earlier</button>` : ''}
        <span class="tiny muted">levels ${first}-${last} of ${grade.path_length}</span>
        ${hasAfter ? `<button class="btn btn-sm btn-ghost" type="button" data-jump="1">Later${window.icon('arrow-right')}</button>` : ''}
        <label class="tiny muted" style="display:flex; align-items:center; gap:6px; margin-left:auto">
          <input type="checkbox" id="only-lessons"${state.onlyLessons ? ' checked' : ''}> lessons only
        </label>
      </div>
      <div class="path" id="levels">${slice.map(nodeRow).join('')}</div>`;
  }

  function gradeCard(track, grade) {
    const topicCount = grade.topic_count != null ? grade.topic_count : (grade.topics || []).length;
    const checkpoints = grade.checkpoints || (grade.nodes || []).filter((node) => node.checkpoint);
    const checkpointInfo = checkpoints.length
      ? `<div class="tiny muted curriculum-checkpoints">${window.icon('flag')}Checkpoint: level ${checkpoints[0].level} - ${App.escapeHtml(checkpoints[0].label || App.levelName(checkpoints[0].kind || checkpoints[0].checkpoint))}`
        + ` <button class="btn btn-sm btn-ghost" type="button" data-grade="${grade.id}" data-level="${checkpoints[0].level}">${window.icon('arrow-right')}Show checkpoint</button></div>`
      : '';
    const current = grade.enrolled
      ? `<span class="chip">${window.icon('arrow-right')}level ${grade.current_level}</span>`
      : '<span class="chip">not joined</span>';
    return `
      <div class="card card-tight" style="margin-bottom:10px">
        <div class="row-between" style="align-items:flex-start; gap:10px">
          <div>
            <div class="card-title">${App.escapeHtml(grade.name)} ${current}</div>
            <div class="tiny muted">${grade.path_length} levels &middot; ${topicCount} topics
              &middot; ${grade.lessons} lessons &middot; ${grade.skills.length} skills</div>
            <div class="small muted" style="margin-top:4px">${App.escapeHtml(grade.blurb)}</div>
            ${checkpointInfo}
          </div>
          <button class="btn btn-sm" type="button" data-grade="${grade.id}">Open the path</button>
        </div>
      </div>`;
  }

  function render() {
    const track = trackOf(state.track);
    if (!track || !track.grades.length) return;
    if (!state.grade || !track.grades.some((grade) => grade.id === state.grade)) {
      state.grade = track.grades[0].id;
    }
    const grade = gradeOf(track);
    const topicCount = grade.topic_count != null ? grade.topic_count : (grade.topics || []).length;
    root.innerHTML = `
      <div class="row-between" style="margin-bottom:14px">
        <div class="card-title" style="font-size:1.5rem">
          ${App.symbol(track)}
          <span>${App.escapeHtml(track.name)} curriculum
            <span class="tiny muted" style="display:block">Every grade and level - read-only</span>
          </span>
        </div>
        <a class="btn btn-ghost btn-sm" href="/dashboard">${window.icon('arrow-left')}Dashboard</a>
      </div>
      <div class="row-wrap" style="margin-bottom:14px">
        ${tracks.map((item) => `
          <button class="btn btn-sm ${item.id === track.id ? 'btn-primary' : 'btn-ghost'}"
                  type="button" data-track="${item.id}">${App.escapeHtml(item.name)}</button>`).join('')}
      </div>
      <div class="grid grid-2">
        <div>
          ${track.grades.map((item) => gradeCard(track, item)).join('')}
          <div class="card card-tight">
            <div class="card-title">${window.icon('list')}What ${App.escapeHtml(grade.name)} contains</div>
            <div class="small muted" style="margin:6px 0 8px">
              ${topicCount} topics, in lesson order. The path below shows every level;
              filter these taught topics to find one.
            </div>
            <input class="input" id="outline-filter" type="search"
                   placeholder="Find a level by title or type..."
                   aria-label="Find a level by title or type" style="margin-bottom:8px">
            <table class="data"><tbody id="outline-body">${outlineRows(grade, '')}</tbody></table>
            <p class="tiny muted" id="outline-count" style="margin:8px 0 0"></p>
          </div>
        </div>
        <div>
          <div class="card">
            <div class="row-between" style="align-items:flex-start">
              <div>
                <div class="card-title">${App.escapeHtml(track.name)} - ${App.escapeHtml(grade.name)}</div>
                <div class="tiny muted">${grade.path_length} levels, ${topicCount} named by the course,
                  ${grade.lessons} taught lessons</div>
              </div>
            </div>
            <p class="small muted" style="margin:8px 0 0">
              ${App.layoutSentence({ stated_lessons: grade.stated_lessons })}
            </p>
          </div>
          ${levelBlock(grade)}
        </div>
      </div>`;

    const filter = document.getElementById('outline-filter');
    const body = document.getElementById('outline-body');
    const count = document.getElementById('outline-count');
    const paint = (query) => {
      body.innerHTML = outlineRows(grade, query);
      const shown = countMatching(grade, query);
      count.textContent = query
        ? `${shown} of ${topicCount} topics match "${query}"`
        : `showing the first ${Math.min(OUTLINE_PAGE, topicCount)} of ${topicCount} topics`;
    };
    filter.addEventListener('input', () => paint(filter.value.trim().toLowerCase()));
    paint('');
    wire();
  }

  function wire() {
    for (const button of root.querySelectorAll('[data-track]')) {
      button.addEventListener('click', () => {
        const track = trackOf(button.dataset.track);
        if (track && track.grades[0]) void openGrade(track.id, track.grades[0].id);
      });
    }
    for (const button of root.querySelectorAll('[data-grade]')) {
      button.addEventListener('click', () => {
        const from = button.dataset.level ? Number(button.dataset.level) - 1 : 0;
        void openGrade(state.track, button.dataset.grade, from);
      });
    }
    for (const button of root.querySelectorAll('[data-jump]')) {
      button.addEventListener('click', () => {
        const grade = gradeOf(trackOf(state.track));
        const shown = state.onlyLessons
          ? grade.nodes.filter((node) => node.kind === 'lesson')
          : grade.nodes;
        const current = state.onlyLessons
          ? shown.findIndex((node) => node.level >= state.from)
          : state.from;
        const at = Math.max(0, current < 0 ? 0 : current);
        const lastPage = Math.max(0, (Math.ceil(shown.length / SLICE) - 1) * SLICE);
        const next = Math.max(0, Math.min(lastPage, at + Number(button.dataset.jump) * SLICE));
        state.from = state.onlyLessons && shown[next] ? shown[next].level : next;
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    const only = document.getElementById('only-lessons');
    if (only) {
      only.addEventListener('change', () => {
        state.onlyLessons = only.checked;
        state.from = 0;
        render();
      });
    }
  }

  render();
});