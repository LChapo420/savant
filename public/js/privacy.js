/* The privacy policy: a static page; this only draws the header. */
App.mount(async () => {
  const user = await App.currentUser();
  App.header(user, null);
});
