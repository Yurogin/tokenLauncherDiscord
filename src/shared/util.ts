/** Identifiant de partition de session Electron, isolé par compte.
 *  Défini ici pour être partagé entre main (session) et renderer (webview). */
export function partitionFor(id: string): string {
  return `persist:acct-${id}`
}
