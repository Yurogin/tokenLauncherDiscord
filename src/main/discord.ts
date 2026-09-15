import type { DiscordUser } from '../shared/types'

const API = 'https://discord.com/api/v9'

/** Construit l'URL d'avatar (ou une image par défaut) à partir des infos utilisateur. */
export function avatarUrl(user: DiscordUser): string {
  if (user.avatar) {
    const ext = user.avatar.startsWith('a_') ? 'gif' : 'png'
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=128`
  }
  // Avatar par défaut Discord (basé sur l'ID pour le nouveau système de pseudos).
  const idx = Number((BigInt(user.id) >> 22n) % 6n)
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`
}

/**
 * Valide un token en appelant /users/@me.
 * Renvoie l'utilisateur si le token est valide, sinon null.
 */
export async function fetchUser(token: string): Promise<DiscordUser | null> {
  try {
    const res = await fetch(`${API}/users/@me`, {
      headers: {
        Authorization: token,
        'Content-Type': 'application/json'
      }
    })
    if (!res.ok) return null
    const data = (await res.json()) as DiscordUser
    if (!data?.id) return null
    return data
  } catch {
    return null
  }
}

/** Nom d'affichage préféré : global_name (pseudo) sinon username. */
export function displayName(user: DiscordUser): string {
  return user.global_name || user.username || 'Compte Discord'
}
