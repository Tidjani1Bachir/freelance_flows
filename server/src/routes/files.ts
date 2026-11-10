const path = require('node:path');
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const crypto = require('node:crypto');
const express = require('express');
const archiver = require('archiver');
const { z } = require('zod');

const router = express.Router();

const configuredRoot = path.resolve(process.env.PROJECT_ROOT || process.env.FILES_ROOT || process.cwd());

const folderPathSchema = z.string().trim().min(1).default('.');
const listQuerySchema = z.object({ path: folderPathSchema }).strict();
const autoSortBodySchema = z.object({ path: folderPathSchema }).strict();
const bulkRenameBodySchema = z
  .object({
    path: folderPathSchema,
    pattern: z.string().trim().min(1),
    replacement: z.string(),
    flags: z.string().trim().regex(/^[dgimsuvy]*$/).default('g'),
  })
  .strict();
const duplicatesBodySchema = z.object({ path: folderPathSchema }).strict();
const archiveBodySchema = z.object({ path: folderPathSchema }).strict();

function sendValidationError(res, message) {
  return res.status(400).json({
    error: {
      code: 'VALIDATION_ERROR',
      message,
    },
  });
}

function sendNotFound(res, message = 'Folder not found') {
  return res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message,
    },
  });
}

function sendTraversalError(res) {
  return res.status(400).json({
    error: {
      code: 'PATH_OUTSIDE_ROOT',
      message: 'The requested path escapes the configured project root.',
    },
  });
}

function isPathInsideRoot(candidatePath) {
  const relativePath = path.relative(configuredRoot, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function resolveScopedPath(requestedPath) {
  const resolvedPath = path.resolve(configuredRoot, requestedPath || '.');

  if (!isPathInsideRoot(resolvedPath)) {
    throw new Error('PATH_OUTSIDE_ROOT');
  }

  return resolvedPath;
}

async function ensureDirectoryExists(directoryPath) {
  const stat = await fs.stat(directoryPath);

  if (!stat.isDirectory()) {
    const error = new Error('NOT_DIRECTORY');
    error.code = 'NOT_DIRECTORY';
    throw error;
  }

  return stat;
}

async function ensureFileExists(filePath) {
  const stat = await fs.lstat(filePath);

  if (stat.isSymbolicLink()) {
    const error = new Error('SYMLINK_NOT_ALLOWED');
    error.code = 'SYMLINK_NOT_ALLOWED';
    throw error;
  }

  if (!stat.isFile()) {
    const error = new Error('NOT_FILE');
    error.code = 'NOT_FILE';
    throw error;
  }

  return stat;
}

async function listFilesRecursive(directoryPath, rootPath, results = []) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.resolve(directoryPath, entry.name);

    if (!isPathInsideRoot(entryPath)) {
      continue;
    }

    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      await listFilesRecursive(entryPath, rootPath, results);
      continue;
    }

    if (entry.isFile()) {
      const stat = await fs.stat(entryPath);
      results.push({
        name: entry.name,
        relativePath: path.relative(rootPath, entryPath),
        absolutePath: entryPath,
        extension: path.extname(entry.name).replace(/^\./, '').toLowerCase() || 'no-extension',
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    }
  }

  return results;
}

async function listImmediateFiles(directoryPath, rootPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      continue;
    }

    const entryPath = path.resolve(directoryPath, entry.name);
    const stat = await fs.stat(entryPath);

    files.push({
      name: entry.name,
      relativePath: path.relative(rootPath, entryPath),
      absolutePath: entryPath,
      extension: path.extname(entry.name).replace(/^\./, '').toLowerCase() || 'no-extension',
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    });
  }

  return files;
}

async function findAvailablePath(desiredPath) {
  const parsed = path.parse(desiredPath);
  let candidatePath = desiredPath;
  let attempt = 1;

  while (true) {
    try {
      await fs.access(candidatePath);
      candidatePath = path.join(parsed.dir, `${parsed.name}-${attempt}${parsed.ext}`);
      attempt += 1;
    } catch {
      return candidatePath;
    }
  }
}

async function computeFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const readStream = createReadStream(filePath);

    readStream.on('data', (chunk) => hash.update(chunk));
    readStream.on('error', reject);
    readStream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function collectFilesForDuplicateSearch(directoryPath, results = []) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.resolve(directoryPath, entry.name);

    if (!isPathInsideRoot(entryPath) || entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      await collectFilesForDuplicateSearch(entryPath, results);
      continue;
    }

    if (entry.isFile()) {
      results.push(entryPath);
    }
  }

  return results;
}

async function autoSortFolder(rootFolderPath) {
  const entries = await fs.readdir(rootFolderPath, { withFileTypes: true });
  const moved = [];

  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      continue;
    }

    const sourcePath = path.resolve(rootFolderPath, entry.name);
    const extension = path.extname(entry.name).replace(/^\./, '').toLowerCase() || 'no-extension';
    const destinationDirectory = path.resolve(rootFolderPath, extension);
    const destinationPath = path.resolve(destinationDirectory, entry.name);

    await fs.mkdir(destinationDirectory, { recursive: true });

    const safeDestinationPath = await findAvailablePath(destinationPath);
    await fs.rename(sourcePath, safeDestinationPath);

    moved.push({
      from: path.relative(configuredRoot, sourcePath),
      to: path.relative(configuredRoot, safeDestinationPath),
      extension,
    });
  }

  return moved;
}

async function bulkRenameFiles(rootFolderPath, patternText, replacementText, flags) {
  let pattern;

  try {
    pattern = new RegExp(patternText, flags);
  } catch {
    const error = new Error('INVALID_REGEX');
    error.code = 'INVALID_REGEX';
    throw error;
  }

  const files = await listFilesRecursive(rootFolderPath, rootFolderPath);
  const renamed = [];

  for (const file of files) {
    const directoryName = path.dirname(file.absolutePath);
    const newName = path.basename(file.name).replace(pattern, replacementText);

    if (!newName || newName === file.name) {
      continue;
    }

    const destinationPath = path.resolve(directoryName, newName);
    const safeDestinationPath = await findAvailablePath(destinationPath);
    await fs.rename(file.absolutePath, safeDestinationPath);

    renamed.push({
      from: path.relative(configuredRoot, file.absolutePath),
      to: path.relative(configuredRoot, safeDestinationPath),
    });
  }

  return renamed;
}

async function computeDuplicates(rootFolderPath) {
  const files = await collectFilesForDuplicateSearch(rootFolderPath);
  const hashMap = new Map();

  for (const filePath of files) {
    const stat = await ensureFileExists(filePath);

    if (stat.size === 0) {
      continue;
    }

    const fileHash = await computeFileHash(filePath);
    const current = hashMap.get(fileHash) || [];

    current.push({
      path: path.relative(configuredRoot, filePath),
      sizeBytes: stat.size,
    });

    hashMap.set(fileHash, current);
  }

  return Array.from(hashMap.entries())
    .filter(([, duplicateFiles]) => duplicateFiles.length > 1)
    .map(([hash, duplicateFiles]) => ({
      hash,
      count: duplicateFiles.length,
      files: duplicateFiles,
    }));
}

function archiveFolder(res, folderPath) {
  const archive = archiver('zip', {
    zlib: { level: 9 },
  });

  return new Promise((resolve, reject) => {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(folderPath) || 'archive'}.zip"`);

    archive.on('warning', (warning) => {
      if (warning.code === 'ENOENT') {
        return;
      }

      reject(warning);
    });

    archive.on('error', reject);
    res.on('finish', resolve);
    res.on('close', () => {
      if (!res.writableEnded) {
        archive.abort();
        reject(new Error('CLIENT_DISCONNECTED'));
      }
    });

    archive.pipe(res);
    archive.directory(folderPath, false);
    Promise.resolve(archive.finalize()).catch(reject);
  });
}

router.get('/files', async (req, res) => {
  const parsedQuery = listQuerySchema.safeParse(req.query);

  if (!parsedQuery.success) {
    return sendValidationError(res, 'Invalid folder query');
  }

  let folderPath;

  try {
    folderPath = resolveScopedPath(parsedQuery.data.path);
  } catch {
    return sendTraversalError(res);
  }

  try {
    await ensureDirectoryExists(folderPath);
  } catch (error) {
    if (error.code === 'NOT_DIRECTORY' || error.code === 'ENOENT') {
      return sendNotFound(res, 'Folder not found');
    }

    throw error;
  }

  const files = await listFilesRecursive(folderPath, folderPath);

  return res.status(200).json({
    folder: path.relative(configuredRoot, folderPath) || '.',
    root: configuredRoot,
    total: files.length,
    files,
  });
});

router.post('/files/auto-sort', async (req, res) => {
  const parsedBody = autoSortBodySchema.safeParse(req.body);

  if (!parsedBody.success) {
    return sendValidationError(res, 'Invalid auto-sort payload');
  }

  let folderPath;

  try {
    folderPath = resolveScopedPath(parsedBody.data.path);
  } catch {
    return sendTraversalError(res);
  }

  try {
    await ensureDirectoryExists(folderPath);
  } catch (error) {
    if (error.code === 'NOT_DIRECTORY' || error.code === 'ENOENT') {
      return sendNotFound(res, 'Folder not found');
    }

    throw error;
  }

  const movedFiles = await autoSortFolder(folderPath);

  return res.status(200).json({
    folder: path.relative(configuredRoot, folderPath) || '.',
    moved: movedFiles.length,
    files: movedFiles,
  });
});

router.post('/files/bulk-rename', async (req, res) => {
  const parsedBody = bulkRenameBodySchema.safeParse(req.body);

  if (!parsedBody.success) {
    return sendValidationError(res, 'Invalid bulk rename payload');
  }

  let folderPath;

  try {
    folderPath = resolveScopedPath(parsedBody.data.path);
  } catch {
    return sendTraversalError(res);
  }

  try {
    await ensureDirectoryExists(folderPath);
  } catch (error) {
    if (error.code === 'NOT_DIRECTORY' || error.code === 'ENOENT') {
      return sendNotFound(res, 'Folder not found');
    }

    throw error;
  }

  try {
    const renamedFiles = await bulkRenameFiles(
      folderPath,
      parsedBody.data.pattern,
      parsedBody.data.replacement,
      parsedBody.data.flags,
    );

    return res.status(200).json({
      folder: path.relative(configuredRoot, folderPath) || '.',
      renamed: renamedFiles.length,
      files: renamedFiles,
    });
  } catch (error) {
    if (error.code === 'INVALID_REGEX') {
      return sendValidationError(res, 'Invalid regex pattern');
    }

    throw error;
  }
});

router.post('/files/find-duplicates', async (req, res) => {
  const parsedBody = duplicatesBodySchema.safeParse(req.body);

  if (!parsedBody.success) {
    return sendValidationError(res, 'Invalid duplicate search payload');
  }

  let folderPath;

  try {
    folderPath = resolveScopedPath(parsedBody.data.path);
  } catch {
    return sendTraversalError(res);
  }

  try {
    await ensureDirectoryExists(folderPath);
  } catch (error) {
    if (error.code === 'NOT_DIRECTORY' || error.code === 'ENOENT') {
      return sendNotFound(res, 'Folder not found');
    }

    throw error;
  }

  const duplicates = await computeDuplicates(folderPath);

  return res.status(200).json({
    folder: path.relative(configuredRoot, folderPath) || '.',
    duplicateGroups: duplicates.length,
    duplicates,
  });
});

router.get('/files/duplicates', async (req, res) => {
  const parsedQuery = listQuerySchema.safeParse(req.query);

  if (!parsedQuery.success) {
    return sendValidationError(res, 'Invalid folder query');
  }

  let folderPath;

  try {
    folderPath = resolveScopedPath(parsedQuery.data.path);
  } catch {
    return sendTraversalError(res);
  }

  try {
    await ensureDirectoryExists(folderPath);
  } catch (error) {
    if (error.code === 'NOT_DIRECTORY' || error.code === 'ENOENT') {
      return sendNotFound(res, 'Folder not found');
    }

    throw error;
  }

  const duplicates = await computeDuplicates(folderPath);

  return res.status(200).json({
    folder: path.relative(configuredRoot, folderPath) || '.',
    duplicateGroups: duplicates.length,
    duplicates,
  });
});

router.post('/files/archive', async (req, res) => {
  const parsedBody = archiveBodySchema.safeParse(req.body);

  if (!parsedBody.success) {
    return sendValidationError(res, 'Invalid archive payload');
  }

  let folderPath;

  try {
    folderPath = resolveScopedPath(parsedBody.data.path);
  } catch {
    return sendTraversalError(res);
  }

  try {
    await ensureDirectoryExists(folderPath);
  } catch (error) {
    if (error.code === 'NOT_DIRECTORY' || error.code === 'ENOENT') {
      return sendNotFound(res, 'Folder not found');
    }

    throw error;
  }

  try {
    await archiveFolder(res, folderPath);
  } catch (error) {
    if (!res.headersSent) {
      return sendValidationError(res, 'Unable to create archive');
    }

    throw error;
  }
});

module.exports = router;