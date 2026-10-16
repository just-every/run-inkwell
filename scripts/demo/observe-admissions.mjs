// Run only in run-demo. Retain admissions and connection times, never credentials or requests.
import { appendFileSync, readFileSync } from 'node:fs';
import { demoPlan } from '@runeditrun/rer/internal/modules/demo-host/plan.mjs';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (account !== 'b20c0ca9cab0c2b70e13d7cf724b89bd') throw Error('Expected RunEditRun account');
const deploy = JSON.parse(readFileSync('deploy.json'));
const declaration = JSON.parse(readFileSync('deploy-demo.json'));
const plan = demoPlan({ ...deploy, environment: 'demo-test', declaration, turnstileSiteKey: '1x00000000000000000000AA' });
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${plan.worker}/tails`;
const headers = { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' };
const record = value => appendFileSync('demo-admissions.jsonl', JSON.stringify(value) + '\n');
const windowMs = 15 * 60 * 1000, deadline = Date.now() + 25 * 60 * 1000;
const harness = 'Inkwell-demo-acceptance/dm-inkwell-v24';
let observed = false;
while (!observed && Date.now() + windowMs <= deadline) {
  const response = await fetch(endpoint, { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(20000) });
  const result = await response.json();
  if (!response.ok || !result.success) throw Error(`Tail creation failed: HTTP ${response.status}`);
  const tail = result.result, socket = new WebSocket(tail.url, 'trace-v1');
  socket.binaryType = 'arraybuffer';
  let disconnected = false, quietSince = Date.now(), heartbeat;
  const restartWindow = () => {
    quietSince = Date.now();
    record({ observationStarted: new Date(quietSince).toISOString(), worker: plan.worker });
  };
  try {
    socket.addEventListener('close', event => {
      disconnected = true;
      record({ tailClosed: event.code, at: new Date().toISOString() });
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Tail connection timed out')), 20000);
      socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timeout); reject(Error('Tail connection failed')); }, { once: true });
    });
    restartWindow();
    socket.addEventListener('message', ({ data }) => {
      const event = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
      for (const log of event.logs ?? []) for (const message of log.message ?? []) {
        if (typeof message !== 'string' || !message.includes('demo_admitted')) continue;
        const admission = JSON.parse(message);
        record({ at: log.timestamp, admission });
        if (admission.agent !== harness) restartWindow();
      }
    });
    // A plain GET sets no cookie and starts no demo; its trace keeps an idle tail active.
    heartbeat = setInterval(() => {
      void fetch(plan.origin, { signal: AbortSignal.timeout(10000) })
        .then(response => response.body?.cancel()).catch(() => {});
    }, 30000);
    while (!disconnected && Date.now() < deadline && Date.now() - quietSince < windowMs) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    observed = !disconnected && Date.now() - quietSince >= windowMs;
    if (observed) record({ observationEnded: new Date().toISOString(), uninterrupted: true });
  } finally {
    clearInterval(heartbeat);
    socket.close();
    const removed = await fetch(`${endpoint}/${tail.id}`, { method: 'DELETE', headers, signal: AbortSignal.timeout(20000) });
    if (!removed.ok) throw Error(`Tail cleanup failed: HTTP ${removed.status}`);
  }
}
if (!observed) throw Error('No uninterrupted fifteen-minute quiet window within the observation budget');
// Node's WebSocket transport can retain idle handles after the tail is deleted.
process.exit(0);
