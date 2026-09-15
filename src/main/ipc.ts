import { ipcMain, BrowserWindow, session } from 'electron'
import * as store from './store'
import { fetchUser, avatarUrl, displayName } from './discord'
import { captureToken } from './tokenCapture'
import { buildInjection } from '../shared/inject'
import { partitionFor } from '../shared/util'
import type { AddAccountResult, Account } from '../shared/types'

function normalizeToken(raw: string): string {
  // Retire d'éventuels guillemets ou espaces collés au copier/coller.
  return raw.trim().replace(/^["']|["']$/g, '')
}

export function registerIpc(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('accounts:list', () => store.listAccounts())

  // Ajout manuel : nom optionnel + token collé à la main.
  ipcMain.handle(
    'accounts:add',
    async (_e, payload: { name?: string; token: string }): Promise<AddAccountResult> => {
      const token = normalizeToken(payload.token || '')
      if (!token) return { ok: false, error: 'Token vide.' }
      const user = await fetchUser(token)
      if (!user) return { ok: false, error: 'Token invalide ou expiré.' }
      const account = await store.addAccount(
        {
          name: payload.name?.trim() || displayName(user),
          userId: user.id,
          username: user.username,
          globalName: user.global_name ?? undefined,
          discriminator: user.discriminator,
          avatarUrl: avatarUrl(user)
        },
        token
      )
      return { ok: true, account }
    }
  )

  // Ajout via login intégré : capture auto puis stockage.
  ipcMain.handle('accounts:captureAdd', async (): Promise<AddAccountResult> => {
    const parent = getMainWindow() ?? undefined
    const result = await captureToken(parent)
    if (!result.ok || !result.token) {
      return { ok: false, error: result.error || 'Capture annulée.' }
    }
    const user = result.user ?? (await fetchUser(result.token))
    const account = await store.addAccount(
      {
        name: user ? displayName(user) : 'Compte Discord',
        userId: user?.id,
        username: user?.username,
        globalName: user?.global_name ?? undefined,
        discriminator: user?.discriminator,
        avatarUrl: user ? avatarUrl(user) : undefined
      },
      result.token
    )
    return { ok: true, account }
  })

  // Capture d'un token seul (ex : outil "récupérer mon token courant") sans créer de compte.
  ipcMain.handle('token:capture', async () => {
    const parent = getMainWindow() ?? undefined
    return captureToken(parent)
  })

  ipcMain.handle('accounts:rename', async (_e, id: string, name: string) => {
    return store.updateAccountMeta(id, { name: name.trim() })
  })

  ipcMain.handle('accounts:remove', async (_e, id: string) => {
    await store.removeAccount(id)
    // Nettoie aussi la session persistante du compte supprimé.
    try {
      await session.fromPartition(partitionFor(id)).clearStorageData()
    } catch {
      /* noop */
    }
    return true
  })

  ipcMain.handle('accounts:reorder', async (_e, ids: string[]) => {
    await store.reorder(ids)
    return true
  })

  // Rafraîchit avatar / pseudo depuis l'API Discord.
  ipcMain.handle('accounts:refresh', async (_e, id: string): Promise<Account | null> => {
    const token = await store.getToken(id)
    if (!token) return null
    const user = await fetchUser(token)
    if (!user) return null
    return store.updateAccountMeta(id, {
      userId: user.id,
      username: user.username,
      globalName: user.global_name ?? undefined,
      discriminator: user.discriminator,
      avatarUrl: avatarUrl(user)
    })
  })

  // Renvoie le script d'injection prêt à l'emploi pour la webview du compte.
  ipcMain.handle('accounts:injection', async (_e, id: string): Promise<string | null> => {
    const token = await store.getToken(id)
    if (!token) return null
    return buildInjection(token)
  })

  // Déconnexion : vide la session persistante (le compte redevient "à connecter").
  ipcMain.handle('accounts:logout', async (_e, id: string) => {
    try {
      await session.fromPartition(partitionFor(id)).clearStorageData()
    } catch {
      /* noop */
    }
    return true
  })

  ipcMain.handle('accounts:partition', (_e, id: string) => partitionFor(id))

  // Copier le token dans le presse-papier (outil pratique).
  ipcMain.handle('accounts:copyToken', async (_e, id: string): Promise<string | null> => {
    return store.getToken(id)
  })

  // Contrôles de fenêtre (barre de titre custom).
  ipcMain.handle('window:minimize', () => getMainWindow()?.minimize())
  ipcMain.handle('window:maximizeToggle', () => {
    const w = getMainWindow()
    if (!w) return false
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
    return w.isMaximized()
  })
  ipcMain.handle('window:close', () => getMainWindow()?.close())
  ipcMain.handle('window:isMaximized', () => getMainWindow()?.isMaximized() ?? false)
  ipcMain.handle('window:setFullscreen', (_e, value: boolean) => {
    const w = getMainWindow()
    if (w) w.setFullScreen(!!value)
    return w?.isFullScreen() ?? false
  })
  ipcMain.handle('window:isFullscreen', () => getMainWindow()?.isFullScreen() ?? false)
}
