const fs = require('fs/promises');
const path = require('path');
const sqlite3 = require('sqlite3');
const env = require('../config/env');
const { buildSeedData } = require('./seed');

let initialized = false;
let dbConnectionPromise = null;
let writeChain = Promise.resolve();

const TABLE_DEFINITIONS = [
  {
    key: 'roles',
    table: 'roles',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['name', 'TEXT NOT NULL'],
      ['created_at', 'TEXT NOT NULL'],
    ],
  },
  {
    key: 'clubs',
    table: 'clubs',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['name', 'TEXT NOT NULL'],
      ['city', 'TEXT NOT NULL'],
      ['created_at', 'TEXT NOT NULL'],
      ['updated_at', 'TEXT NOT NULL'],
    ],
  },
  {
    key: 'users',
    table: 'users',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['full_name', 'TEXT NOT NULL'],
      ['email', 'TEXT NOT NULL'],
      ['password_hash', 'TEXT NOT NULL'],
      ['role', "TEXT NOT NULL CHECK (role IN ('admin', 'coach', 'player'))"],
      ['club_id', 'TEXT'],
      ['assigned_team', 'TEXT'],
      ['is_active', 'INTEGER NOT NULL'],
      ['email_verified_at', 'TEXT'],
      ['mfa_enabled', 'INTEGER NOT NULL'],
      ['mfa_secret_encrypted', 'TEXT'],
      ['mfa_pending_secret_encrypted', 'TEXT'],
      ['created_at', 'TEXT NOT NULL'],
      ['updated_at', 'TEXT NOT NULL'],
    ],
    booleans: ['is_active', 'mfa_enabled'],
  },
  {
    key: 'invitations',
    table: 'invitations',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['email', 'TEXT NOT NULL'],
      ['invited_full_name', 'TEXT NOT NULL'],
      ['role', "TEXT NOT NULL CHECK (role IN ('admin', 'coach', 'player'))"],
      ['team_id', 'TEXT'],
      ['team_name', 'TEXT'],
      ['club_id', 'TEXT NOT NULL'],
      ['invited_by_user_id', 'TEXT NOT NULL'],
      ['token_hash', 'TEXT NOT NULL'],
      ['expires_at', 'TEXT NOT NULL'],
      ['accepted_at', 'TEXT'],
      ['created_at', 'TEXT NOT NULL'],
      ['updated_at', 'TEXT NOT NULL'],
    ],
  },
  {
    key: 'announcements',
    table: 'announcements',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['club_id', 'TEXT NOT NULL'],
      ['team_id', 'TEXT NOT NULL'],
      ['audience_type', 'TEXT'],
      ['audience_label', 'TEXT'],
      ['title', 'TEXT NOT NULL'],
      ['message', 'TEXT NOT NULL'],
      ['created_by', 'TEXT NOT NULL'],
      ['created_at', 'TEXT NOT NULL'],
      ['updated_at', 'TEXT NOT NULL'],
    ],
  },
  {
    key: 'notifications',
    table: 'notifications',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['club_id', 'TEXT NOT NULL'],
      ['user_id', 'TEXT NOT NULL'],
      ['team_id', 'TEXT'],
      ['type', 'TEXT NOT NULL'],
      ['message', 'TEXT NOT NULL'],
      ['related_entity_type', 'TEXT'],
      ['related_entity_id', 'TEXT'],
      ['is_read', 'INTEGER NOT NULL'],
      ['created_at', 'TEXT NOT NULL'],
      ['read_at', 'TEXT'],
    ],
    booleans: ['is_read'],
  },
  {
    key: 'lineups',
    table: 'lineups',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['club_id', 'TEXT NOT NULL'],
      ['team_id', 'TEXT NOT NULL'],
      ['event_id', 'TEXT'],
      ['set_number', 'INTEGER'],
      ['name', 'TEXT NOT NULL'],
      ['created_by', 'TEXT NOT NULL'],
      ['created_at', 'TEXT NOT NULL'],
      ['updated_at', 'TEXT NOT NULL'],
    ],
  },
  {
    key: 'position_assignments',
    table: 'position_assignments',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['lineup_id', 'TEXT NOT NULL'],
      ['player_id', 'TEXT NOT NULL'],
      ['position_number', 'INTEGER NOT NULL'],
      ['created_at', 'TEXT NOT NULL'],
      ['updated_at', 'TEXT NOT NULL'],
    ],
  },
  {
    key: 'ai_lineup_recommendations',
    table: 'ai_lineup_recommendations',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['club_id', 'TEXT NOT NULL'],
      ['team_id', 'TEXT NOT NULL'],
      ['event_id', 'TEXT'],
      ['set_number', 'INTEGER'],
      ['name', 'TEXT NOT NULL'],
      ['summary', 'TEXT NOT NULL'],
      ['confidence_score', 'INTEGER NOT NULL'],
      ['source', 'TEXT NOT NULL'],
      ['llm_model', 'TEXT'],
      ['status', "TEXT NOT NULL CHECK (status IN ('draft', 'confirmed'))"],
      ['created_by', 'TEXT NOT NULL'],
      ['created_at', 'TEXT NOT NULL'],
      ['updated_at', 'TEXT NOT NULL'],
    ],
  },
  {
    key: 'ai_lineup_recommendation_positions',
    table: 'ai_lineup_recommendation_positions',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['recommendation_id', 'TEXT NOT NULL'],
      ['player_id', 'TEXT NOT NULL'],
      ['position_number', 'INTEGER NOT NULL'],
      ['fit_score', 'INTEGER NOT NULL'],
      ['reason', 'TEXT NOT NULL'],
      ['created_at', 'TEXT NOT NULL'],
      ['updated_at', 'TEXT NOT NULL'],
    ],
  },
  {
    key: 'teams',
    table: 'teams',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['club_id', 'TEXT NOT NULL'],
      ['name', 'TEXT NOT NULL'],
      ['crop', 'TEXT'],
      ['field_bbox', 'TEXT'],
      ['field_geometry', 'TEXT'],
      ['field_centroid', 'TEXT'],
      ['coach_user_id', 'TEXT'],
      ['created_at', 'TEXT NOT NULL'],
      ['updated_at', 'TEXT NOT NULL'],
    ],
    jsonColumns: ['field_bbox', 'field_geometry', 'field_centroid'],
  },
  {
    key: 'players',
    table: 'players',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['user_id', 'TEXT NOT NULL'],
      ['club_id', 'TEXT NOT NULL'],
      ['jersey_number', 'INTEGER'],
      ['preferred_position', 'TEXT'],
      ['created_at', 'TEXT NOT NULL'],
      ['updated_at', 'TEXT NOT NULL'],
    ],
  },
  {
    key: 'team_memberships',
    table: 'team_memberships',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['team_id', 'TEXT NOT NULL'],
      ['player_id', 'TEXT NOT NULL'],
      ['created_at', 'TEXT NOT NULL'],
    ],
  },
  {
    key: 'player_attributes',
    table: 'player_attributes',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['player_id', 'TEXT NOT NULL'],
      ['attack_score', 'INTEGER NOT NULL'],
      ['defense_score', 'INTEGER NOT NULL'],
      ['serve_score', 'INTEGER NOT NULL'],
      ['block_score', 'INTEGER NOT NULL'],
      ['stamina_score', 'INTEGER NOT NULL'],
      ['preferred_position', 'TEXT'],
      ['updated_at', 'TEXT NOT NULL'],
    ],
  },
  {
    key: 'player_performance_logs',
    table: 'player_performance_logs',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['club_id', 'TEXT NOT NULL'],
      ['player_id', 'TEXT NOT NULL'],
      ['event_id', 'TEXT'],
      ['session_type', 'TEXT NOT NULL'],
      ['serve_rating', 'INTEGER NOT NULL'],
      ['attack_rating', 'INTEGER NOT NULL'],
      ['defense_rating', 'INTEGER NOT NULL'],
      ['block_rating', 'INTEGER NOT NULL'],
      ['stamina_rating', 'INTEGER NOT NULL'],
      ['coach_rating', 'INTEGER NOT NULL'],
      ['minutes_played', 'INTEGER NOT NULL'],
      ['attendance_status', "TEXT NOT NULL CHECK (attendance_status IN ('present', 'late', 'absent'))"],
      ['created_at', 'TEXT NOT NULL'],
    ],
  },
  {
    key: 'events',
    table: 'events',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['club_id', 'TEXT NOT NULL'],
      ['team_id', 'TEXT NOT NULL'],
      ['title', 'TEXT NOT NULL'],
      ['type', 'TEXT NOT NULL'],
      ['description', 'TEXT'],
      ['location', 'TEXT'],
      ['start_time', 'TEXT NOT NULL'],
      ['end_time', 'TEXT NOT NULL'],
      ['created_by', 'TEXT NOT NULL'],
      ['created_at', 'TEXT NOT NULL'],
      ['updated_at', 'TEXT NOT NULL'],
    ],
  },
  {
    key: 'event_requests',
    table: 'event_requests',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['club_id', 'TEXT NOT NULL'],
      ['coach_user_id', 'TEXT NOT NULL'],
      ['requested_by_user_id', 'TEXT'],
      ['team_id', 'TEXT NOT NULL'],
      ['request_kind', 'TEXT'],
      ['source_event_id', 'TEXT'],
      ['current_title', 'TEXT NOT NULL'],
      ['current_event_type', 'TEXT NOT NULL'],
      ['current_start_time', 'TEXT NOT NULL'],
      ['current_end_time', 'TEXT NOT NULL'],
      ['current_location', 'TEXT'],
      ['current_notes', 'TEXT'],
      [
        'status',
        "TEXT NOT NULL CHECK (status IN ('pending_admin_review', 'pending_coach_review', 'approved', 'rejected'))",
      ],
      ['rejection_reason', 'TEXT'],
      ['finalized_event_id', 'TEXT'],
      ['final_reviewed_by_admin_id', 'TEXT'],
      ['final_reviewed_at', 'TEXT'],
      ['created_at', 'TEXT NOT NULL'],
      ['updated_at', 'TEXT NOT NULL'],
    ],
  },
  {
    key: 'event_request_revisions',
    table: 'event_request_revisions',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['event_request_id', 'TEXT NOT NULL'],
      ['proposed_by_role', "TEXT NOT NULL CHECK (proposed_by_role IN ('coach', 'admin', 'player'))"],
      ['proposed_by_user_id', 'TEXT NOT NULL'],
      ['title', 'TEXT NOT NULL'],
      ['event_type', 'TEXT NOT NULL'],
      ['start_time', 'TEXT NOT NULL'],
      ['end_time', 'TEXT NOT NULL'],
      ['location', 'TEXT'],
      ['notes', 'TEXT'],
      ['revision_number', 'INTEGER NOT NULL'],
      ['comment', 'TEXT'],
      ['created_at', 'TEXT NOT NULL'],
    ],
  },
  {
    key: 'conversations',
    table: 'conversations',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['club_id', 'TEXT NOT NULL'],
      ['type', "TEXT NOT NULL CHECK (type IN ('direct', 'team'))"],
      ['team_id', 'TEXT'],
      ['created_at', 'TEXT NOT NULL'],
      ['updated_at', 'TEXT NOT NULL'],
    ],
  },
  {
    key: 'conversation_participants',
    table: 'conversation_participants',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['conversation_id', 'TEXT NOT NULL'],
      ['user_id', 'TEXT NOT NULL'],
      ['created_at', 'TEXT NOT NULL'],
    ],
  },
  {
    key: 'messages',
    table: 'messages',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['conversation_id', 'TEXT NOT NULL'],
      ['sender_user_id', 'TEXT NOT NULL'],
      ['content', 'TEXT NOT NULL'],
      ['created_at', 'TEXT NOT NULL'],
    ],
  },
  {
    key: 'password_reset_tokens',
    table: 'password_reset_tokens',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['user_id', 'TEXT NOT NULL'],
      ['token_hash', 'TEXT NOT NULL'],
      ['expires_at', 'TEXT NOT NULL'],
      ['used_at', 'TEXT'],
      ['created_at', 'TEXT NOT NULL'],
    ],
  },
  {
    key: 'email_verification_tokens',
    table: 'email_verification_tokens',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['user_id', 'TEXT NOT NULL'],
      ['token_hash', 'TEXT NOT NULL'],
      ['expires_at', 'TEXT NOT NULL'],
      ['used_at', 'TEXT'],
      ['created_at', 'TEXT NOT NULL'],
    ],
  },
  {
    key: 'player_add_requests',
    table: 'player_add_requests',
    columns: [
      ['id', 'TEXT PRIMARY KEY'],
      ['coach_user_id', 'TEXT NOT NULL'],
      ['player_id', 'TEXT NOT NULL'],
      ['team_id', 'TEXT NOT NULL'],
      ['request_type', "TEXT NOT NULL CHECK (request_type IN ('add', 'remove')) DEFAULT 'add'"],
      ['status', "TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected'))"],
      ['created_at', 'TEXT NOT NULL'],
      ['reviewed_at', 'TEXT'],
      ['reviewed_by_user_id', 'TEXT'],
    ],
  },
];

function getConnection() {
  if (!dbConnectionPromise) {
    dbConnectionPromise = (async () => {
      await fs.mkdir(path.dirname(env.dbPath), { recursive: true });

      return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(env.dbPath, (error) => {
          if (error) {
            reject(error);
            return;
          }

          db.serialize(() => {
            db.run('PRAGMA journal_mode = WAL;');
            db.run('PRAGMA foreign_keys = OFF;');
          });

          resolve(db);
        });
      });
    })();
  }

  return dbConnectionPromise;
}

async function run(sql, params = []) {
  const db = await getConnection();
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

async function all(sql, params = []) {
  const db = await getConnection();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });
}

async function get(sql, params = []) {
  const db = await getConnection();
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row);
    });
  });
}

function normalizeJsonValueForWrite(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

function parseJsonValue(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeRecordForWrite(definition, record, sequence) {
  const row = { _seq: sequence };
  const jsonColumns = new Set(definition.jsonColumns || []);

  for (const [columnName] of definition.columns) {
    let value = record[columnName];

    if (definition.booleans?.includes(columnName)) {
      value = value ? 1 : 0;
    }

    if (jsonColumns.has(columnName)) {
      value = normalizeJsonValueForWrite(value);
    }

    row[columnName] = value ?? null;
  }

  return row;
}

function hydrateRecord(definition, row) {
  const record = {};
  const jsonColumns = new Set(definition.jsonColumns || []);

  for (const [columnName] of definition.columns) {
    let value = row[columnName];

    if (definition.booleans?.includes(columnName)) {
      value = Boolean(value);
    }

    if (jsonColumns.has(columnName)) {
      value = parseJsonValue(value);
    }

    record[columnName] = value;
  }

  return record;
}

async function createSchema() {
  for (const definition of TABLE_DEFINITIONS) {
    const columnSql = [['_seq', 'INTEGER NOT NULL'], ...definition.columns]
      .map(([name, type]) => `${name} ${type}`)
      .join(', ');

    await run(`CREATE TABLE IF NOT EXISTS ${definition.table} (${columnSql})`);
    await run(`CREATE INDEX IF NOT EXISTS idx_${definition.table}_seq ON ${definition.table} (_seq)`);
  }
}

function getSafeAlterColumnType(type) {
  return String(type || '')
    .replace(/\s+NOT NULL\b/gi, '')
    .trim();
}

async function syncSchemaColumns() {
  for (const definition of TABLE_DEFINITIONS) {
    const existingColumns = await all(`PRAGMA table_info(${definition.table})`);
    const existingColumnNames = new Set(existingColumns.map((column) => column.name));

    for (const [name, type] of definition.columns) {
      if (!existingColumnNames.has(name)) {
        const safeType = getSafeAlterColumnType(type);
        await run(`ALTER TABLE ${definition.table} ADD COLUMN ${name} ${safeType}`);
      }
    }
  }
}

async function isDatabaseSeeded() {
  const row = await get('SELECT COUNT(*) AS count FROM users');
  return Number(row?.count || 0) > 0;
}

async function loadDbFromSqlite() {
  const db = {};

  for (const definition of TABLE_DEFINITIONS) {
    const rows = await all(`SELECT * FROM ${definition.table} ORDER BY _seq ASC`);
    db[definition.key] = rows.map((row) => hydrateRecord(definition, row));
  }

  return db;
}

async function replaceAllData(nextDb) {
  await run('BEGIN IMMEDIATE TRANSACTION');

  try {
    for (const definition of TABLE_DEFINITIONS) {
      await run(`DELETE FROM ${definition.table}`);
    }

    for (const definition of TABLE_DEFINITIONS) {
      const records = Array.isArray(nextDb[definition.key]) ? nextDb[definition.key] : [];
      const columns = ['_seq', ...definition.columns.map(([name]) => name)];
      const placeholders = columns.map(() => '?').join(', ');
      const insertSql = `INSERT INTO ${definition.table} (${columns.join(', ')}) VALUES (${placeholders})`;

      for (let index = 0; index < records.length; index += 1) {
        const row = normalizeRecordForWrite(definition, records[index], index);
        await run(insertSql, columns.map((columnName) => row[columnName]));
      }
    }

    await run('COMMIT');
  } catch (error) {
    try {
      await run('ROLLBACK');
    } catch {
      // Ignore rollback errors so the original failure is surfaced.
    }
    throw error;
  }
}

async function ensureDbExists() {
  if (initialized) {
    return;
  }

  await getConnection();
  await createSchema();
  await syncSchemaColumns();

  if (!(await isDatabaseSeeded())) {
    const seed = await buildSeedData();
    await replaceAllData(seed);
  }

  initialized = true;
}

async function readDb() {
  await ensureDbExists();
  return loadDbFromSqlite();
}

async function writeDb(db) {
  await ensureDbExists();
  await replaceAllData(db);
}

async function updateDb(mutator) {
  const operation = writeChain.catch(() => undefined).then(async () => {
    const db = await readDb();
    const result = await mutator(db);
    await writeDb(db);
    return result;
  });

  writeChain = operation.catch(() => undefined);
  return operation;
}

async function resetDb() {
  await ensureDbExists();
  const seed = await buildSeedData();
  await replaceAllData(seed);
  return seed;
}

module.exports = {
  ensureDbExists,
  readDb,
  writeDb,
  updateDb,
  resetDb,
};
