import { BrowserWindow, session } from 'electron'
import { randomUUID } from 'crypto'
import type { CaptureResult } from '../shared/types'
import { fetchUser } from './discord'

/**
 * Ouvre une vraie fenêtre de login Discord dans une session temporaire isolée,
 * puis intercepte l'en-tête Authorization dès que l'utilisateur se connecte.
 * La fenêtre se ferme automatiquement une fois le token capturé.
 */
export function captureToken(parent?: BrowserWindow): Promise<CaptureResult> {
  return new Promise((resolve) => {
    // Session éphémère : la fenêtre de capture part toujours déconnectée.
    const partition = `capture-${randomUUID()}`
    const ses = session.fromPartition(partition)

    let settled = false
    const finish = (result: CaptureResult) => {
      if (settled) return
      settled = true
      try {
        ses.webRequest.onBeforeSendHeaders(null)
      } catch {
        /* noop */
      }
      if (!win.isDestroyed()) win.close()
      resolve(result)
    }

    const win = new BrowserWindow({
      width: 520,
      height: 720,
      parent,
      modal: !!parent,
      autoHideMenuBar: true,
      title: 'Connexion Discord — capture du token',
      backgroundColor: '#313338',
      webPreferences: {
        partition,
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    // Interception de l'en-tête Authorization sur les appels API Discord.
    ses.webRequest.onBeforeSendHeaders(
      { urls: ['https://discord.com/api/*', 'https://*.discord.com/api/*'] },
      (details, callback) => {
        const headers = details.requestHeaders || {}
        const auth =
          headers['Authorization'] || headers['authorization'] || (headers as any)['AUTHORIZATION']
        if (auth && typeof auth === 'string' && auth.length > 20 && !auth.startsWith('Bearer')) {
          const token = auth
          // Valide le token puis renvoie l'utilisateur avant de fermer.
          fetchUser(token).then((user) => {
            finish({ ok: true, token, user: user ?? undefined })
          })
        }
        callback({ requestHeaders: details.requestHeaders })
      }
    )

    win.on('closed', () => {
      finish({ ok: false, error: 'Fenêtre fermée avant la connexion.' })
    })

    win.loadURL('https://discord.com/login')
  })
}
