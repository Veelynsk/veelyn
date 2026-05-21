// MailerLite API v2 client — https://connect.mailerlite.com/api
//
// Auth: Bearer token in `Authorization` header. Token comes from env
// MAILERLITE_TOKEN (set in Railway → Variables, NEVER in git).
//
// What this module does:
//  - Upsert a subscriber (create or update by email)
//  - Add a subscriber to a named group (Newsletter / Customers / Abandoned cart)
//  - Remove from a group (e.g. drop Abandoned cart once a customer completes
//    their order so the win-back email doesn't fire)
//  - Cache group IDs by name so we only resolve them once per process
//
// We use the new v2 API (connect.mailerlite.com) — the legacy classic API
// at api.mailerlite.com/api/v2 is deprecated and rate-limits harshly.

const ML_BASE = 'https://connect.mailerlite.com/api';

const groupCache = new Map(); // name (lowercased) → group id

function getToken() {
  return process.env.MAILERLITE_TOKEN || '';
}

export function isEnabled() {
  return !!getToken();
}

async function mlFetch(path, { method = 'GET', body = null } = {}) {
  const token = getToken();
  if (!token) throw new Error('MAILERLITE_TOKEN not set');
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
  };
  if (body !== null) headers['Content-Type'] = 'application/json';
  const res = await fetch(ML_BASE + path, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const msg = json?.message || json?.error?.message || `MailerLite API ${res.status}`;
    const err = new Error(`MailerLite: ${msg}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// Look up a group ID by its display name. Cached for the process lifetime.
// Refresh by restarting the backend (or clear groupCache).
export async function getGroupId(name) {
  const key = String(name).toLowerCase();
  if (groupCache.has(key)) return groupCache.get(key);
  const data = await mlFetch('/groups?limit=100');
  const groups = data?.data || [];
  for (const g of groups) {
    if (String(g.name).toLowerCase() === key) {
      groupCache.set(key, g.id);
      return g.id;
    }
  }
  return null;
}

// Upsert (POST /subscribers acts as upsert when the email already exists).
// `subscriber` = { email, fields?: {name, last_name, ...}, groups?: [groupId], status?: 'active'|'unsubscribed' }
export async function upsertSubscriber(subscriber) {
  return mlFetch('/subscribers', { method: 'POST', body: subscriber });
}

// Convenience: upsert by email + add to a named group.
// Resolves group name → ID lazily.
export async function addToGroup(email, groupName, extraFields = {}) {
  const groupId = await getGroupId(groupName);
  if (!groupId) {
    throw new Error(`MailerLite group "${groupName}" not found. Create it in dashboard → Subscribers → Groups.`);
  }
  return upsertSubscriber({
    email,
    fields: extraFields,
    groups: [groupId],
    status: 'active',
  });
}

// Remove a subscriber from a named group (used to drop people from
// "Abandoned cart" once they convert). Doesn't delete the subscriber.
export async function removeFromGroup(email, groupName) {
  const groupId = await getGroupId(groupName);
  if (!groupId) return null;
  // Need subscriber ID first
  const found = await mlFetch(`/subscribers/${encodeURIComponent(email)}`).catch(() => null);
  const subscriberId = found?.data?.id;
  if (!subscriberId) return null;
  return mlFetch(`/subscribers/${subscriberId}/groups/${groupId}`, { method: 'DELETE' });
}
