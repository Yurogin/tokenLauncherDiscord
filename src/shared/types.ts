// Types partagés entre main, preload et renderer.

/** Métadonnées publiques d'un compte (JAMAIS le token en clair). */
export interface Account {
  id: string
  name: string
  userId?: string
  username?: string
  globalName?: string
  discriminator?: string
  avatarUrl?: string
  createdAt: number
  order: number
}

/** Forme stockée sur disque : métadonnées + token chiffré (base64 DPAPI). */
export interface StoredAccount extends Account {
  encryptedToken: string
}

/** Infos renvoyées par l'API Discord /users/@me lors de la validation d'un token. */
export interface DiscordUser {
  id: string
  username: string
  global_name?: string | null
  discriminator?: string
  avatar?: string | null
}

export interface AddAccountResult {
  ok: boolean
  account?: Account
  error?: string
}

export interface CaptureResult {
  ok: boolean
  token?: string
  user?: DiscordUser
  error?: string
}
