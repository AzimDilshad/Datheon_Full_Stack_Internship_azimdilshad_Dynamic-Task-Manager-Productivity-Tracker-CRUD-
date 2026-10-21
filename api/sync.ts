import type { VercelRequest, VercelResponse } from '@vercel/node';
import { MongoClient } from 'mongodb';
import { createHash } from 'node:crypto';

/**
 * Optional cross-device sync. The browser merges changes itself; this endpoint only stores one JSON
 * document per sync key. The key is hashed before it touches the database and acts as a bearer secret,
 * so use a long random phrase. Without MONGODB_URI the endpoint answers 501 and the app stays local-only.
 */
interface SyncDoc { _id: string; data: unknown; updatedAt: number }

let client: Promise<MongoClient> | null = null;
const db = async () => {
  client ??= new MongoClient(process.env.MONGODB_URI as string, { maxPoolSize: 3 }).connect();
  return (await client).db(process.env.MONGODB_DB || 'taskbook').collection<SyncDoc>('sync');
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.MONGODB_URI) return res.status(501).json({ error: 'not_configured' });

  const key = String(req.headers['x-sync-key'] ?? '').trim();
  if (key.length < 12 || key.length > 200) return res.status(401).json({ error: 'invalid_key' });
  const id = createHash('sha256').update(key).update(process.env.SYNC_SALT ?? '').digest('hex');

  try {
    const col = await db();
    if (req.method === 'GET') {
      const doc = await col.findOne({ _id: id });
      return res.status(200).json({ data: doc?.data ?? null, updatedAt: doc?.updatedAt ?? null });
    }
    if (req.method === 'PUT') {
      const data = isRecord(req.body) ? req.body.data : null;
      if (!isRecord(data) || !Array.isArray(data.tasks) || !Array.isArray(data.projects)) return res.status(400).json({ error: 'bad_payload' });
      if (data.tasks.length > 20000 || JSON.stringify(data).length > 4_000_000) return res.status(413).json({ error: 'too_large' });
      await col.updateOne({ _id: id }, { $set: { data, updatedAt: Date.now() } }, { upsert: true });
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    console.error('sync error', err);
    return res.status(500).json({ error: 'server_error' });
  }
}
