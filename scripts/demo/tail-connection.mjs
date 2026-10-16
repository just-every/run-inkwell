// One provider tail session. The returned URL remains only in memory.
export function tailConnections(endpoint, headers, record, onAdmission) {
  const active = new Set();
  let sequence = 0;
  async function open() {
    const response = await fetch(endpoint, { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(20000) });
    const result = await response.json();
    if (!response.ok || !result.success) throw Error(`Tail creation failed: HTTP ${response.status}`);
    const tail = result.result, socket = new WebSocket(tail.url, 'trace-v1');
    const connection = { tail, socket, sequence: ++sequence, closed: false, retired: false, openedAt: 0 };
    active.add(connection);
    socket.binaryType = 'arraybuffer';
    socket.addEventListener('close', event => {
      connection.closed = true;
      record({ tailClosed: connection.sequence, code: event.code, retired: connection.retired, at: new Date().toISOString() });
    });
    socket.addEventListener('message', ({ data }) => {
      const event = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
      for (const log of event.logs ?? []) for (const message of log.message ?? []) {
        if (typeof message === 'string' && message.includes('demo_admitted')) onAdmission(JSON.parse(message), log.timestamp);
      }
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Tail connection timed out')), 20000);
      socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timeout); reject(Error('Tail connection failed')); }, { once: true });
    });
    connection.openedAt = Date.now();
    record({ tailOpened: connection.sequence, at: new Date(connection.openedAt).toISOString(), expiresAt: tail.expires_at, sharedProviderTail: [...active].some(other => other !== connection && other.tail.id === tail.id) });
    return connection;
  }
  async function remove(connection) {
    connection.retired = true;
    connection.socket.close();
    if ([...active].some(other => other !== connection && other.tail.id === connection.tail.id)) {
      active.delete(connection);
      record({ tailRetired: connection.sequence, providerTailStillInUse: true, at: new Date().toISOString() });
      return;
    }
    const response = await fetch(`${endpoint}/${connection.tail.id}`, { method: 'DELETE', headers, signal: AbortSignal.timeout(20000) });
    if (!response.ok && response.status !== 404) throw Error(`Tail cleanup failed: HTTP ${response.status}`);
    active.delete(connection);
    record({ tailDeleted: connection.sequence, status: response.status, at: new Date().toISOString() });
  }
  return { open, remove, async close() { for (const connection of active) await remove(connection); } };
}
