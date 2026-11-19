'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const FILES = Object.freeze({
  incidents: 'incidents.json',
  communityReports: 'community-reports.json',
  importedDataset: 'imported-dataset.json',
  activeMode: 'active-dataset.json'
});

const DEPLOYMENT_MARKERS = [
  'VERCEL',
  'RENDER',
  'FLY_APP_NAME',
  'RAILWAY_ENVIRONMENT',
  'K_SERVICE',
  'AWS_LAMBDA_FUNCTION_NAME',
  'WEBSITE_INSTANCE_ID'
];

function isDeploymentEnvironment(env) {
  return String(env.NODE_ENV || '').toLowerCase() === 'production' ||
    DEPLOYMENT_MARKERS.some(name => env[name] !== undefined && env[name] !== '');
}

function resolveOperatingMode(env = process.env) {
  const requested = env.SURAKSHYA_MODE;
  const deployed = isDeploymentEnvironment(env);

  if (requested === 'public-read-only') {
    return { mode: 'public-read-only', reason: 'Public deployments are read-only until durable storage and access control are implemented.' };
  }
  if (requested === 'local-research') {
    if (deployed) {
      return { mode: 'public-read-only', reason: 'Local research writes are disabled in a detected deployment environment.' };
    }
    return { mode: 'local-research', reason: null };
  }
  if (requested !== undefined) {
    return { mode: 'unsupported', reason: 'Unsupported SURAKSHYA_MODE. Use local-research or public-read-only.' };
  }
  if (deployed) {
    return { mode: 'public-read-only', reason: 'Deployment mode is read-only until durable storage and access control are implemented.' };
  }
  return { mode: 'local-research', reason: null };
}

class PersistentStorageError extends Error {
  constructor(message, code, cause) {
    super(message);
    this.name = 'PersistentStorageError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

class LocalJsonStorage {
  constructor({ root = path.join(__dirname, '..', 'data'), fsImpl = fs } = {}) {
    this.root = path.resolve(root);
    this.fs = fsImpl;
  }

  status() {
    return {
      mode: 'local-json',
      configured: true,
      available: null,
      readable: null,
      writable: null,
      durable: false,
      durability: 'Best-effort local filesystem with atomic rename; not a managed database or guaranteed against machine/storage loss.',
      reason: null
    };
  }

  filePath(key) {
    const filename = FILES[key];
    if (!filename) throw new PersistentStorageError('Unknown storage key.', 'STORAGE_UNKNOWN_KEY');
    return path.join(this.root, filename);
  }

  read(key) {
    const file = this.filePath(key);
    let contents;
    try {
      contents = this.fs.readFileSync(file, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw new PersistentStorageError(`Could not read stored ${key}.`, 'STORAGE_READ_FAILED', error);
    }
    let value;
    try {
      value = JSON.parse(contents);
    } catch (error) {
      throw new PersistentStorageError(`Stored ${key} is not valid JSON.`, 'STORAGE_INVALID_JSON', error);
    }
    if (value === null) {
      throw new PersistentStorageError(`Stored ${key} has an invalid null value.`, 'STORAGE_INVALID_DATA');
    }
    return value;
  }

  write(key, value) {
    const file = this.filePath(key);
    let contents;
    try {
      contents = JSON.stringify(value, null, 2);
      if (typeof contents !== 'string') throw new TypeError('Value cannot be represented as JSON.');
    } catch (error) {
      throw new PersistentStorageError(`Could not serialize ${key}.`, 'STORAGE_SERIALIZATION_FAILED', error);
    }

    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      this.fs.mkdirSync(this.root, { recursive: true });
      this.fs.writeFileSync(temporary, contents, { flag: 'wx' });
      this.fs.renameSync(temporary, file);
    } catch (error) {
      try {
        this.fs.rmSync(temporary, { force: true });
      } catch (cleanupError) {
        error.cleanupError = cleanupError;
      }
      throw new PersistentStorageError(`Could not write stored ${key}.`, 'STORAGE_WRITE_FAILED', error);
    }
  }

  update(key, updater, defaultValue = null) {
    if (typeof updater !== 'function') {
      throw new TypeError('Storage update requires an updater function.');
    }
    const current = this.read(key);
    const next = updater(current === null ? defaultValue : current);
    this.write(key, next);
    return next;
  }
}

class ReadOnlyStorage {
  constructor(reason = 'Persistent storage is not configured for this deployment.') {
    this.reason = reason;
  }

  status() {
    return {
      mode: 'read-only',
      configured: false,
      available: false,
      readable: false,
      writable: false,
      durable: false,
      durability: 'No persistent storage provider is configured.',
      reason: this.reason
    };
  }

  read() {
    throw new PersistentStorageError(this.reason, 'STORAGE_UNAVAILABLE');
  }

  write() {
    throw new PersistentStorageError(this.reason, 'STORAGE_UNAVAILABLE');
  }

  update() {
    throw new PersistentStorageError(this.reason, 'STORAGE_UNAVAILABLE');
  }
}

function createStorage({ env = process.env, root, fsImpl = fs } = {}) {
  const operatingMode = resolveOperatingMode(env);
  if (operatingMode.mode !== 'local-research') {
    return new ReadOnlyStorage(
      operatingMode.reason || 'Persistent writes are disabled for this deployment.'
    );
  }
  return new LocalJsonStorage({
    root: root || env.SURAKSHYA_DATA_DIR || path.join(__dirname, '..', 'data'),
    fsImpl
  });
}

module.exports = {
  createStorage,
  LocalJsonStorage,
  ReadOnlyStorage,
  PersistentStorageError,
  resolveOperatingMode,
  isDeploymentEnvironment
};
