/* The page for an address that leads nowhere: the usual header, nothing else. */
App.mount(async () => {
  App.header(await App.currentUser());
});
