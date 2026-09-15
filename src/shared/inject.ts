/**
 * Construit le script d'injection du token dans Discord Web.
 *
 * Discord verrouille l'accès direct à localStorage une fois chargé. L'astuce :
 * créer une <iframe> même-origine, dont le contentWindow expose un localStorage
 * « propre » partagé avec la page (même origine discord.com), y écrire le token,
 * puis recharger. Au rechargement, Discord lit ce token pendant son boot et ouvre
 * la session connectée.
 *
 * Le script est exécuté UNE seule fois par ouverture de webview (garde côté
 * renderer via injectionTried), ce qui évite toute boucle de rechargement :
 * - si un token est déjà présent (session persistée), on ne recharge pas ;
 * - sinon on écrit le token et on recharge une fois.
 */
export function buildInjection(token: string): string {
  const tokenLiteral = JSON.stringify(token)
  return `(() => {
    try {
      const TOKEN = ${tokenLiteral};
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      const ls = iframe.contentWindow.localStorage;
      const existing = ls.getItem('token');
      if (existing && existing.replace(/\\"/g, '').length > 20) {
        iframe.remove();
        return 'already-authed';
      }
      ls.setItem('token', JSON.stringify(TOKEN));
      iframe.remove();
      setTimeout(() => location.reload(), 200);
      return 'injected';
    } catch (e) {
      return 'error:' + (e && e.message ? e.message : String(e));
    }
  })();`
}
