/* The printable signed consent form. A signed-in parent gets their email and,
 * with one child, the child's names filled in; anyone else gets blank lines. */
App.mount(async () => {
  App.header(null, null);
  document.getElementById('print').addEventListener('click', () => window.print());
  try {
    const cfg = await App.api.get('/api/consent/config');
    document.getElementById('policy-version').textContent = cfg.policy_version;
  } catch { /* the version in the markup stands */ }
  let me = null;
  try { me = await App.api.get('/api/consent/parent/me'); } catch { me = null; }
  if (!me || !me.parent) return;
  const fill = (key, value) => {
    const node = document.querySelector(`[data-fill="${key}"]`);
    if (node && value) node.textContent = value;
  };
  fill('parent_email', me.parent.email);
  const kids = (me.children || []).filter((c) => c.status === 'active' && c.child);
  if (kids.length === 1) {
    fill('child_name', kids[0].child.display_name);
    fill('child_username', kids[0].child.username);
  }
});
