import { app, safeStorage } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { Account, StoredAccount } from '../shared/types'

/**
 * Coffre-fort des comptes.
 * - Les métadonnées (nom, avatar, ordre) sont en clair.
 * - Le token est chiffré via safeStorage (DPAPI sous Windows), lié à la session Windows.
 * - Le fichier accounts.json ne contient donc jamais de token exploitable ailleurs.
 */

const FILE_NAME = 'accounts.json'

function filePath(): string {
  return join(app.getPath('userData'), FILE_NAME)
}

let cache: StoredAccount[] | null = null

async function readAll(): Promise<StoredAccount[]> {
  if (cache) return cache
  try {
    const raw = await fs.readFile(filePath(), 'utf-8')
    const parsed = JSON.parse(raw)
    cache = Array.isArray(parsed?.accounts) ? parsed.accounts : []
  } catch {
    cache = []
  }
  return cache!
}

async function writeAll(accounts: StoredAccount[]): Promise<void> {
  cache = accounts
  const payload = JSON.stringify({ version: 1, accounts }, null, 2)
  await fs.writeFile(filePath(), payload, 'utf-8')
}

function encrypt(token: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    // Repli : marqueur explicite pour ne jamais confondre avec du chiffré.
    return 'plain:' + Buffer.from(token, 'utf-8').toString('base64')
  }
  return 'enc:' + safeStorage.encryptString(token).toString('base64')
}

function decrypt(stored: string): string {
  if (stored.startsWith('plain:')) {
    return Buffer.from(stored.slice(6), 'base64').toString('utf-8')
  }
  if (stored.startsWith('enc:')) {
    return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
  }
  // Compat ancienne écriture sans préfixe.
  return safeStorage.decryptString(Buffer.from(stored, 'base64'))
}

/** Retire le token chiffré avant d'exposer au renderer. */
function toPublic(a: StoredAccount): Account {
  const { encryptedToken, ...pub } = a
  return pub
}

export async function listAccounts(): Promise<Account[]> {
  const all = await readAll()
  return [...all].sort((a, b) => a.order - b.order).map(toPublic)
}

export async function addAccount(
  data: Omit<Account, 'id' | 'createdAt' | 'order'>,
  token: string
): Promise<Account> {
  const all = await readAll()
  const maxOrder = all.reduce((m, a) => Math.max(m, a.order), -1)
  const account: StoredAccount = {
    ...data,
    id: randomUUID(),
    createdAt: Date.now(),
    order: maxOrder + 1,
    encryptedToken: encrypt(token)
  }
  all.push(account)
  await writeAll(all)
  return toPublic(account)
}

export async function updateAccountMeta(
  id: string,
  patch: Partial<Pick<Account, 'name' | 'username' | 'globalName' | 'avatarUrl' | 'discriminator' | 'userId'>>
): Promise<Account | null> {
  const all = await readAll()
  const acc = all.find((a) => a.id === id)
  if (!acc) return null
  Object.assign(acc, patch)
  await writeAll(all)
  return toPublic(acc)
}

export async function updateToken(id: string, token: string): Promise<void> {
  const all = await readAll()
  const acc = all.find((a) => a.id === id)
  if (!acc) return
  acc.encryptedToken = encrypt(token)
  await writeAll(all)
}

export async function removeAccount(id: string): Promise<void> {
  const all = await readAll()
  await writeAll(all.filter((a) => a.id !== id))
}

export async function reorder(orderedIds: string[]): Promise<void> {
  const all = await readAll()
  const index = new Map(orderedIds.map((id, i) => [id, i]))
  for (const a of all) {
    if (index.has(a.id)) a.order = index.get(a.id)!
  }
  await writeAll(all)
}

/** Renvoie le token en clair — usage interne/injection uniquement. */
export async function getToken(id: string): Promise<string | null> {
  const all = await readAll()
  const acc = all.find((a) => a.id === id)
  if (!acc) return null
  try {
    return decrypt(acc.encryptedToken)
  } catch {
    return null
  }
}

export { partitionFor } from '../shared/util'
