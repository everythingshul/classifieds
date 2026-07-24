async function renderBookmarksPage() {
  const grouped = Bookmarks.grouped();
  const [classifieds, simchas] = await Promise.all([
    grouped.classified.length ? Api.postsByIds(grouped.classified) : { posts: [] },
    grouped.simcha.length ? Api.postsByIds(grouped.simcha) : { posts: [] },
  ]);
  const posts = [...classifieds.posts, ...simchas.posts];

  document.getElementById('app').innerHTML = `
    <div class="container">
      <div class="page-header"><h1 data-i18n="nav_bookmarks">Bookmarks</h1></div>
      ${renderGrid(posts)}
    </div>
  `;
  I18N.apply();
}
