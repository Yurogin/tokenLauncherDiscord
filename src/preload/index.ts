import { contextBridge, ipcRenderer, clipboard } from 'electron'
import type { Account, AddAccountResult, CaptureResult } from '../shared/types'

const api = {
  listAccounts: (): Promise<Account[]> => ipcRenderer.invoke('accounts:list'),

  addAccount: (name: string, token: string): Promise<AddAccountResult> =>
    ipcRenderer.invoke('accounts:add', { name, token }),

  captureAddAccount: (): Promise<AddAccountResult> => ipcRenderer.invoke('accounts:captureAdd'),

  captureToken: (): Promise<CaptureResult> => ipcRenderer.invoke('token:capture'),

  renameAccount: (id: string, name: string): Promise<Account | null> =>
    ipcRenderer.invoke('accounts:rename', id, name),

  removeAccount: (id: string): Promise<boolean> => ipcRenderer.invoke('accounts:remove', id),

  reorderAccounts: (ids: string[]): Promise<boolean> =>
    ipcRenderer.invoke('accounts:reorder', ids),

  refreshAccount: (id: string): Promise<Account | null> =>
    ipcRenderer.invoke('accounts:refresh', id),

  getInjection: (id: string): Promise<string | null> =>
    ipcRenderer.invoke('accounts:injection', id),

  logoutAccount: (id: string): Promise<boolean> => ipcRenderer.invoke('accounts:logout', id),

  partitionFor: (id: string): Promise<string> => ipcRenderer.invoke('accounts:partition', id),

  copyTokenToClipboard: async (id: string): Promise<boolean> => {
    const token: string | null = await ipcRenderer.invoke('accounts:copyToken', id)
    if (!token) return false
    clipboard.writeText(token)
    return true
  },

  copyText: (text: string): void => clipboard.writeText(text),

  // Contrôles fenêtre
  windowMinimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  windowMaximizeToggle: (): Promise<boolean> => ipcRenderer.invoke('window:maximizeToggle'),
  windowClose: (): Promise<void> => ipcRenderer.invoke('window:close'),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  windowSetFullscreen: (value: boolean): Promise<boolean> =>
    ipcRenderer.invoke('window:setFullscreen', value),
  windowIsFullscreen: (): Promise<boolean> => ipcRenderer.invoke('window:isFullscreen')
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
