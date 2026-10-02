import './modern.css'
import './capture-preview.css'
import './mindmap.css'
import './auth.css'
import { createApp } from './app/app.js'
import { MindClutterRepository } from './repositories/mind-clutter-repository.js'
import { BrowserSpeechProvider } from './services/speech/browser-speech-provider.js'
import { supabase, supabaseConfigured } from './services/supabase.js'

const app = createApp({
  repository: new MindClutterRepository(),
  speechProvider: new BrowserSpeechProvider(),
  onSignOut: () => supabase.auth.signOut(),
})

async function startApp() {
  if (!supabaseConfigured) {
    renderMessage('Supabase is nog niet ingesteld. Kopieer .env.example naar .env en vul je projectgegevens in.')
    return
  }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    renderSignIn()
    return
  }
  await navigator.storage?.persist?.()
  try {
    await app.start()
  } catch (error) {
    const message = error?.code === 'PGRST205'
      ? 'De Supabase-tabel mind_clutters bestaat nog niet. Controleer de tabelnaam in je Supabase-project.'
      : `De gegevens konden niet worden geladen: ${error?.message || 'onbekende fout'}`
    renderMessage(message)
  }
}

function renderMessage(message) {
  document.querySelector('#app').innerHTML = `<main class="auth-shell"><section class="auth-card"><h1>UnClut</h1><p>${escapeHtml(message)}</p></section></main>`
}

function renderSignIn() {
  document.querySelector('#app').innerHTML = `<main class="auth-shell"><section class="auth-card"><p>Get it out of your head</p><h1>Log in om je gedachten overal te zien.</h1><p>We sturen een eenmalige inloglink naar je e-mailadres.</p><form id="sign-in-form"><label>E-mailadres<input type="email" name="email" required autocomplete="email"></label><button type="submit">Stuur inloglink</button></form><p class="auth-message" id="auth-message" aria-live="polite"></p></section></main>`
  document.querySelector('#sign-in-form').addEventListener('submit', async (event) => {
    event.preventDefault()
    const email = new FormData(event.target).get('email')
    const message = document.querySelector('#auth-message')
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
    message.textContent = error ? error.message : 'Controleer je inbox voor de inloglink.'
  })
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])
}

startApp()

if (supabaseConfigured) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) window.location.reload()
  })
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js'))
}
