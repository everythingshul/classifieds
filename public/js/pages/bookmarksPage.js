async function renderBookmarksPage() {
  const grouped = Bookmarks.grouped();
  const [classifieds, listings, simchas] = await Promise.all([
    grouped.classified.length ? Api.postsByIds(grouped.classified) : { posts: [] },
    grouped.listing.length ? Api.postsByIds(grouped.listing) : { posts: [] },
    grouped.simcha.length ? Api.postsByIds(grouped.simcha) : { posts: [] },
  ]);
  const posts = [...classifieds.posts, ...listings.posts, ...simchas.posts];

  document.getElementById('app').innerHTML = `
    <div class="container">
      <div class="page-header"><h1 data-i18n="nav_bookmarks">Bookmarks</h1></div>
      ${renderGrid(posts)}
    </div>
  `;
  I18N.apply();
  setPageTitle('Bookmarks');
}
