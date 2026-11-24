import { execFile } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import type { ShellPlatform } from './shells'

/** Lo que el gestor de sesiones necesita del sistema operativo para no dejar procesos huérfanos. */
export interface ProcessControl {
  /** PIDs vivos descendientes de `pid`, capturados antes del cierre (después se reasignan a init). */
  listDescendants(pid: number): number[]
  isAlive(pid: number): boolean
  /** Termina de golpe lo que siga vivo: el árbol del shell (si `shellAlive`) y los descendientes capturados. */
  forceKill(pid: number, shellAlive: boolean, descendants: readonly number[]): void
}

function sendSignal(pid: number, signal: NodeJS.Signals | 0): boolean {
  try {
    process.kill(pid, signal)
    return true
  } catch (error) {
    // ESRCH: ya no existe. EPERM: existe pero no es nuestro, así que no lo tocamos.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** `/proc/<pid>/stat` es `pid (comm) estado ppid ...`; `comm` puede contener paréntesis y espacios. */
function readLinuxStat(pid: number): { state: string; ppid: number } | null {
  try {
    const stat = readFileSync(`/proc/${String(pid)}/stat`, 'utf8')
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    const state = fields[0]
    const ppid = Number(fields[1])
    return state === undefined || !Number.isInteger(ppid) ? null : { state, ppid }
  } catch {
    return null
  }
}

const linuxControl: ProcessControl = {
  listDescendants: (pid) => {
    const children = new Map<number, number[]>()
    for (const entry of readdirSync('/proc')) {
      const candidate = Number(entry)
      const stat = Number.isInteger(candidate) ? readLinuxStat(candidate) : null
      if (stat !== null) {
        children.set(stat.ppid, [...(children.get(stat.ppid) ?? []), candidate])
      }
    }
    const found: number[] = []
    const pending = [pid]
    for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
      for (const child of children.get(current) ?? []) {
        found.push(child)
        pending.push(child)
      }
    }
    return found
  },
  // Un zombi (estado Z) ya terminó: solo espera a que su padre lo recoja.
  isAlive: (pid) => {
    const stat = readLinuxStat(pid)
    return stat !== null && stat.state !== 'Z'
  },
  forceKill: (pid, shellAlive, descendants) => {
    if (shellAlive) {
      // node-pty crea una sesión nueva (setsid): su grupo de procesos es el PID del shell.
      sendSignal(-pid, 'SIGKILL')
      sendSignal(pid, 'SIGKILL')
    }
    // ponytail: el PID podría reutilizarse en el plazo de cierre; improbable en unos segundos.
    descendants
      .filter((candidate) => linuxControl.isAlive(candidate))
      .forEach((candidate) => {
        sendSignal(candidate, 'SIGKILL')
      })
  },
}

// En Windows, cerrar el pseudoconsola de ConPTY ya termina los procesos conectados
// (medido: con pty.kill() el hijo muere; sin cerrar, sigue vivo). taskkill solo
// entra si el shell no responde al cierre.
const windowsControl: ProcessControl = {
  listDescendants: () => [],
  isAlive: (pid) => sendSignal(pid, 0),
  forceKill: (pid, shellAlive) => {
    if (shellAlive) {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => {
        // El resultado no importa: si el proceso ya no existe, no hay nada que terminar.
      })
    }
  },
}

export function createProcessControl(platform: ShellPlatform): ProcessControl {
  return platform === 'win32' ? windowsControl : linuxControl
}
