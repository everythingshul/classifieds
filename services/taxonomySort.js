// Re-orders a flat taxonomy list (parent_id, sort_order) into hierarchical
// order: each parent immediately followed by its own children, recursively,
// rather than a plain `ORDER BY parent_id` which groups all of one group's
// children after every parent in that group instead of nesting them under
// the parent they actually belong to.
function orderTaxonomyTree(rows) {
  const byParent = new Map();
  rows.forEach((row) => {
    const key = row.parent_id || null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(row);
  });

  const out = [];
  function walk(parentId) {
    const children = byParent.get(parentId) || [];
    children.forEach((row) => {
      out.push(row);
      walk(row.id);
    });
  }
  walk(null);

  // Any row whose declared parent_id doesn't match a real parent in this
  // set (e.g. filtered out or inactive) would otherwise be silently
  // dropped by walk() - append it so nothing goes missing.
  const seen = new Set(out.map((r) => r.id));
  rows.forEach((row) => { if (!seen.has(row.id)) out.push(row); });

  return out;
}

module.exports = { orderTaxonomyTree };
