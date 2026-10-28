/* Private admin page enhancements. Served only to a signed-in session at
 * /donteventry/assets/dashboard.js. The page works without it: search, tabs,
 * export and the two-step delete are plain links and forms. */
'use strict';
(function () {
  // Typing in the search box filters the rows already on the page at once;
  // pressing Search still asks the server (which searches every row).
  var input = document.querySelector('[data-admin-filter]');
  var rows = Array.prototype.slice.call(document.querySelectorAll('tr[data-row]'));
  var count = document.querySelector('[data-admin-count]');
  var original = count ? count.textContent : '';
  if (input && rows.length) {
    input.addEventListener('input', function () {
      var needle = input.value.trim().toLowerCase();
      var shown = 0;
      rows.forEach(function (row) {
        var hit = !needle || row.textContent.toLowerCase().indexOf(needle) !== -1;
        row.hidden = !hit;
        if (hit) shown += 1;
      });
      if (count) count.textContent = needle ? shown + ' shown on this page. Press Search to search everything.' : original;
    });
  }

  // Only one delete confirmation open at a time.
  document.addEventListener('toggle', function (e) {
    var el = e.target;
    if (!el.classList || !el.classList.contains('admin-delete') || !el.open) return;
    document.querySelectorAll('details.admin-delete[open]').forEach(function (d) { if (d !== el) d.open = false; });
  }, true);

  // When the idle timeout passes, take the data off the screen and reload,
  // which shows the sign-in form once the server has ended the session.
  var idle = Number(document.body.getAttribute('data-idle-seconds'));
  if (idle > 0) {
    setTimeout(function () {
      var main = document.getElementById('main');
      if (main) main.hidden = true;
      window.location.reload();
    }, (idle + 5) * 1000);
  }
})();
