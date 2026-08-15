/**
 * SimpleLocate Logs API — Cloud Functions Gen2 (HTTP)
 *
 * POST /  → insert log row (autoUpload)
 * GET  /  → list recent logs (?limit=50&label=)
 *
 * Env:
 *   DATABASE_URL — postgres connection string (Secret Manager)
 *   API_KEY      — shared client key (Secret Manager)
 *   CORS_ORIGIN  — e.g. * or https://storage.googleapis.com
 */
const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  pool = new Pool({
    connectionString,
    max: 2,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });
  return pool;
}

function corsHeaders(origin) {
  const allowed = process.env.CORS_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': allowed === '*' ? '*' : (origin || allowed),
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
    'Access-Control-Max-Age': '3600',
  };
}

function json(res, status, body, extraHeaders) {
  const headers = Object.assign(
    { 'Content-Type': 'application/json; charset=utf-8' },
    extraHeaders || {}
  );
  res.status(status).set(headers).send(JSON.stringify(body));
}

function checkApiKey(req) {
  const expected = process.env.API_KEY;
  if (!expected) return true; // unset = open (dev only)
  const got =
    req.get('x-api-key') ||
    (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  return got && got === expected;
}

function parseBody(req) {
  if (req.body == null) return null;
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(String(req.body));
  } catch (e) {
    return null;
  }
}

exports.logsApi = async (req, res) => {
  const headers = corsHeaders(req.get('origin'));

  if (req.method === 'OPTIONS') {
    res.status(204).set(headers).send('');
    return;
  }

  if (!checkApiKey(req)) {
    json(res, 401, { error: 'unauthorized' }, headers);
    return;
  }

  try {
    if (req.method === 'POST') {
      const row = parseBody(req);
      if (!row || typeof row !== 'object') {
        json(res, 400, { error: 'invalid JSON body' }, headers);
        return;
      }

      const db = getPool();
      const result = await db.query(
        `INSERT INTO test_logs (
          session_id, label, device, platform, reason,
          entry_count, duration_ms, orig_bytes, compressed,
          stats, payload_gz, payload
        ) VALUES (
          $1,$2,$3,$4,$5,
          $6,$7,$8,$9,
          $10,$11,$12
        ) RETURNING id, created_at`,
        [
          row.session_id || null,
          row.label || null,
          row.device || null,
          row.platform || null,
          row.reason || null,
          row.entry_count != null ? Number(row.entry_count) : null,
          row.duration_ms != null ? Number(row.duration_ms) : null,
          row.orig_bytes != null ? Number(row.orig_bytes) : null,
          row.compressed === true,
          row.stats != null ? JSON.stringify(row.stats) : null,
          row.payload_gz || null,
          row.payload || null,
        ]
      );

      json(
        res,
        201,
        { ok: true, id: result.rows[0].id, created_at: result.rows[0].created_at },
        headers
      );
      return;
    }

    if (req.method === 'GET') {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
      const label = req.query.label ? String(req.query.label) : null;
      const db = getPool();

      let result;
      if (label) {
        result = await db.query(
          `SELECT id, created_at, session_id, label, device, platform, reason,
                  entry_count, duration_ms, compressed, stats, payload_gz, payload
           FROM test_logs
           WHERE label = $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [label, limit]
        );
      } else {
        result = await db.query(
          `SELECT id, created_at, session_id, label, device, platform, reason,
                  entry_count, duration_ms, compressed, stats, payload_gz, payload
           FROM test_logs
           ORDER BY created_at DESC
           LIMIT $1`,
          [limit]
        );
      }

      json(res, 200, result.rows, headers);
      return;
    }

    if (req.method === 'DELETE') {
      const id = req.query.id != null ? String(req.query.id).trim() : '';
      if (!id || !/^\d+$/.test(id)) {
        json(res, 400, { error: 'id query required (numeric)' }, headers);
        return;
      }
      const db = getPool();
      const result = await db.query(
        'DELETE FROM test_logs WHERE id = $1 RETURNING id',
        [id]
      );
      if (!result.rowCount) {
        json(res, 404, { error: 'not_found' }, headers);
        return;
      }
      json(res, 200, { ok: true, id: result.rows[0].id }, headers);
      return;
    }

    json(res, 405, { error: 'method not allowed' }, headers);
  } catch (err) {
    console.error('logsApi error', err);
    json(
      res,
      500,
      { error: 'server_error', message: err && err.message ? err.message : String(err) },
      headers
    );
  }
};
