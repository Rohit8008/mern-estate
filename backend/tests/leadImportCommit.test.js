/**
 * Committing a lead import.
 *
 * The commit saved one row at a time and the first row the database refused
 * threw out of the loop — rows before it written, rows after it not, and no
 * word on which. It now validates everything, writes in unordered batches and
 * reports per row. These cases hold that, plus the three things a batched
 * write could quietly lose: the fields the Client save hooks derive, dedupe
 * for rows a full phone number cannot key, and the plan's monthly allowance.
 */

import mongoose from 'mongoose';
import Client from '../models/client.model.js';
import EmailSuppression from '../models/emailSuppression.model.js';
import ImportUsage from '../models/importUsage.model.js';
import '../models/user.model.js';
import { commitLeadImport, previewLeadImport } from '../controllers/leadImport.controller.js';
import { runWithTenant } from '../tenancy/tenantContext.js';
import { TEST_TENANT_ID } from './setup.js';

const USER = { id: new mongoose.Types.ObjectId().toString(), role: 'admin' };

// Column index → field, as the import screen sends it.
const MAPPING = { 0: 'name', 1: 'phone', 2: 'email', 3: 'budgetMax' };

/** Run as the test workspace, with a tenant document so plan limits apply. */
const asWorkspace = (limits, fn) =>
  runWithTenant(
    {
      tenantId: String(TEST_TENANT_ID),
      tenant: { _id: TEST_TENANT_ID, slug: 'default', plan: 'starter', timezone: 'Asia/Kolkata', limits },
    },
    fn
  );

function call(handler, body) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ status: this.statusCode, body: payload }); },
    };
    handler({ body, user: USER, ip: '127.0.0.1', get: () => '' }, res, reject);
  });
}

const commit = (rows) => call(commitLeadImport, { rows, mapping: MAPPING });

describe('lead import commit', () => {
  it('writes the good rows around a bad one and says which row failed', async () => {
    await asWorkspace({}, async () => {
      const { status, body } = await commit([
        ['Asha', '9876500001', 'asha@example.com', '1 Cr'],
        ['B'.repeat(200), '9876500002', '', ''], // name over the 150-char limit
        ['Chen', '9876500003', '', ''],
      ]);

      expect(status).toBe(201);
      expect(body.data).toMatchObject({ created: 2, inserted: 2, failed: 1, inputCount: 3, updated: 0 });
      expect(body.data.rowErrors).toEqual([
        expect.objectContaining({ row: 3, field: 'name', code: 'VALIDATION_FAILED' }),
      ]);
      expect(await Client.countDocuments()).toBe(2);
    });
  });

  it('maps a database refusal back to its row and keeps the rest of the batch', async () => {
    await asWorkspace({}, async () => {
      // A unique index the importer does not know about, so the DRIVER refuses
      // the second row rather than validation.
      await Client.collection.createIndex({ email: 1 }, { unique: true, partialFilterExpression: { email: { $gt: '' } }, name: 'test_unique_email' });
      try {
        const { body } = await commit([
          ['Asha', '9876500001', 'same@example.com', ''],
          ['Bilal', '9876500002', 'same@example.com', ''],
          ['Chen', '9876500003', '', ''],
        ]);
        expect(body.data.inserted).toBe(2);
        expect(body.data.failed).toBe(1);
        expect(body.data.rowErrors).toEqual([expect.objectContaining({ row: 3, code: 'DUPLICATE' })]);
      } finally {
        await Client.collection.dropIndex('test_unique_email');
      }
    });
  });

  it('reports unreadable rows without writing them', async () => {
    await asWorkspace({}, async () => {
      const { body } = await commit([
        ['', '9876500001', '', ''], // no name
        ['Asha', '9876500002', '', ''],
      ]);
      expect(body.data.skipped).toEqual({ duplicates: 0, errors: 1 });
      expect(body.data.rowErrors).toEqual([expect.objectContaining({ row: 2, code: 'INVALID_ROW' })]);
      expect(body.data.inserted).toBe(1);
    });
  });

  it('caps the row errors it returns but keeps the counts exact', async () => {
    await asWorkspace({}, async () => {
      const rows = Array.from({ length: 250 }, () => ['', '9876500001', '', '']);
      const { body } = await commit(rows);
      expect(body.data.skipped.errors).toBe(250);
      expect(body.data.rowErrors).toHaveLength(200);
      expect(body.data.rowErrorsTruncated).toBe(true);
    });
  });
});

describe('derived fields on imported leads', () => {
  it('match a lead created through save()', async () => {
    await asWorkspace({}, async () => {
      await EmailSuppression.create({ email: 'optout@example.com', source: 'link' });

      await commit([['Imported', '+91 98765 00009', 'OptOut@Example.com', '1.2 Cr']]);
      const imported = await Client.findOne({ name: 'Imported' }).lean();

      const saved = new Client({
        name: 'Saved', phone: '+91 98765 00009', email: 'optout@example.com',
        budget: { max: 12000000 }, createdBy: USER.id, assignedTo: USER.id, status: 'lead', source: 'Import',
      });
      saved.calculateScore();
      await saved.save();
      const reference = saved.toObject();

      expect(String(imported.tenantId)).toBe(String(TEST_TENANT_ID));
      for (const field of ['phoneKey', 'score', 'temperature', 'nextFollowUp']) {
        expect(imported[field]).toEqual(reference[field]);
      }
      expect(imported.emailOptOut?.source).toBe(reference.emailOptOut?.source);
      expect(imported.emailOptOut).not.toBeNull();
    });
  });
});

describe('re-running the same file', () => {
  it('does not duplicate rows a full phone number keys', async () => {
    await asWorkspace({}, async () => {
      const rows = [['Asha', '98765 00001', '', '']];
      await commit(rows);
      const { body } = await commit(rows);
      expect(body.data.inserted).toBe(0);
      expect(body.data.skipped.duplicates).toBe(1);
      expect(await Client.countDocuments()).toBe(1);
    });
  });

  it('does not duplicate short-number rows, keyed by email or by number and name', async () => {
    await asWorkspace({}, async () => {
      const rows = [
        ['Office line', '2345 6789', 'desk@example.com', ''], // 8 digits, has email
        ['Kiran', '2345 6780', '', ''],                      // 8 digits, no email
      ];
      const first = await commit(rows);
      expect(first.body.data.inserted).toBe(2);

      const again = await commit(rows);
      expect(again.body.data.inserted).toBe(0);
      expect(again.body.data.skipped.duplicates).toBe(2);
      expect(await Client.countDocuments()).toBe(2);
    });
  });

  it('dedupes inside one file, and the preview agrees with the commit', async () => {
    await asWorkspace({}, async () => {
      const rows = [
        ['Kiran', '2345 6780', '', ''],
        ['kiran ', '23456780', '', ''],
      ];
      const preview = await call(previewLeadImport, { rows, mapping: MAPPING });
      expect(preview.body.data.summary).toMatchObject({ new: 1, duplicates: 1 });

      const { body } = await commit(rows);
      expect(body.data.inserted).toBe(1);
      expect(body.data.skipped.duplicates).toBe(1);
    });
  });
});

describe('monthly import allowance', () => {
  const rowsOf = (n, offset = 0) =>
    Array.from({ length: n }, (_, i) => [`Lead ${offset + i}`, String(9800000000 + offset + i), '', '']);

  it('refuses a file that would pass the cap, before writing anything', async () => {
    await asWorkspace({ maxImportRowsPerMonth: 5 }, async () => {
      await commit(rowsOf(3));
      const err = await commit(rowsOf(3, 100)).catch((e) => e);

      expect(err.statusCode).toBe(402);
      expect(err.details).toEqual({ limit: 5, used: 3, requested: 3, remaining: 2 });
      expect(await Client.countDocuments()).toBe(3);
    });
  });

  it('counts rows that became records, not rows attempted', async () => {
    await asWorkspace({ maxImportRowsPerMonth: 5 }, async () => {
      // One valid row, one that fails validation: only one is metered.
      await commit([['Asha', '9876500001', '', ''], ['B'.repeat(200), '9876500002', '', '']]);
      const usage = await ImportUsage.findOne().lean();
      expect(usage.rows).toBe(1);
    });
  });

  it('does not meter an unlimited plan', async () => {
    await asWorkspace({ maxImportRowsPerMonth: 0 }, async () => {
      await commit(rowsOf(4));
      expect(await ImportUsage.countDocuments()).toBe(0);
    });
  });

  it('lets two imports started together share the allowance, not both overrun it', async () => {
    await asWorkspace({ maxImportRowsPerMonth: 5 }, async () => {
      const results = await Promise.allSettled([commit(rowsOf(3)), commit(rowsOf(3, 100))]);
      const refused = results.filter((r) => r.status === 'rejected');
      expect(refused).toHaveLength(1);
      expect(refused[0].reason.statusCode).toBe(402);
      expect(await Client.countDocuments()).toBe(3);
    });
  });
});
