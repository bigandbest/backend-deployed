import multer from 'multer';
import XLSX from 'xlsx';
import prisma from '../config/prisma.js';
import { priceUpdateQueue } from '../config/bullmq.js';
import { validateFile } from '../utils/excelParser.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv',
    ];
    const ext = file.originalname.toLowerCase();
    if (allowed.includes(file.mimetype) || ext.endsWith('.xlsx') || ext.endsWith('.xls') || ext.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) and CSV files are allowed'));
    }
  },
}).single('file');

// --- Export ---
export const exportPriceSheet = async (req, res) => {
  try {
    const { category_id, vertical } = req.query;

    const where = { active: true };
    const productWhere = {};
    if (category_id) productWhere.category_id = category_id;
    if (vertical) productWhere.vertical = vertical;

    const variants = await prisma.product_variants.findMany({
      where,
      include: {
        products: {
          where: Object.keys(productWhere).length ? productWhere : undefined,
          select: { id: true, name: true, category_id: true, vertical: true },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    // Filter out variants whose product didn't match (when productWhere is applied via include)
    const filtered = variants.filter((v) => v.products);

    const headers = [
      'variant_id',
      'product_name',
      'sku',
      'current_price',
      'current_old_price',
      'current_discount',
      'new_price',
      'new_old_price',
      'new_discount_percentage',
    ];

    const rows = filtered.map((v) => [
      v.id,
      v.products?.name ?? '',
      v.sku ?? '',
      v.price ?? '',
      v.old_price ?? '',
      v.discount_percentage ?? '',
      '', // new_price — to be filled by admin
      '', // new_old_price
      '', // new_discount_percentage
    ]);

    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    ws['!cols'] = [
      { wch: 38 }, // variant_id
      { wch: 30 }, // product_name
      { wch: 30 }, // sku
      { wch: 14 }, // current_price
      { wch: 16 }, // current_old_price
      { wch: 16 }, // current_discount
      { wch: 12 }, // new_price
      { wch: 14 }, // new_old_price
      { wch: 22 }, // new_discount_percentage
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Price Update');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const date = new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="price-update-${date}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error('[BulkPrice] exportPriceSheet error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// --- Upload & Enqueue ---
export const uploadAndEnqueue = (req, res) => {
  upload(req, res, async (uploadErr) => {
    if (uploadErr) {
      return res.status(400).json({ success: false, error: uploadErr.message });
    }

    const fileValidation = validateFile(req.file);
    if (!fileValidation.isValid) {
      return res.status(400).json({ success: false, errors: fileValidation.errors });
    }

    try {
      // Parse the workbook
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (!jsonRows.length) {
        return res.status(400).json({ success: false, error: 'File is empty or has no data rows' });
      }

      if (jsonRows.length > 5000) {
        return res.status(400).json({ success: false, error: 'File exceeds 5000 rows limit' });
      }

      // Normalize column names (trim + lowercase)
      const normalize = (row) => {
        const out = {};
        for (const key of Object.keys(row)) {
          out[key.toString().trim().toLowerCase().replace(/\s+/g, '_')] = row[key];
        }
        return out;
      };

      const normalizedRows = jsonRows.map(normalize);

      // Validate required columns exist
      const firstRow = normalizedRows[0];
      if (!('variant_id' in firstRow)) {
        return res.status(400).json({ success: false, error: 'Missing required column: variant_id' });
      }
      if (!('new_price' in firstRow)) {
        return res.status(400).json({ success: false, error: 'Missing required column: new_price' });
      }

      // Row-level validation
      const validRows = [];
      const invalidRows = [];

      for (let i = 0; i < normalizedRows.length; i++) {
        const row = normalizedRows[i];
        const rowNum = i + 2; // 1-indexed + header
        const errors = [];

        const variantId = row.variant_id?.toString().trim();
        const newPrice = parseFloat(row.new_price);
        const newOldPrice = row.new_old_price !== '' && row.new_old_price != null
          ? parseFloat(row.new_old_price) : null;
        const newDiscount = row.new_discount_percentage !== '' && row.new_discount_percentage != null
          ? parseFloat(row.new_discount_percentage) : null;

        if (!variantId) errors.push('variant_id is required');
        if (isNaN(newPrice) || newPrice <= 0) errors.push('new_price must be a positive number');
        if (newOldPrice != null && (isNaN(newOldPrice) || newOldPrice < newPrice)) {
          errors.push('new_old_price must be >= new_price');
        }
        if (newDiscount != null && (isNaN(newDiscount) || newDiscount < 0 || newDiscount > 100)) {
          errors.push('new_discount_percentage must be 0–100');
        }

        if (errors.length) {
          invalidRows.push({ row: rowNum, variant_id: variantId, errors });
        } else {
          validRows.push({ variant_id: variantId, new_price: newPrice, new_old_price: newOldPrice, new_discount_percentage: newDiscount });
        }
      }

      if (!validRows.length) {
        return res.status(400).json({ success: false, error: 'No valid rows found', invalidRows });
      }

      // Batch check variant_id existence
      const ids = [...new Set(validRows.map((r) => r.variant_id))];
      const existing = await prisma.product_variants.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      const existingSet = new Set(existing.map((v) => v.id));

      const enqueueRows = [];
      for (const row of validRows) {
        if (!existingSet.has(row.variant_id)) {
          invalidRows.push({ variant_id: row.variant_id, errors: ['variant_id not found in database'] });
        } else {
          enqueueRows.push(row);
        }
      }

      if (!enqueueRows.length) {
        return res.status(400).json({ success: false, error: 'No valid variant_ids found', invalidRows });
      }

      const job = await priceUpdateQueue.add('update', { rows: enqueueRows });

      res.json({
        success: true,
        jobId: job.id,
        totalRows: jsonRows.length,
        validRows: enqueueRows.length,
        invalidRows,
        preview: enqueueRows.slice(0, 5),
      });
    } catch (err) {
      console.error('[BulkPrice] uploadAndEnqueue error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });
};

// --- Job Status ---
export const getJobStatus = async (req, res) => {
  try {
    const job = await priceUpdateQueue.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

    const state = await job.getState();
    const progress = job.progress || {};

    res.json({
      success: true,
      jobId: job.id,
      state,
      progress,
      failedReason: job.failedReason || null,
      processedOn: job.processedOn || null,
      finishedOn: job.finishedOn || null,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// --- Job Results ---
export const getJobResults = async (req, res) => {
  try {
    const job = await priceUpdateQueue.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

    const state = await job.getState();
    res.json({
      success: true,
      jobId: job.id,
      state,
      results: job.returnvalue?.results || [],
      total: job.returnvalue?.total || 0,
      errorCount: job.returnvalue?.errorCount || 0,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
