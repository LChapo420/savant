/* The ACT landing page: the header, and "Start free" going to the right place.
 * A signed-in learner goes straight to onboarding with ACT in view; a new one
 * registers first, and the sign-up flow (js/auth.js) carries ?track=act through. */
App.mount(async () => {
  const user = await App.currentUser();
  App.header(user, null);
  if (!user) return;
  for (const id of ['start-free', 'start-free-2']) {
    const link = document.getElementById(id);
    if (link) link.setAttribute('href', '/onboarding?track=act');
  }
});
