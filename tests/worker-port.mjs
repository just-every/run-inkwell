import { mkdir, readFile, rmdir } from 'node:fs/promises'
import { rmdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let nextPort = process.pid

// Worker listeners must stay below the kernel's ephemeral range: closing a
// listen(0) probe otherwise lets an unrelated outbound connection take its port.
// A shared lease also keeps concurrent harnesses from choosing the same port
// between the probe and workerd's bind. Hold it until the Worker has stopped.
export async function reserveWorkerPort() {
  const ephemeralStart = process.platform === 'linux'
    ? Number((await readFile('/proc/sys/net/ipv4/ip_local_port_range', 'utf8')).trim().split(/\s+/)[0])
    : 49152
  const directory = join(tmpdir(), 'inkwell-worker-ports')
  await mkdir(directory, { recursive: true })
  const count = Math.min(20000, ephemeralStart) - 12000
  // Fresh origins also avoid pooled connections to an already disposed Worker.
  for (let attempt = 0; attempt < count; attempt++) {
    const port = 12000 + nextPort++ % count
    const lease = join(directory, String(port))
    try { await mkdir(lease) } catch (error) { if (error.code === 'EEXIST') continue; throw error }
    const socket = createServer()
    try {
      await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(port, '127.0.0.1', resolve) })
      await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()))
    } catch (error) {
      await rmdir(lease)
      if (error.code === 'EADDRINUSE') continue
      throw error
    }
    const onExit = () => { rmdirSync(lease) }
    process.once('exit', onExit)
    return { port, origin: `http://127.0.0.1:${port}`, async release() { process.removeListener('exit', onExit); await rmdir(lease) } }
  }
  throw new Error('No test Worker port available below the kernel ephemeral range')
}
