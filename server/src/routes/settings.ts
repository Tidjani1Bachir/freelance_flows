const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const express = require('express');
const Database = require('better-sqlite3');
const Archiver = require('archiver');
const AdmZip = require('adm-zip');
const { z } = require('zod');

const router = express.Router();

const defaultDatabaseFile = process.env.SQLITE_PATH || path.resolve(process.cwd(), 'freelanceflow.db');
const clearDataConfirmationToken = process.env.SETTINGS_CLEAR_DATA_TOKEN || 'CLEAR DATA';

const settingsSchema = z
  .object({
    profile: z
      .object({
        name: z.string().trim().min(1),
        email: z.string().trim().email(),
        language: z.string().trim().min(1),
        timezone: z.string().trim().min(1).default('UTC'),
      })
      .strict(),
    currency: z.string().trim().min(1).max(8),
    taxRate: z.coerce.number().finite().min(0).max(100),
    invoicePrefix: z.string().trim().min(1).max(20),
    paymentTerms: z.string().trim().min(1).max(60),
  })
  .strict();

const backupExportSchema = z
  .object({
    targetPath: z.string().trim().min(1),
  })
  .strict();

const backupRestoreSchema = z
  .object({
    sourcePath: z.string().trim().min(1),
    confirmed: z.literal(true),
  })
  .strict();

const clearDataSchema = z
  .object({
    confirmationToken: z.string().trim().min(1),
  })
  .strict();

const backupManifestSchema = z
  .object({
    version: z.literal(1),
    checksum: z.string().regex(/^[a-f0-9]{64}$/i),
    databaseFile: z.string().trim().min(1),
    createdAt: z.string().trim().min(1),
    databaseSizeBytes: z.number().int().nonnegative(),
    app: z.string().trim().min(1),
  })
  .strict();

function sendValidationError(res, message) {
  return res.status(400).json({
    error: {
      code: 'VALIDATION_ERROR',
      message,
    },
  });
}

function sendForbidden(res, message = 'Confirmation token mismatch') {
  return res.status(403).json({
    error: {
      code: 'CONFIRMATION_REQUIRED',
      message,
    },
  });
}

function sendNotFound(res, message = 'Data not found') {
  return res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message,
    },
  });
}

function sendConflict(res, message) {
  return res.status(409).json({
    error: {
      code: 'CONFLICT',
      message,
    },
  });
}

function sendServerError(res, message = 'Internal server error') {
  return res.status(500).json({
    error: {
      code: 'SERVER_ERROR',
      message,
    },
  });
}

function resolveDatabaseFile() {
  return path.resolve(defaultDatabaseFile);
}

function normalizeChecksum(value) {
  return String(value || '').trim().toLowerCase();
}

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function hashFileBuffer(fileBuffer) {
  return hashBuffer(fileBuffer);
}

function openDatabase() {
  const databaseFile = resolveDatabaseFile();
  const database = new Database(databaseFile);

  const languageColumn = database
    .prepare("SELECT name FROM pragma_table_info('users') WHERE name = 'language'")
    .get();

  if (!languageColumn) {
    database.prepare("ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'English'").run();
  }

  return database;
}

function getSettingsRecord(database) {
  const record = database
    .prepare(
      `
        SELECT
          id,
          name,
          email,
          language,
          currency,
          invoice_prefix,
          tax_rate,
          payment_terms,
          timezone
        FROM users
        ORDER BY id ASC
        LIMIT 1
      `,
    )
    .get();

  if (record) {
    return record;
  }

  return {
    id: null,
    name: 'FreelanceFlow User',
    email: 'owner@freelanceflow.local',
    language: 'English',
    currency: 'USD',
    invoice_prefix: 'INV-',
    tax_rate: 0,
    payment_terms: 'Net 15',
    timezone: 'UTC',
  };
}

function mapSettingsRecord(record) {
  return {
    profile: {
      name: record.name,
      email: record.email,
      language: record.language || 'English',
      timezone: record.timezone || 'UTC',
    },
    currency: record.currency || 'USD',
    taxRate: Number(record.tax_rate || 0),
    invoicePrefix: record.invoice_prefix || 'INV-',
    paymentTerms: record.payment_terms || 'Net 15',
  };
}

function buildManifest(checksum, databaseSizeBytes) {
  return {
    version: 1,
    checksum,
    databaseFile: path.basename(resolveDatabaseFile()),
    createdAt: new Date().toISOString(),
    databaseSizeBytes,
    app: 'FreelanceFlow',
  };
}

async function createZipFileFromDatabase(databaseFile, targetPath) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freelanceflow-settings-export-'));
  const snapshotPath = path.join(tempDir, 'freelanceflow.db');
  const zipPath = `${targetPath}.tmp`;
  const database = new Database(databaseFile);

  try {
    await database.backup(snapshotPath);
    const snapshotBuffer = await fs.readFile(snapshotPath);
    const checksum = hashFileBuffer(snapshotBuffer);
    const manifest = buildManifest(checksum, snapshotBuffer.length);

    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    await new Promise((resolve, reject) => {
      const archive = Archiver('zip', { zlib: { level: 9 } });
      const output = require('node:fs').createWriteStream(zipPath);

      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);

      archive.pipe(output);
      archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
      archive.file(snapshotPath, { name: path.basename(databaseFile) });
      Promise.resolve(archive.finalize()).catch(reject);
    });

    await fs.rm(targetPath, { force: true }).catch(() => undefined);
    await fs.rename(zipPath, targetPath);

    return {
      checksum,
      manifest,
    };
  } finally {
    database.close();

    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(zipPath, { force: true }).catch(() => undefined);
  }
}

async function readZipBackup(sourcePath) {
  const zip = new AdmZip(sourcePath);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  const names = entries.map((entry) => entry.entryName);

  if (!names.includes('manifest.json')) {
    const error = new Error('MISSING_MANIFEST');
    error.code = 'MISSING_MANIFEST';
    throw error;
  }

  if (!names.includes(path.basename(resolveDatabaseFile()))) {
    const error = new Error('MISSING_DATABASE');
    error.code = 'MISSING_DATABASE';
    throw error;
  }

  const allowedNames = new Set(['manifest.json', path.basename(resolveDatabaseFile())]);
  if (names.some((name) => !allowedNames.has(name))) {
    const error = new Error('INVALID_ZIP_STRUCTURE');
    error.code = 'INVALID_ZIP_STRUCTURE';
    throw error;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'freelanceflow-settings-restore-'));

  try {
    zip.extractAllTo(tempDir, true);

    const manifestPath = path.join(tempDir, 'manifest.json');
    const databasePath = path.join(tempDir, path.basename(resolveDatabaseFile()));

    const [manifestBuffer, databaseBuffer] = await Promise.all([
      fs.readFile(manifestPath),
      fs.readFile(databasePath),
    ]);

    const manifest = backupManifestSchema.parse(JSON.parse(manifestBuffer.toString('utf8')));
    const checksum = hashFileBuffer(databaseBuffer);

    if (normalizeChecksum(checksum) !== normalizeChecksum(manifest.checksum)) {
      const error = new Error('CHECKSUM_MISMATCH');
      error.code = 'CHECKSUM_MISMATCH';
      throw error;
    }

    return {
      manifest,
      databasePath,
      tempDir,
      checksum,
    };
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function replaceDatabaseFile(sourceDatabasePath, targetDatabaseFile) {
  const targetDir = path.dirname(targetDatabaseFile);
  const stagingPath = path.join(targetDir, `${path.basename(targetDatabaseFile)}.restoring`);
  const backupPath = path.join(targetDir, `${path.basename(targetDatabaseFile)}.before-restore`);

  await fs.mkdir(targetDir, { recursive: true });

  try {
    await fs.copyFile(targetDatabaseFile, backupPath).catch(() => undefined);
    await fs.copyFile(sourceDatabasePath, stagingPath);
    await fs.rename(stagingPath, targetDatabaseFile);
  } catch (error) {
    await fs.rm(stagingPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function clearAllData(database) {
  const tables = ['invoice_items', 'invoices', 'time_entries', 'files', 'projects', 'clients', 'leads', 'users'];

  const transaction = database.transaction(() => {
    for (const table of tables) {
      database.prepare(`DELETE FROM ${table}`).run();
    }

    const sequenceTable = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'")
      .get();

    if (sequenceTable) {
      database.prepare('DELETE FROM sqlite_sequence').run();
    }
  });

  transaction();
}

router.get('/settings', async (req, res, next) => {
  try {
    const database = openDatabase();

    try {
      return res.status(200).json({
        ...mapSettingsRecord(getSettingsRecord(database)),
        databaseFile: resolveDatabaseFile(),
      });
    } finally {
      database.close();
    }
  } catch (error) {
    return next(error);
  }
});

router.put('/settings', async (req, res, next) => {
  const parsedBody = settingsSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return sendValidationError(res, 'Invalid settings payload');
  }

  const database = openDatabase();

  try {
    const existing = getSettingsRecord(database);

    if (existing.id === null) {
      database
        .prepare(
          `
            INSERT INTO users (name, email, language, currency, invoice_prefix, tax_rate, payment_terms, timezone)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          parsedBody.data.profile.name,
          parsedBody.data.profile.email,
          parsedBody.data.profile.language,
          parsedBody.data.currency,
          parsedBody.data.invoicePrefix,
          parsedBody.data.taxRate,
          parsedBody.data.paymentTerms,
          parsedBody.data.profile.timezone,
        );
    } else {
      database
        .prepare(
          `
            UPDATE users
            SET
              name = ?,
              email = ?,
              language = ?,
              currency = ?,
              invoice_prefix = ?,
              tax_rate = ?,
              payment_terms = ?,
              timezone = ?
            WHERE id = ?
          `,
        )
        .run(
          parsedBody.data.profile.name,
          parsedBody.data.profile.email,
          parsedBody.data.profile.language,
          parsedBody.data.currency,
          parsedBody.data.invoicePrefix,
          parsedBody.data.taxRate,
          parsedBody.data.paymentTerms,
          parsedBody.data.profile.timezone,
          existing.id,
        );
    }

    return res.status(200).json({
      ...parsedBody.data,
      databaseFile: resolveDatabaseFile(),
    });
  } catch (error) {
    return next(error);
  } finally {
    database.close();
  }
});

router.post('/settings/backup/export', async (req, res, next) => {
  const parsedBody = backupExportSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return sendValidationError(res, 'Invalid backup export payload');
  }

  const databaseFile = resolveDatabaseFile();
  const resolvedTargetPath = path.resolve(parsedBody.data.targetPath);

  try {
    const exportResult = await createZipFileFromDatabase(databaseFile, resolvedTargetPath);

    return res.status(200).json({
      targetPath: resolvedTargetPath,
      checksum: exportResult.checksum,
      manifest: exportResult.manifest,
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return sendNotFound(res, 'Database file not found');
    }

    return next(error);
  }
});

router.post('/settings/backup/restore', async (req, res, next) => {
  const parsedBody = backupRestoreSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return sendValidationError(res, 'Invalid backup restore payload');
  }

  const sourcePath = path.resolve(parsedBody.data.sourcePath);

  try {
    await fs.access(sourcePath);
  } catch {
    return sendNotFound(res, 'Backup archive not found');
  }

  let backupData;

  try {
    backupData = await readZipBackup(sourcePath);
  } catch (error) {
    if (error.code === 'MISSING_MANIFEST') {
      return sendValidationError(res, 'Backup archive is missing manifest.json');
    }

    if (error.code === 'MISSING_DATABASE') {
      return sendValidationError(res, 'Backup archive is missing the SQLite database file');
    }

    if (error.code === 'INVALID_ZIP_STRUCTURE') {
      return sendValidationError(res, 'Backup archive contains unexpected files');
    }

    if (error.code === 'CHECKSUM_MISMATCH') {
      return sendValidationError(res, 'Backup checksum does not match the archive contents');
    }

    return next(error);
  }

  if (!parsedBody.data.confirmed) {
    return sendForbidden(res, 'Restore confirmation is required');
  }

  try {
    await replaceDatabaseFile(backupData.databasePath, resolveDatabaseFile());

    return res.status(200).json({
      restored: true,
      checksum: backupData.checksum,
      manifest: backupData.manifest,
      databaseFile: resolveDatabaseFile(),
      restartRequired: true,
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return sendNotFound(res, 'Database file not found');
    }

    if (error.code === 'EPERM' || error.code === 'EBUSY') {
      return sendConflict(res, 'The SQLite database is in use. Stop the server and retry the restore.');
    }

    return next(error);
  } finally {
    await fs.rm(backupData.tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

router.delete('/settings/clear-data', async (req, res, next) => {
  const parsedBody = clearDataSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return sendValidationError(res, 'Invalid clear data payload');
  }

  if (parsedBody.data.confirmationToken !== clearDataConfirmationToken) {
    return sendForbidden(res, 'Clear-data confirmation token did not match');
  }

  const database = openDatabase();

  try {
    clearAllData(database);

    return res.status(200).json({
      cleared: true,
      confirmationRequired: true,
      databaseFile: resolveDatabaseFile(),
    });
  } catch (error) {
    return next(error);
  } finally {
    database.close();
  }
});

router.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  return sendServerError(res, error?.message || 'Internal server error');
});

module.exports = router;