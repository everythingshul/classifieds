const express = require('express');
const { requireAdmin } = require('../../middleware/adminAuth');
const { workbook, catalog } = require('../../services/adminExport');
const { XLSX_TYPE } = require('../../services/xlsx');

const router = express.Router();
router.use(requireAdmin);

router.get('/', (req, res) => res.json({ datasets: catalog() }));

// GET /api/admin/export/<dataset or all>?from=YYYY-MM-DD&to=YYYY-MM-DD  ->  .xlsx
router.get('/:kind', (req, res, next) => {
  try {
    const buf = workbook(req.params.kind, req.query.from, req.query.to);
    if (!buf) return res.status(404).json({ error: 'Unknown export' });
    const stamp = new Date().toISOString().slice(0, 10);
    res.set({ 'Content-Type': XLSX_TYPE, 'Content-Disposition': `attachment; filename="jlistings-${req.params.kind}-${stamp}.xlsx"`, 'Cache-Control': 'no-store' });
    res.send(Buffer.from(buf));
  } catch (e) { next(e); }
});

module.exports = router;
