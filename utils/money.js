function formatCents(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

module.exports = { formatCents };
