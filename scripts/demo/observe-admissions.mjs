// Run only in the run-demo environment; retain admissions, never request headers or cookies.
import { appendFileSync } from 'node:fs';
import { demoPlan } from '@runeditrun/rer/internal/modules/demo-host/plan.mjs';
import { readFileSync } from 'node:fs';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (account !== 'b20c0ca9cab0c2b70e13d7cf724b89bd') throw Error('Expected RunEditRun account');
const deploy = JSON.parse(readFileSync('deploy.json'));
const declaration = JSON.parse(readFileSync('deploy-demo.json'));
const plan = demoPlan({ ...deploy, environment: 'demo-test', declaration, turnstileSiteKey: '1x00000000000000000000AA' });
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${plan.worker}/tails`;
const headers = { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' };
const response = await fetch(endpoint, { method: 'POST', headers, body: '{}' });
const result = await response.json();
if (!response.ok || !result.success) throw Error(`Tail creation failed: HTTP ${response.status}`);
const tail = result.result;
const file = 'demo-admissions.jsonl';
const record = value => appendFileSync(file, JSON.stringify(value) + '\n');
const socket = new WebSocket(tail.url, 'trace-v1');
socket.binaryType = 'arraybuffer';
let disconnected = false;
try {
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(Error('Tail connection failed')), { once: true }); });
  record({ observationStarted: new Date().toISOString(), worker: plan.worker });
  socket.addEventListener('close', () => { disconnected = true; });
  socket.addEventListener('message', ({ data }) => {
    const event = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
    for (const log of event.logs ?? []) for (const message of log.message ?? []) {
      if (typeof message !== 'string' || !message.includes('demo_admitted')) continue;
      record({ at: log.timestamp, admission: JSON.parse(message) });
    }
  });
  await new Promise(resolve => setTimeout(resolve, 15 * 60 * 1000));
  record({ observationEnded: new Date().toISOString(), uninterrupted: !disconnected });
  if (disconnected) throw Error('Tail disconnected: a complete quiet window was not observed');
} finally {
  socket.close();
  const removed = await fetch(`${endpoint}/${tail.id}`, { method: 'DELETE', headers });
  if (!removed.ok) throw Error(`Tail cleanup failed: HTTP ${removed.status}`);
}
// Node's WebSocket transport can retain idle handles after the tail is deleted.
process.exit(0);
