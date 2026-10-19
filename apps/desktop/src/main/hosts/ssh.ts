import { spawn, type ChildProcess } from 'node:child_process'
import { createConnection, createServer } from 'node:net'

/** OpenSSH existente, com chave/agente/configuração e host conhecido. Nunca aceita senha ou chave desconhecida. */
export async function openSshTunnel(destination: string, remotePort: number): Promise<{ endpoint: string; close(): void }> {
  if (!/^(?:[a-zA-Z0-9_][a-zA-Z0-9_.-]*@)?[a-zA-Z0-9][a-zA-Z0-9_.-]*(?::[0-9]{1,5})?$/.test(destination)) throw new Error('Use usuário@host ou um alias do OpenSSH, opcionalmente com :porta.')
  const [target, port = '22'] = destination.split(':')
  if (+port < 1 || +port > 65535) throw new Error('Porta SSH inválida.')
  const reservation = createServer()
  await new Promise<void>((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve) })
  const address = reservation.address()
  if (!address || typeof address === 'string') throw new Error('Porta local indisponível.')
  await new Promise<void>(resolve => reservation.close(() => resolve()))
  const process: ChildProcess = spawn('ssh', ['-N', '-T', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=2', '-L', `127.0.0.1:${address.port}:127.0.0.1:${remotePort}`, '-p', port, target], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  let failed = false
  process.on('error', () => { failed = true })
  process.on('exit', () => { failed = true })
  process.stderr?.resume()
  const deadline = Date.now() + 11_000
  try {
    await new Promise<void>((ready, reject) => {
      const probe = () => {
        if (failed || Date.now() > deadline) { reject(new Error('Não foi possível abrir o túnel SSH. Verifique a chave, o host conhecido e a porta do Boobot.')); return }
        const socket = createConnection({ host: '127.0.0.1', port: address.port })
        socket.once('connect', () => { socket.destroy(); ready() })
        socket.once('error', () => { socket.destroy(); setTimeout(probe, 75) })
      }
      probe()
    })
  } catch (error) { process.kill(); throw error }
  return { endpoint: `ws://127.0.0.1:${address.port}/boobot`, close: () => { if (!failed) process.kill() } }
}
