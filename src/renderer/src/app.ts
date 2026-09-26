import type { Api } from '../../preload'
import type { Account } from '../../shared/types'
import { partitionFor } from '../../shared/util'

declare global {
  interface Window {
    api: Api
  }
}
const api = window.api

// ---------- État ----------
let accounts: Account[] = []
const openTabs: string[] = [] // ids ouverts, dans l'ordre
let activeId: string | null = null

interface WebviewEntry {
  wrap: HTMLDivElement
  webview: Electron.WebviewTag
  loading: HTMLDivElement
  injectionTried: boolean
}
const webviews = new Map<string, WebviewEntry>()

// ---------- Raccourcis DOM ----------
const $ = <T extends HTMLElement = HTMLElement>(sel: string): T =>
  document.querySelector(sel) as T
const listEl = $('#account-list')
const countEl = $('#account-count')
const tabsEl = $('#tabsbar')
const webviewsEl = $<HTMLDivElement>('#webviews')
const welcomeEl = $<HTMLDivElement>('#welcome')

// ---------- Toasts ----------
function toast(message: string, kind: 'info' | 'success' | 'error' = 'info'): void {
  const el = document.createElement('div')
  el.className = `toast toast--${kind}`
  el.textContent = message
  $('#toasts').appendChild(el)
  setTimeout(() => {
    el.style.opacity = '0'
    el.style.transition = 'opacity .3s'
    setTimeout(() => el.remove(), 300)
  }, 3200)
}

// ---------- Chargement des comptes ----------
async function loadAccounts(): Promise<void> {
  accounts = await api.listAccounts()
  renderList()
}

function accountById(id: string): Account | undefined {
  return accounts.find((a) => a.id === id)
}

// ---------- Rendu de la liste ----------
function renderList(): void {
  countEl.textContent = String(accounts.length)
  listEl.innerHTML = ''

  if (accounts.length === 0) {
    const hint = document.createElement('div')
    hint.className = 'empty-hint'
    hint.innerHTML = 'Aucun compte pour l’instant.<br />Ajoute-en un via le bouton ci-dessous.'
    listEl.appendChild(hint)
    return
  }

  for (const acc of accounts) {
    const card = document.createElement('div')
    card.className = 'account' + (openTabs.includes(acc.id) ? ' is-open' : '')
    card.dataset.id = acc.id

    const avatarWrap = document.createElement('div')
    avatarWrap.className = 'account__avatar-wrap'
    const avatar = document.createElement('img')
    avatar.className = 'account__avatar'
    avatar.src = acc.avatarUrl || defaultAvatar()
    avatar.onerror = () => (avatar.src = defaultAvatar())
    avatarWrap.appendChild(avatar)
    if (webviews.has(acc.id)) {
      const dot = document.createElement('span')
      dot.className = 'account__dot ' + (openTabs.includes(acc.id) ? 'is-open' : 'is-bg')
      dot.title = openTabs.includes(acc.id) ? 'Onglet ouvert' : 'Actif en arrière-plan'
      avatarWrap.appendChild(dot)
    }

    const body = document.createElement('div')
    body.className = 'account__body'
    const name = document.createElement('div')
    name.className = 'account__name'
    name.textContent = acc.name
    const sub = document.createElement('div')
    sub.className = 'account__sub'
    sub.textContent = acc.username ? '@' + acc.username : 'Compte Discord'
    body.append(name, sub)

    const menuBtn = document.createElement('button')
    menuBtn.className = 'account__menu-btn'
    menuBtn.textContent = '⋯'
    menuBtn.title = 'Options'
    menuBtn.onclick = (e) => {
      e.stopPropagation()
      openContextMenu(acc, menuBtn.getBoundingClientRect().left, menuBtn.getBoundingClientRect().bottom)
    }

    card.append(avatarWrap, body, menuBtn)
    card.onclick = () => openAccount(acc.id)
    card.oncontextmenu = (e) => {
      e.preventDefault()
      openContextMenu(acc, e.clientX, e.clientY)
    }
    listEl.appendChild(card)
  }
}

function defaultAvatar(): string {
  return 'https://cdn.discordapp.com/embed/avatars/0.png'
}

// ---------- Ouverture d'un compte (webview) ----------
function openAccount(id: string): void {
  if (!accountById(id)) return
  if (!openTabs.includes(id)) openTabs.push(id)
  ensureWebview(id)
  setActive(id)
  renderTabs()
  renderList()
}

function ensureWebview(id: string): void {
  if (webviews.has(id)) return

  const wrap = document.createElement('div')
  wrap.className = 'wv-wrap'

  const loading = document.createElement('div')
  loading.className = 'wv-loading'
  loading.innerHTML =
    '<div class="spinner"></div><div class="wv-loading__text">Connexion à Discord…</div>'

  const webview = document.createElement('webview') as Electron.WebviewTag
  webview.setAttribute('partition', partitionFor(id))
  webview.setAttribute('src', 'https://discord.com/channels/@me')
  webview.setAttribute('allowpopups', 'true')

  const entry: WebviewEntry = { wrap, webview, loading, injectionTried: false }

  // Injecte le token une seule fois, au premier dom-ready.
  // (Le script gère lui-même le cas "déjà connecté" pour éviter toute boucle.)
  const maybeInject = async (): Promise<void> => {
    if (entry.injectionTried) return
    entry.injectionTried = true
    const script = await api.getInjection(id)
    if (!script) return
    try {
      const result = await webview.executeJavaScript(script)
      console.log(`[inject ${id}]`, result)
    } catch (err) {
      console.warn(`[inject ${id}] échec`, err)
    }
  }

  webview.addEventListener('dom-ready', maybeInject)
  webview.addEventListener('did-finish-load', () => {
    // Masque l'overlay une fois le chargement terminé (app ou écran de login).
    loading.classList.add('is-hidden')
  })
  webview.addEventListener('did-fail-load', (e: any) => {
    if (e.errorCode && e.errorCode !== -3) {
      loading.querySelector('.wv-loading__text')!.textContent =
        'Échec du chargement. Vérifie ta connexion.'
    }
  })

  wrap.append(loading, webview)
  webviewsEl.appendChild(wrap)
  webviews.set(id, entry)
}

function setActive(id: string): void {
  activeId = id
  welcomeEl.hidden = openTabs.length > 0
  for (const [wid, entry] of webviews) {
    entry.wrap.classList.toggle('is-active', wid === id)
  }
  renderTabs()
}

function closeTab(id: string): void {
  const idx = openTabs.indexOf(id)
  if (idx === -1) return
  openTabs.splice(idx, 1)

  const entry = webviews.get(id)
  if (entry) {
    entry.wrap.remove()
    webviews.delete(id)
  }

  if (activeId === id) {
    const next = openTabs[idx] || openTabs[idx - 1] || null
    if (next) setActive(next)
    else {
      activeId = null
      welcomeEl.hidden = false
    }
  }
  renderTabs()
  renderList()
}

/** Retire l'onglet de la barre SANS détruire la webview :
 *  la session reste connectée en arrière-plan et se rouvre instantanément. */
function setAside(id: string): void {
  const idx = openTabs.indexOf(id)
  if (idx === -1) return
  openTabs.splice(idx, 1)

  const entry = webviews.get(id)
  if (entry) entry.wrap.classList.remove('is-active') // reste dans le DOM, juste masquée

  if (activeId === id) {
    const next = openTabs[idx] || openTabs[idx - 1] || null
    if (next) setActive(next)
    else {
      activeId = null
      welcomeEl.hidden = false
    }
  }
  renderTabs()
  renderList()
  toast('Compte mis de côté — toujours connecté en arrière-plan.', 'info')
}

// ---------- Rendu des onglets ----------
function renderTabs(): void {
  tabsEl.innerHTML = ''
  for (const id of openTabs) {
    const acc = accountById(id)
    if (!acc) continue
    const tab = document.createElement('div')
    tab.className = 'tab' + (id === activeId ? ' is-active' : '')

    const av = document.createElement('img')
    av.className = 'tab__avatar'
    av.src = acc.avatarUrl || defaultAvatar()
    av.onerror = () => (av.src = defaultAvatar())

    const label = document.createElement('span')
    label.className = 'tab__label'
    label.textContent = acc.name

    const aside = document.createElement('button')
    aside.className = 'tab__btn'
    aside.textContent = '–'
    aside.title = 'Mettre de côté (garder connecté en arrière-plan)'
    aside.onclick = (e) => {
      e.stopPropagation()
      setAside(id)
    }

    const close = document.createElement('button')
    close.className = 'tab__btn tab__close'
    close.textContent = '×'
    close.title = 'Fermer (déconnecte la session affichée)'
    close.onclick = (e) => {
      e.stopPropagation()
      closeTab(id)
    }

    tab.append(av, label, aside, close)
    tab.onclick = () => setActive(id)
    tabsEl.appendChild(tab)
  }

  if (openTabs.length > 0) {
    const spacer = document.createElement('div')
    spacer.className = 'tabs-spacer'
    const fsBtn = document.createElement('button')
    fsBtn.className = 'tabs-fs'
    fsBtn.title = 'Plein écran immersif (F11)'
    fsBtn.textContent = '⤢'
    fsBtn.onclick = () => toggleImmersive()
    tabsEl.append(spacer, fsBtn)
  }
}

// ---------- Mode plein écran immersif ----------
let immersive = false
async function setImmersive(on: boolean): Promise<void> {
  immersive = on
  document.body.classList.toggle('immersive', on)
  try {
    await api.windowSetFullscreen(on)
  } catch {
    /* noop */
  }
}
function toggleImmersive(): void {
  void setImmersive(!immersive)
}

// ---------- Menu contextuel ----------
let currentMenu: HTMLElement | null = null
function closeMenu(): void {
  currentMenu?.remove()
  currentMenu = null
}
document.addEventListener('click', closeMenu)
document.addEventListener('scroll', closeMenu, true)

function openContextMenu(acc: Account, x: number, y: number): void {
  closeMenu()
  const menu = document.createElement('div')
  menu.className = 'ctx-menu'

  const item = (label: string, fn: () => void, danger = false): void => {
    const b = document.createElement('button')
    b.className = 'ctx-item' + (danger ? ' ctx-item--danger' : '')
    b.textContent = label
    b.onclick = (e) => {
      e.stopPropagation()
      closeMenu()
      fn()
    }
    menu.appendChild(b)
  }
  const sep = (): void => {
    const s = document.createElement('div')
    s.className = 'ctx-sep'
    menu.appendChild(s)
  }

  item('Ouvrir', () => openAccount(acc.id))
  if (openTabs.includes(acc.id)) item('Mettre de côté', () => setAside(acc.id))
  if (webviews.has(acc.id)) item('Recharger', () => reloadAccount(acc.id))
  item('Renommer', () => renameAccount(acc))
  item('Rafraîchir les infos', () => refreshAccount(acc.id))
  sep()
  item('Copier le token', () => copyToken(acc.id))
  item('Se déconnecter (vider la session)', () => logoutAccount(acc.id))
  sep()
  item('Supprimer le compte', () => deleteAccount(acc), true)

  menu.style.left = '0px'
  menu.style.top = '0px'
  document.body.appendChild(menu)
  const rect = menu.getBoundingClientRect()
  const px = Math.min(x, window.innerWidth - rect.width - 8)
  const py = Math.min(y, window.innerHeight - rect.height - 8)
  menu.style.left = px + 'px'
  menu.style.top = py + 'px'
  currentMenu = menu
}

// ---------- Actions compte ----------
function reloadAccount(id: string): void {
  const entry = webviews.get(id)
  if (!entry) return
  entry.loading.classList.remove('is-hidden')
  entry.webview.reload()
}

async function refreshAccount(id: string): Promise<void> {
  const updated = await api.refreshAccount(id)
  if (updated) {
    await loadAccounts()
    renderTabs()
    toast('Infos mises à jour.', 'success')
  } else {
    toast('Impossible de rafraîchir (token invalide ?).', 'error')
  }
}

async function copyToken(id: string): Promise<void> {
  const ok = await api.copyTokenToClipboard(id)
  toast(ok ? 'Token copié dans le presse-papier.' : 'Token introuvable.', ok ? 'success' : 'error')
}

async function logoutAccount(id: string): Promise<void> {
  await api.logoutAccount(id)
  const entry = webviews.get(id)
  if (entry) {
    entry.injectionTried = false
    entry.loading.classList.remove('is-hidden')
    entry.webview.loadURL('https://discord.com/channels/@me')
  }
  toast('Session vidée. Reconnexion au prochain accès.', 'info')
}

async function deleteAccount(acc: Account): Promise<void> {
  confirmModal(
    'Supprimer ce compte ?',
    `« ${acc.name} » et son token seront définitivement retirés du launcher.`,
    'Supprimer',
    async () => {
      if (openTabs.includes(acc.id)) closeTab(acc.id)
      await api.removeAccount(acc.id)
      await loadAccounts()
      toast('Compte supprimé.', 'success')
    }
  )
}

function renameAccount(acc: Account): void {
  formModal({
    title: 'Renommer le compte',
    fields: [{ name: 'name', label: 'Nom', value: acc.name, type: 'input' }],
    submitLabel: 'Enregistrer',
    onSubmit: async (vals) => {
      const name = vals.name.trim()
      if (!name) return 'Le nom ne peut pas être vide.'
      await api.renameAccount(acc.id, name)
      await loadAccounts()
      renderTabs()
      toast('Compte renommé.', 'success')
      return null
    }
  })
}

// ---------- Ajout de compte ----------
async function addViaLogin(): Promise<void> {
  toast('Ouverture de la fenêtre de connexion Discord…', 'info')
  const res = await api.captureAddAccount()
  if (res.ok && res.account) {
    await loadAccounts()
    toast(`Compte « ${res.account.name} » ajouté.`, 'success')
    openAccount(res.account.id)
  } else {
    toast(res.error || 'Ajout annulé.', 'error')
  }
}

function addViaToken(): void {
  formModal({
    title: 'Ajouter via un token',
    description: 'Colle un token Discord. Il sera validé puis chiffré localement.',
    fields: [
      { name: 'name', label: 'Nom (optionnel)', value: '', type: 'input' },
      { name: 'token', label: 'Token', value: '', type: 'textarea' }
    ],
    submitLabel: 'Ajouter',
    onSubmit: async (vals) => {
      if (!vals.token.trim()) return 'Le token est requis.'
      const res = await api.addAccount(vals.name, vals.token)
      if (!res.ok || !res.account) return res.error || 'Token invalide.'
      await loadAccounts()
      toast(`Compte « ${res.account.name} » ajouté.`, 'success')
      openAccount(res.account.id)
      return null
    }
  })
}

async function grabCurrentToken(): Promise<void> {
  // Le compte affiché dans l'onglet actif : on révèle son token déjà enregistré.
  if (activeId) {
    const acc = accounts.find((a) => a.id === activeId)
    const token = await api.getToken(activeId)
    if (token) {
      showTokenModal(acc?.name ?? 'ce compte', token, true)
      return
    }
    toast('Token introuvable pour ce compte.', 'error')
    return
  }
  // Aucun compte ouvert : on ouvre une fenêtre de connexion pour en capturer un.
  toast('Ouvre un compte, ou connecte-toi dans la fenêtre pour révéler ton token…', 'info')
  const res = await api.captureToken()
  if (!res.ok || !res.token) {
    toast(res.error || 'Capture annulée.', 'error')
    return
  }
  const name = res.user ? res.user.global_name || res.user.username : 'ton compte'
  showTokenModal(name || 'ton compte', res.token)
}

// ---------- Modales ----------
const backdrop = $<HTMLDivElement>('#modal-backdrop')
const modalEl = $<HTMLDivElement>('#modal')

function closeModal(): void {
  backdrop.hidden = true
  modalEl.innerHTML = ''
}
backdrop.addEventListener('click', (e) => {
  if (e.target === backdrop) closeModal()
})

interface Field {
  name: string
  label: string
  value: string
  type: 'input' | 'textarea'
}
function formModal(opts: {
  title: string
  description?: string
  fields: Field[]
  submitLabel: string
  onSubmit: (vals: Record<string, string>) => Promise<string | null>
}): void {
  modalEl.innerHTML = ''
  const h = document.createElement('h3')
  h.textContent = opts.title
  modalEl.appendChild(h)
  if (opts.description) {
    const p = document.createElement('p')
    p.textContent = opts.description
    modalEl.appendChild(p)
  }

  const inputs: Record<string, HTMLInputElement | HTMLTextAreaElement> = {}
  for (const f of opts.fields) {
    const lab = document.createElement('label')
    lab.textContent = f.label
    lab.style.marginTop = '14px'
    const el =
      f.type === 'textarea'
        ? document.createElement('textarea')
        : document.createElement('input')
    el.className = f.type === 'textarea' ? 'textarea' : 'input'
    el.value = f.value
    if (el instanceof HTMLInputElement) el.type = 'text'
    inputs[f.name] = el
    modalEl.append(lab, el)
  }

  const err = document.createElement('div')
  err.className = 'modal__error'

  const actions = document.createElement('div')
  actions.className = 'modal__actions'
  const cancel = document.createElement('button')
  cancel.className = 'btn btn--ghost'
  cancel.textContent = 'Annuler'
  cancel.onclick = closeModal
  const submit = document.createElement('button')
  submit.className = 'btn btn--primary'
  submit.textContent = opts.submitLabel
  const doSubmit = async (): Promise<void> => {
    submit.disabled = true
    err.textContent = ''
    const vals: Record<string, string> = {}
    for (const k in inputs) vals[k] = inputs[k].value
    const res = await opts.onSubmit(vals)
    if (res) {
      err.textContent = res
      submit.disabled = false
    } else {
      closeModal()
    }
  }
  submit.onclick = doSubmit
  actions.append(cancel, submit)
  modalEl.append(err, actions)

  backdrop.hidden = false
  const first = opts.fields[0]
  if (first) inputs[first.name].focus()
  modalEl.querySelectorAll('input').forEach((el) =>
    el.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') doSubmit()
    })
  )
}

function confirmModal(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void
): void {
  modalEl.innerHTML = ''
  const h = document.createElement('h3')
  h.textContent = title
  const p = document.createElement('p')
  p.textContent = message
  const actions = document.createElement('div')
  actions.className = 'modal__actions'
  const cancel = document.createElement('button')
  cancel.className = 'btn btn--ghost'
  cancel.textContent = 'Annuler'
  cancel.onclick = closeModal
  const ok = document.createElement('button')
  ok.className = 'btn btn--danger'
  ok.textContent = confirmLabel
  ok.onclick = () => {
    closeModal()
    onConfirm()
  }
  actions.append(cancel, ok)
  modalEl.append(h, p, actions)
  backdrop.hidden = false
}

function showTokenModal(name: string, token: string, alreadySaved = false): void {
  modalEl.innerHTML = ''
  const h = document.createElement('h3')
  h.textContent = 'Token récupéré'
  const p = document.createElement('p')
  p.textContent = `Voici le token de « ${name} ». Garde-le secret : il donne un accès complet au compte.`
  const ta = document.createElement('textarea')
  ta.className = 'textarea'
  ta.value = token
  ta.readOnly = true
  ta.style.minHeight = '70px'
  ta.onclick = () => ta.select()

  const actions = document.createElement('div')
  actions.className = 'modal__actions'
  const copy = document.createElement('button')
  copy.className = 'btn btn--ghost'
  copy.textContent = 'Copier'
  copy.onclick = () => {
    api.copyText(token)
    toast('Token copié.', 'success')
  }
  actions.append(copy)
  if (!alreadySaved) {
    const save = document.createElement('button')
    save.className = 'btn btn--primary'
    save.textContent = 'Enregistrer comme compte'
    save.onclick = async () => {
      const res = await api.addAccount(name, token)
      if (res.ok && res.account) {
        await loadAccounts()
        toast(`Compte « ${res.account.name} » ajouté.`, 'success')
        closeModal()
      } else {
        toast(res.error || 'Échec de l’enregistrement.', 'error')
      }
    }
    actions.append(save)
  }
  modalEl.append(h, p, ta, actions)
  backdrop.hidden = false
}

// ---------- Contrôles fenêtre ----------
$('#btn-min').onclick = () => api.windowMinimize()
$('#btn-max').onclick = () => api.windowMaximizeToggle()
$('#btn-close').onclick = () => api.windowClose()

// ---------- Boutons ----------
$('#btn-add-login').onclick = addViaLogin
$('#btn-add-login-2').onclick = addViaLogin
$('#btn-add-token').onclick = addViaToken
const grabBtn = $('#btn-grab-token')
grabBtn.onclick = grabCurrentToken
grabBtn.title = 'Révèle le token du compte ouvert (F9, marche aussi en plein écran)'

// Pastille flottante pour quitter le mode immersif.
const exitPill = document.createElement('button')
exitPill.className = 'immersive-exit'
exitPill.textContent = '⤢  Quitter le plein écran (Échap)'
exitPill.onclick = () => setImmersive(false)
document.body.appendChild(exitPill)

document.addEventListener('keydown', (e) => {
  if (e.key === 'F11') {
    e.preventDefault()
    toggleImmersive()
    return
  }
  if (e.key === 'F9') {
    e.preventDefault()
    void grabCurrentToken()
    return
  }
  if (e.key === 'Escape') {
    if (immersive) {
      void setImmersive(false)
      return
    }
    closeModal()
    closeMenu()
  }
})

// ---------- Démarrage ----------
loadAccounts()
