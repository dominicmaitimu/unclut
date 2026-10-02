import { addAction, createMindClutter, removeAction, toggleActionDone, updateAction, updateMindClutter } from '../domain/mind-clutter.js'
import { splitCaptureText } from '../domain/capture-segmentation.js'
import { childConnectionPath, childLayout, gridPositions, mapBounds, mapNodePosition, mindMapTemplate } from '../components/mind-map.js'

const statusLabels = { thought: 'Losse clutter', developing: 'In ontwikkeling', taking_shape: 'Krijgt vorm', ready_to_act: 'Klaar om te handelen', archived: 'Gearchiveerd' }

export function createApp({ repository, speechProvider, onSignOut }) {
  let mindClutters = []
  let selectedId = null
  let focusedId = null
  let searchTerm = ''
  let showArchived = false
  let listening = false
  let captureItems = []
  let isLoading = false
    let isOnline = navigator.onLine
    let undoAction = readUndoAction()
    let sortMode = 'updated'
    let syncMessage = ''
    document.querySelector('.memory-app')?.insertAdjacentHTML('afterbegin', `<div class="connection-status ${isOnline ? 'is-online' : 'is-offline'}" role="status">${escapeHtml(syncMessage || (isOnline ? 'Online' : 'Offline - wijzigingen worden lokaal bewaard'))}</div>`)
  let undoTimer = null
  let camera = { x: 0, y: 0, zoom: 1 }
  let theme = localStorage.getItem('mindclutterss-theme') || 'light'
  let pointerState = null
  let eventsBound = false

  async function start() {
    mindClutters = await repository.list({ includeArchived: true })
    if (undoAction) undoTimer = setTimeout(() => { undoAction = null; localStorage.removeItem('unclut-undo'); render() }, 8000)
    applyTheme()
    render()
  }

  function render() {
    const visibleMindClutters = filterMindClutters()
    const searchWasFocused = document.activeElement?.name === 'mind-clutter-search'
    document.querySelector('#app').innerHTML = `<main class="memory-app"><header class="memory-header"><div class="wordmark"><span class="thought-mark" aria-hidden="true"></span><div><p>Get it out of your head</p><h1>UnClut</h1></div></div><div class="header-actions"><label class="search-field"><span class="search-icon" aria-hidden="true">⌕</span><input name="mind-clutter-search" type="search" value="${escapeHtml(searchTerm)}" placeholder="Zoek in clutters..." aria-label="Zoek in clutters"></label><button class="theme-toggle" type="button" data-command="toggle-theme" aria-label="Wissel thema">${theme === 'dark' ? 'Licht' : 'Donker'}</button><button class="add-thought" type="button" data-command="open-capture"><span aria-hidden="true">+</span> Plaats een clutter</button></div></header><div class="app-layout"><aside class="app-sidebar"><nav aria-label="Hoofdnavigatie"><p class="sidebar-label">Werkruimte</p><button class="sidebar-link is-active" type="button"><span aria-hidden="true">◈</span> Clutters</button><button class="sidebar-link" type="button"><span aria-hidden="true">⌕</span> Zoek</button><button class="sidebar-link" type="button"><span aria-hidden="true">▽</span> Filter &amp; tonen</button><button class="sidebar-link" type="button"><span aria-hidden="true">▥</span> Statistieken</button><button class="sidebar-link" type="button"><span aria-hidden="true">⚙</span> Instellingen</button></nav><div class="sidebar-tip"><strong>Tip</strong><span>Zoom in op een cluster om de details te bekijken.</span></div></aside><section class="workspace"><div class="mobile-clutter-view"><div class="mobile-list-tools"><button type="button" aria-label="Filter clutters">▽</button><button type="button">Alles tonen <span aria-hidden="true">⌄</span></button><button type="button">Ordenen <span aria-hidden="true">⌄</span></button></div>${visibleMindClutters.length ? `<div class="mobile-clutter-list">${visibleMindClutters.map(mobileClutterTemplate).join('')}</div>` : searchTerm ? `<div class="mobile-empty">Geen clutters gevonden voor “${escapeHtml(searchTerm)}”.</div>` : `<div class="mobile-empty">Leg je eerste clutter vast.</div>`}<button class="mobile-add-thought" type="button" data-command="open-capture"><span aria-hidden="true">+</span> Plaats een clutter</button></div>${visibleMindClutters.length ? mindMapTemplate({ mindClutters: visibleMindClutters, focusedId, camera }) : searchTerm ? searchEmptyTemplate(searchTerm) : emptyMapTemplate()}</section></div></main>${captureTemplate(captureItems)}${selectedId ? detailTemplate(selected(), mindClutters) : ''}`
    const sidebarLinks = [...document.querySelectorAll('.sidebar-link')]
    sidebarLinks[0]?.setAttribute('data-command', 'show-active')
    sidebarLinks[1]?.setAttribute('data-command', 'focus-search')
    sidebarLinks[2]?.setAttribute('data-command', 'toggle-archived')
    sidebarLinks[2]?.classList.toggle('is-active', showArchived)
    sidebarLinks[2]?.replaceChildren(document.createTextNode(showArchived ? '▽ Alleen actieve tonen' : '▽ Archief tonen'))
    sidebarLinks[3]?.remove()
    sidebarLinks[4]?.remove()
    const mobileTools = [...document.querySelectorAll('.mobile-list-tools button')]
    mobileTools[0]?.setAttribute('data-command', 'toggle-archived')
    mobileTools[1]?.setAttribute('data-command', 'show-active')
    mobileTools[1]?.replaceChildren(document.createTextNode(showArchived ? 'Actieve tonen' : 'Alles tonen'))
    mobileTools[2]?.setAttribute('data-command', 'cycle-sort')
    mobileTools[2]?.replaceChildren(document.createTextNode(sortMode === 'title' ? 'Titel' : sortMode === 'weight' ? 'Mentale ruimte' : 'Recent'))
    document.querySelector('.header-actions')?.insertAdjacentHTML('beforeend', '<button class="theme-toggle" type="button" data-command="sign-out">Uitloggen</button>')
    const searchInput = document.querySelector('[name="mind-clutter-search"]')
    if (searchInput && searchWasFocused) {
      searchInput.focus()
      searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length)
    }
    const detailDialog = document.querySelector('#detail-dialog')
    if (detailDialog) {
      detailDialog.querySelector('.thought-actions')?.insertAdjacentHTML('beforebegin', connectionTemplate(selected(), mindClutters))
      const archiveButton = detailDialog.querySelector('[data-command="archive"]')
      if (archiveButton && selected()?.archived) archiveButton.textContent = 'Herstel deze clutter'
    }
    document.querySelector('.memory-app')?.classList.toggle('is-loading', isLoading)
    if (undoAction) document.querySelector('.memory-app')?.insertAdjacentHTML('beforeend', `<aside class="undo-toast" role="status"><span>${escapeHtml(undoAction.label)}</span><button type="button" data-command="undo">Ongedaan maken</button></aside>`)
    if (!eventsBound) bindEvents()
  }

  function bindEvents() {
    document.addEventListener('click', (event) => handleClick(event).catch(reportError))
    document.addEventListener('submit', (event) => handleSubmit(event).catch(reportError))
    document.addEventListener('change', handleChange)
    document.addEventListener('input', handleInput)
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', (event) => handlePointerUp(event).catch(reportError))
    document.addEventListener('wheel', handleWheel, { passive: false })
      window.addEventListener('online', () => syncWhenOnline().catch(reportError))
      window.addEventListener('offline', () => { isOnline = false; render() })
    eventsBound = true
  }

  async function handleClick(event) {
    const button = event.target.closest('[data-command]')
    const command = button?.dataset.command
    if (isLoading && command !== 'undo') return
    if (command === 'open-capture') openCapture()
    if (command === 'toggle-theme') {
      theme = theme === 'dark' ? 'light' : 'dark'
      applyTheme()
      render()
    }
    if (command === 'focus-search') {
      document.querySelector('[name="mind-clutter-search"]')?.focus()
    }
    if (command === 'show-active') {
      showArchived = false
      render()
    }
    if (command === 'toggle-archived') {
      showArchived = !showArchived
      render()
    }
    if (command === 'cycle-sort') {
      sortMode = sortMode === 'updated' ? 'weight' : sortMode === 'weight' ? 'title' : 'updated'
      render()
    }
    if (command === 'sign-out') {
      await onSignOut?.()
    }
    if (command === 'undo') await undoLast()
    if (command === 'remove-connection') await removeConnection(button.dataset.id)
    if (command === 'close-dialog') {
      if (button.closest('dialog')?.id === 'detail-dialog') {
        await saveDetailDialogState()
      }
      speechProvider.stop()
      listening = false
      button.closest('dialog').close()
    }
    if (command === 'toggle-speech') toggleSpeech()
    if (command === 'focus-node') {
      focusNode(button.dataset.id)
      return
    }
    if (command === 'zoom-in') zoomMap(1.18)
    if (command === 'zoom-out') zoomMap(.84)
    if (command === 'reset-map') { focusedId = null; fitAllNodes() }
    if (command === 'grid-layout') await arrangeAsGrid()
    if (command === 'remove-capture-item') {
      captureItems.splice(Number(button.dataset.index), 1)
      renderCapturePreview()
    }
    if (command === 'open-detail') {
      selectedId = button.dataset.id || focusedId
      if (!selectedId) return
      render()
      document.querySelector('#detail-dialog').showModal()
    }
    if (command === 'toggle-action') await saveSelected(toggleActionDone(selected(), button.dataset.actionId))
    if (command === 'delete-action') await saveSelected(removeAction(selected(), button.dataset.actionId))
    if (command === 'archive') await archiveSelected()
    if (command === 'delete-mind-clutter' && window.confirm('Deze clutter en alle ontwikkelingen permanent verwijderen?')) await deleteSelected()
  }

  function openCapture() {
    const dialog = document.querySelector('#capture-dialog')
    dialog.querySelector('form').reset()
    captureItems = []
    renderCapturePreview()
    dialog.showModal()
    dialog.querySelector('[name="content"]').focus()
  }

  function toggleSpeech() {
    if (listening) {
      speechProvider.stop()
      return
    }
    const textarea = document.querySelector('#capture-dialog [name="content"]')
    const message = document.querySelector('#speech-message')
    listening = true
    setSpeechState(true, 'Ik luister...')
    speechProvider.start({
      onTranscript: (transcript) => {
        textarea.value = transcript
        updateCaptureItems(transcript)
        message.textContent = 'Spraak wordt omgezet naar afzonderlijke clutters...'
      },
      onEnd: () => {
        listening = false
        const count = captureItems.length
        setSpeechState(false, count ? `${count} ${count === 1 ? 'clutter staat' : 'clutters staan'} klaar om te controleren.` : 'Klaar met luisteren.')
      },
      onError: (error) => { listening = false; setSpeechState(false, error) },
    })
  }

  function setSpeechState(isListening, message) {
    const button = document.querySelector('[data-command="toggle-speech"]')
    if (button) {
      button.classList.toggle('is-listening', isListening)
      button.setAttribute('aria-pressed', String(isListening))
      button.querySelector('.speech-button-label').textContent = isListening ? 'Stop opname' : 'Spreek je clutters in'
    }
    const messageElement = document.querySelector('#speech-message')
    if (messageElement) messageElement.textContent = message
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (event.target.id === 'capture-form') {
      const newMindClutters = captureItems.filter(Boolean).map((content) => createMindClutter({ content }))
      if (!newMindClutters.length) return
      await withLoading(async () => {
        await Promise.all(newMindClutters.map((mindClutter) => repository.save(mindClutter)))
        mindClutters = [...newMindClutters, ...mindClutters]
        listening = false
        render()
      })
    }
    if (event.target.id === 'action-form') {
      const updated = addAction(selected(), new FormData(event.target).get('action'))
      if (updated !== selected()) await saveSelected(updated)
    }
    if (event.target.id === 'connect-form') await connectSelected(new FormData(event.target).get('targetId'))
  }

  async function connectSelected(targetId) {
    const source = selected()
    const target = mindClutters.find((mindClutter) => mindClutter.id === targetId)
    if (!source || !target || source.id === target.id) return
    const alreadyConnected = (source.links || []).some((link) => link?.targetId === target.id)
    if (alreadyConnected) return
    const sourceUpdated = updateMindClutter(source, { links: [...(source.links || []), { id: target.id, targetId: target.id, title: target.title }] })
    const targetUpdated = updateMindClutter(target, { links: [...(target.links || []), { id: source.id, targetId: source.id, title: source.title }] })
    await Promise.all([repository.save(sourceUpdated), repository.save(targetUpdated)])
    mindClutters = mindClutters.map((mindClutter) => mindClutter.id === sourceUpdated.id ? sourceUpdated : mindClutter.id === targetUpdated.id ? targetUpdated : mindClutter)
    selectedId = sourceUpdated.id
    render()
    document.querySelector('#detail-dialog')?.showModal()
  }

  async function removeConnection(targetId) {
    const source = selected()
    const target = mindClutters.find((mindClutter) => mindClutter.id === targetId)
    if (!source || !target) return
    const sourceUpdated = updateMindClutter(source, { links: (source.links || []).filter((link) => link?.targetId !== target.id) })
    const targetUpdated = updateMindClutter(target, { links: (target.links || []).filter((link) => link?.targetId !== source.id) })
    await withLoading(async () => {
      await Promise.all([repository.save(sourceUpdated), repository.save(targetUpdated)])
      mindClutters = mindClutters.map((mindClutter) => mindClutter.id === sourceUpdated.id ? sourceUpdated : mindClutter.id === targetUpdated.id ? targetUpdated : mindClutter)
      render()
      document.querySelector('#detail-dialog')?.showModal()
    })
  }

  function handleChange(event) {
    if (!event.target.closest('#detail-dialog')) return
    const property = event.target.name
    if (['title', 'content', 'weight', 'status'].includes(property)) saveSelected(updateMindClutter(selected(), { [property]: event.target.value })).catch(reportError)
    if (property === 'development') saveSelected(updateAction(selected(), event.target.dataset.actionId, event.target.value)).catch(reportError)
  }

  function handleInput(event) {
    if (event.target.matches('[name="mind-clutter-search"]')) {
      searchTerm = event.target.value
      render()
    }
    if (event.target.matches('#capture-dialog [name="content"]')) updateCaptureItems(event.target.value)
    if (event.target.matches('[data-capture-item]')) {
      const index = Number(event.target.dataset.captureItem)
      captureItems[index] = event.target.value.trim()
      updatePreviewCount()
    }
  }

  function updateCaptureItems(text) {
    captureItems = splitCaptureText(text)
    renderCapturePreview()
  }

  function renderCapturePreview() {
    const preview = document.querySelector('#capture-preview')
    if (preview) preview.innerHTML = previewTemplate(captureItems)
  }

  function updatePreviewCount() {
    const count = captureItems.filter(Boolean).length
    const countElement = document.querySelector('#capture-count')
    if (countElement) countElement.textContent = count ? `${count} ${count === 1 ? 'clutter' : 'clutters'} klaar om te bewaren` : 'Nog geen clutters gevonden'
  }

  function applyTheme() {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('mindclutterss-theme', theme)
  }

  function zoomMap(factor) {
    camera = { ...camera, zoom: Math.min(2.3, Math.max(.25, camera.zoom * factor)) }
    render()
  }

  function fitAllNodes(items = mindClutters) {
    const bounds = mapBounds(items)
    const padding = 70
    const width = bounds.maxX - bounds.minX + padding * 2
    const height = bounds.maxY - bounds.minY + padding * 2
    const zoom = Math.min(1.2, Math.max(.25, Math.min(1200 / width, 720 / height)))
    camera = {
      x: (bounds.minX + bounds.maxX) / 2 - 600 / zoom,
      y: (bounds.minY + bounds.maxY) / 2 - 360 / zoom,
      zoom,
    }
    render()
  }

  async function arrangeAsGrid() {
    const orderedMindClutters = [...mindClutters].sort((first, second) => second.weight - first.weight)
    const positions = gridPositions(orderedMindClutters)
    const arranged = mindClutters.map((mindClutter) => updateMindClutter(mindClutter, { mapPosition: positions.get(mindClutter.id) }))
    await Promise.all(arranged.map((mindClutter) => repository.save(mindClutter)))
    mindClutters = arranged
    focusedId = null
    fitAllNodes(arranged)
  }

  function focusNode(id) {
    const position = mapNodePosition(mindClutters, id)
    if (!position) return
    focusedId = id
    const zoom = 1.25
    camera = { x: position.x - 600 / zoom, y: position.y - 360 / zoom, zoom }
    render()
  }

  function handlePointerDown(event) {
    const svg = event.target.closest('#mindmap-svg')
    if (!svg || event.button !== 0 || event.target.closest('.expand-control')) return
    const node = event.target.closest('.map-root')
    pointerState = {
      svg,
      node,
      startX: event.clientX,
      startY: event.clientY,
      nodeX: Number(node?.dataset.mapX),
      nodeY: Number(node?.dataset.mapY),
      moved: false,
    }
    svg.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event) {
    if (!pointerState) return
    const scale = pointerState.svg.clientWidth / (1200 / camera.zoom)
    const deltaX = (event.clientX - pointerState.startX) / scale
    const deltaY = (event.clientY - pointerState.startY) / scale
    if (Math.abs(deltaX) + Math.abs(deltaY) > 2) pointerState.moved = true
    if (pointerState.node) {
      const position = { x: pointerState.nodeX + deltaX, y: pointerState.nodeY + deltaY }
      pointerState.node.setAttribute('transform', `translate(${position.x} ${position.y})`)
      pointerState.node.dataset.mapX = String(position.x)
      pointerState.node.dataset.mapY = String(position.y)
      updateDraggedChildren(pointerState.node.dataset.mapNodeId, position)
    } else {
      camera = { ...camera, x: camera.x - deltaX, y: camera.y - deltaY }
      pointerState.startX = event.clientX
      pointerState.startY = event.clientY
      pointerState.svg.setAttribute('viewBox', `${camera.x} ${camera.y} ${1200 / camera.zoom} ${720 / camera.zoom}`)
    }
  }

  function updateDraggedChildren(parentId, position) {
    const mindClutter = mindClutters.find((item) => item.id === parentId)
    if (!mindClutter) return
    const elements = [...document.querySelectorAll('#mindmap-svg [data-child-id]')]
    childLayout(mindClutter, position).forEach((child) => {
      elements.filter((element) => element.dataset.childId === child.id).forEach((element) => {
        if (element.tagName === 'path') element.setAttribute('d', childConnectionPath(position, child))
        else element.setAttribute('transform', `translate(${child.x} ${child.y})`)
      })
    })
  }

  async function handlePointerUp() {
    if (!pointerState) return
    const { node, moved } = pointerState
    pointerState = null
    if (!node) return
    if (!moved) {
      focusNode(node.dataset.mapNodeId)
      return
    }
    const id = node.dataset.mapNodeId
    const updated = updateMindClutter(mindClutters.find((mindClutter) => mindClutter.id === id), { mapPosition: { x: Number(node.dataset.mapX), y: Number(node.dataset.mapY) } })
    await withLoading(async () => {
      await repository.save(updated)
      mindClutters = mindClutters.map((mindClutter) => mindClutter.id === id ? updated : mindClutter)
      render()
    })
  }

  function handleWheel(event) {
    if (!event.target.closest('#mindmap-svg')) return
    event.preventDefault()
    zoomMap(event.deltaY < 0 ? 1.12 : .89)
  }

  async function saveSelected(updated) {
    await withLoading(async () => {
      await repository.save(updated)
      mindClutters = mindClutters.map((mindClutter) => mindClutter.id === updated.id ? updated : mindClutter)
      selectedId = updated.id
      render()
      document.querySelector('#detail-dialog')?.showModal()
    })
  }

  async function saveDetailDialogState() {
    const dialog = document.querySelector('#detail-dialog')
    if (!dialog || !selectedId) return
    const current = selected()
    if (!current) return

    const title = dialog.querySelector('input[name="title"]')?.value ?? current.title
    const content = dialog.querySelector('textarea[name="content"]')?.value ?? current.content
    const weight = Number(dialog.querySelector('select[name="weight"]')?.value ?? current.weight)
    const status = dialog.querySelector('select[name="status"]')?.value ?? current.status

    const updated = updateMindClutter(current, { title, content, weight, status })
    if (updated === current) return

    await withLoading(async () => {
      await repository.save(updated)
      mindClutters = mindClutters.map((mindClutter) => mindClutter.id === updated.id ? updated : mindClutter)
      selectedId = updated.id
    })
  }

  async function archiveSelected() {
    const current = selected()
    if (!current) return
    const archived = updateMindClutter(current, current.archived
      ? { archived: false, status: current.statusBeforeArchive || 'thought', statusBeforeArchive: null }
      : { archived: true, status: 'archived', statusBeforeArchive: current.status })
    await withLoading(async () => {
      await repository.save(archived)
      mindClutters = mindClutters.map((mindClutter) => mindClutter.id === archived.id ? archived : mindClutter)
      selectedId = null
      render()
    })
    if (!current.archived) showUndo('Clutter gearchiveerd', { type: 'restore', mindClutter: current })
  }

  async function deleteSelected() {
    const id = selectedId
    const deleted = selected()
    await withLoading(async () => {
      await repository.delete(id)
      mindClutters = mindClutters.filter((mindClutter) => mindClutter.id !== id)
      selectedId = null
      if (focusedId === id) focusedId = null
      render()
    })
    if (deleted) showUndo('Clutter verwijderd', { type: 'restore', mindClutter: deleted })
  }

  async function withLoading(task) {
    setLoading(true)
    try { return await task() } finally { setLoading(false) }
  }

  function setLoading(value) {
    isLoading = value
    document.querySelector('.memory-app')?.classList.toggle('is-loading', value)
  }

  async function syncWhenOnline() {
    isOnline = true
    syncMessage = 'Bezig met synchroniseren...'
    render()
    mindClutters = await repository.list({ includeArchived: true })
    syncMessage = 'Alles gesynchroniseerd'
    render()
    setTimeout(() => { syncMessage = ''; render() }, 2400)
  }

  function showUndo(label, restore) {
    clearTimeout(undoTimer)
    undoAction = { label, ...restore }
    localStorage.setItem('unclut-undo', JSON.stringify(undoAction))
    undoTimer = setTimeout(() => { undoAction = null; render() }, 8000)
    render()
  }

  async function undoLast() {
    if (!undoAction) return
    const action = undoAction
    clearTimeout(undoTimer)
    undoAction = null
    localStorage.removeItem('unclut-undo')
    await withLoading(async () => {
      const restored = action.mindClutter
      await repository.save(restored)
      mindClutters = [restored, ...mindClutters.filter((item) => item.id !== restored.id)]
      render()
    })
  }

  function selected() { return mindClutters.find((mindClutter) => mindClutter.id === selectedId) }
  function reportError(error) {
    window.alert(`Er ging iets mis: ${error?.message || 'probeer het opnieuw.'}`)
  }
  function filterMindClutters() {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase()
    const visibleMindClutters = mindClutters.filter((mindClutter) => showArchived || !mindClutter.archived)
    const sortedMindClutters = [...visibleMindClutters].sort((first, second) => sortMode === 'title'
      ? first.title.localeCompare(second.title)
      : sortMode === 'weight' ? second.weight - first.weight : new Date(second.updatedAt) - new Date(first.updatedAt))
    if (!normalizedSearch) return sortedMindClutters
    return sortedMindClutters.filter((mindClutter) => [mindClutter.title, mindClutter.content, mindClutter.originalContent, ...(mindClutter.actions || []).map((action) => action.text), ...(mindClutter.notes || []).map((note) => typeof note === 'string' ? note : note.text || note.content)].filter(Boolean).join(' ').toLocaleLowerCase().includes(normalizedSearch))
  }
  return { start }
}

function readUndoAction() {
  try {
    const action = JSON.parse(localStorage.getItem('unclut-undo') || 'null')
    return action?.type === 'restore' && action.mindClutter ? action : null
  } catch {
    return null
  }
}

function nodeTemplate(mindClutter) {
  const actionCount = mindClutter.actions.length
  return `<button class="thought-bubble" type="button" data-command="open-detail" data-id="${mindClutter.id}" data-weight="${mindClutter.weight}"><span class="bubble-status">${statusLabels[mindClutter.status]}</span><strong>${escapeHtml(mindClutter.title)}</strong><span class="bubble-footer"><span>${'●'.repeat(mindClutter.weight)}${'○'.repeat(5 - mindClutter.weight)}</span>${actionCount ? `<em>${actionCount} ontwikkeling${actionCount === 1 ? '' : 'en'}</em>` : ''}</span></button>`
}

function mobileClutterTemplate(mindClutter, index) {
  const icon = ['⌂', '▣', '♡', '</>', '◎', '◇', '♧'][index % 7]
  const actionCount = mindClutter.actions.length
  return `<button class="mobile-clutter-card mobile-color-${index % 4}" type="button" data-command="open-detail" data-id="${mindClutter.id}"><span class="mobile-clutter-icon" aria-hidden="true">${icon}</span><span class="mobile-clutter-copy"><strong>${escapeHtml(mindClutter.title)}</strong><small>${actionCount || 0} ${actionCount === 1 ? 'clutter' : 'clutters'}</small></span><span class="mobile-clutter-arrow" aria-hidden="true">›</span></button>`
}

function emptyTemplate() {
  return `<div class="empty-space"><span aria-hidden="true">○</span><h3>Hier mag het rommelen.</h3><p>Een clutter is geen taak. Alleen iets dat je niet in je hoofd wilt laten rondzingen.</p><button type="button" class="text-action" data-command="open-capture">Leg je eerste clutter vast</button></div>`
}

function emptyMapTemplate() {
  return `<section class="mindmap-empty"><div><p>VISUEEL WERKGEHEUGEN</p><h2>Clutters</h2><span>Leg een losse clutter vast.</span><button type="button" class="add-thought" data-command="open-capture">+ Eerste clutter</button></div></section>`
}

function searchEmptyTemplate(searchTerm) {
  return `<section class="mindmap-empty"><div><p>GEEN RESULTATEN</p><h2>Geen match</h2><span>Geen clutter-titel bevat “${escapeHtml(searchTerm)}”.</span></div></section>`
}

function captureTemplate(captureItems) {
  return `<dialog id="capture-dialog" class="capture-dialog"><form id="capture-form"><div class="capture-head"><p>VANG HET VOORDAT HET WEG IS</p><button type="button" class="icon-button" data-command="close-dialog" aria-label="Sluiten">×</button></div><h2>Wat speelt er door je hoofd?</h2><textarea name="content" placeholder="Typ meerdere clutters, gescheiden met een puntkomma..."></textarea><p class="capture-hint">Gebruik <strong>;</strong> tussen clutters. Zeg bij inspreken “nieuwe clutter” of “volgende clutter”.</p><div class="speech-row"><button type="button" class="speech-button" data-command="toggle-speech" aria-pressed="false"><span class="mic" aria-hidden="true">🎙</span><span class="speech-button-label">Spreek je clutters in</span></button><p id="speech-message" aria-live="polite">Je kunt typen of inspreken.</p></div><section id="capture-preview" class="capture-preview" aria-live="polite">${previewTemplate(captureItems)}</section><div class="capture-actions"><button type="button" class="text-action" data-command="close-dialog">Nog niet</button><button class="save-thought" type="submit">Bewaar alle clutters</button></div></form></dialog>`
}

function previewTemplate(captureItems) {
  const visibleItems = captureItems.map((item, index) => ({ item: item.trim(), index })).filter(({ item }) => item)
  if (!visibleItems.length) return `<p id="capture-count" class="preview-empty">Nog geen clutters gevonden</p>`
  return `<div class="preview-heading"><p>GEVONDEN CLUTTERS</p><strong id="capture-count">${visibleItems.length} ${visibleItems.length === 1 ? 'clutter' : 'clutters'} klaar om te bewaren</strong></div><ol>${visibleItems.map(({ item, index }) => `<li><textarea data-capture-item="${index}" aria-label="Clutter ${index + 1}">${escapeHtml(item)}</textarea><button type="button" data-command="remove-capture-item" data-index="${index}" aria-label="Verwijder clutter ${index + 1}">×</button></li>`).join('')}</ol>`
}

function connectionTemplate(mindClutter, mindClutters) {
  if (!mindClutter) return ''
  const connectedIds = new Set((mindClutter.links || []).map((link) => link?.targetId).filter(Boolean))
  const connected = mindClutters.filter((item) => connectedIds.has(item.id))
  const options = mindClutters.filter((item) => item.id !== mindClutter.id && !connectedIds.has(item.id))
  return `<section class="developments connections"><div><p>SAMENHANG</p><h3>Verbonden clutters</h3></div>${connected.length ? `<ul>${connected.map((item) => `<li><span>${escapeHtml(item.title)}</span><button type="button" data-command="remove-connection" data-id="${item.id}" aria-label="Verwijder verbinding met ${escapeHtml(item.title)}">×</button></li>`).join('')}</ul>` : '<p class="quiet">Nog geen verbonden clutters.</p>'}<form id="connect-form" class="add-development"><select name="targetId" required><option value="">Kies een clutter</option>${options.map((item) => `<option value="${item.id}">${escapeHtml(item.title)}</option>`).join('')}</select><button type="submit">Verbind</button></form></section>`
}

function detailTemplate(mindClutter) {
  if (!mindClutter) return ''
  const original = mindClutter.originalContent || mindClutter.content
  const actions = mindClutter.actions.map((action) => `<li class="${action.state === 'done' ? 'is-done' : ''}"><button type="button" data-command="toggle-action" data-action-id="${action.id}" aria-label="Markeer ${escapeHtml(action.text)} als ${action.state === 'done' ? 'onafgerond' : 'gedaan'}">${action.state === 'done' ? '✓' : '○'}</button><input class="development-input" name="development" data-action-id="${action.id}" value="${escapeHtml(action.text)}" aria-label="Bewerk ontwikkeling"><button type="button" class="delete-development" data-command="delete-action" data-action-id="${action.id}" aria-label="Verwijder ontwikkeling ${escapeHtml(action.text)}">×</button></li>`).join('') || '<li class="quiet">Nog geen ontwikkelingen. Dat is helemaal prima.</li>'
  return `<dialog id="detail-dialog" class="detail-dialog"><div class="detail-shell"><header class="detail-header"><div><p>JOUW CLUTTER</p><input class="detail-title" name="title" value="${escapeHtml(mindClutter.title)}" aria-label="Titel van de clutter"></div><button type="button" class="icon-button" data-command="close-dialog" aria-label="Sluiten">×</button></header><section class="thought-controls"><label>Mentale ruimte<select name="weight">${[1, 2, 3, 4, 5].map((weight) => `<option value="${weight}" ${mindClutter.weight === weight ? 'selected' : ''}>${weight} - ${weightLabel(weight)}</option>`).join('')}</select></label><label>Fase<select name="status">${Object.entries(statusLabels).filter(([status]) => status !== 'archived').map(([status, label]) => `<option value="${status}" ${mindClutter.status === status ? 'selected' : ''}>${label}</option>`).join('')}</select></label></section><section class="thought-body"><label>Clutter<textarea name="content">${escapeHtml(mindClutter.content)}</textarea></label>${original !== mindClutter.content ? `<p class="original-text"><span>Oorspronkelijk vastgelegd</span>${escapeHtml(original)}</p>` : ''}</section><section class="developments"><div><p>ALLEEN ALS HET HELPT</p><h3>Ontwikkelingen</h3></div><ul>${actions}</ul><form id="action-form" class="add-development"><input name="action" placeholder="Een ontwikkeling, ontdekking of mogelijke stap"><button type="submit">Voeg toe</button></form></section><section class="thought-actions"><button class="archive-button" type="button" data-command="archive">Archiveer deze clutter</button><button class="delete-mind-clutter" type="button" data-command="delete-mind-clutter">Verwijder permanent</button></section></div></dialog>`
}

function legacyDetailTemplateV3(mindClutter) {
  if (!mindClutter) return ''
  const original = mindClutter.originalContent || mindClutter.content
  return `<dialog id="detail-dialog" class="detail-dialog"><div class="detail-shell"><header class="detail-header"><div><p>JOUW FART</p><input class="detail-title" name="title" value="${escapeHtml(mindClutter.title)}" aria-label="Titel van de clutter"></div><button type="button" class="icon-button" data-command="close-dialog" aria-label="Sluiten">×</button></header><section class="thought-controls"><label>Mentale ruimte<select name="weight">${[1, 2, 3, 4, 5].map((weight) => `<option value="${weight}" ${mindClutter.weight === weight ? 'selected' : ''}>${weight} - ${weightLabel(weight)}</option>`).join('')}</select></label><label>Fase<select name="status">${Object.entries(statusLabels).filter(([status]) => status !== 'archived').map(([status, label]) => `<option value="${status}" ${mindClutter.status === status ? 'selected' : ''}>${label}</option>`).join('')}</select></label></section><section class="thought-body"><label>Fart<textarea name="content">${escapeHtml(mindClutter.content)}</textarea></label>${original !== mindClutter.content ? `<p class="original-text"><span>Oorspronkelijk vastgelegd</span>${escapeHtml(original)}</p>` : ''}</section><section class="developments"><div><p>ALLEEN ALS HET HELPT</p><h3>Ontwikkelingen</h3></div><ul>${mindClutter.actions.map((action) => `<li class="${action.state === 'done' ? 'is-done' : ''}"><button type="button" data-command="toggle-action" data-action-id="${action.id}" aria-label="Markeer ${escapeHtml(action.text)} als ${action.state === 'done' ? 'onafgerond' : 'gedaan'}">${action.state === 'done' ? '✓' : '○'}</button><input class="development-input" name="development" data-action-id="${action.id}" value="${escapeHtml(action.text)}" aria-label="Bewerk ontwikkeling"><button type="button" class="delete-development" data-command="delete-action" data-action-id="${action.id}" aria-label="Verwijder ontwikkeling ${escapeHtml(action.text)}">×</button></li>`).join('') || '<li class="quiet">Nog geen ontwikkelingen. Dat is helemaal prima.</li>'}</ul><form id="action-form" class="add-development"><input name="action" placeholder="Een ontwikkeling, ontdekking of mogelijke stap"><button type="submit">Voeg toe</button></form></section><section class="thought-actions"><button class="archive-button" type="button" data-command="archive">Archiveer deze clutter</button><button class="delete-mind-clutter" type="button" data-command="delete-mind-clutter">Verwijder permanent</button></section></div></dialog>`
}

function legacyDetailTemplateV2(mindClutter) {
  if (!mindClutter) return ''
  const original = mindClutter.originalContent || mindClutter.content
  return `<dialog id="detail-dialog" class="detail-dialog"><div class="detail-shell"><header class="detail-header"><div><p>JOUW GEDACHTE</p><input class="detail-title" name="title" value="${escapeHtml(mindClutter.title)}" aria-label="Titel van de gedachte"></div><button type="button" class="icon-button" data-command="close-dialog" aria-label="Sluiten">×</button></header><section class="thought-controls"><label>Mentale ruimte<select name="weight">${[1, 2, 3, 4, 5].map((weight) => `<option value="${weight}" ${mindClutter.weight === weight ? 'selected' : ''}>${weight} - ${weightLabel(weight)}</option>`).join('')}</select></label><label>Fase<select name="status">${Object.entries(statusLabels).filter(([status]) => status !== 'archived').map(([status, label]) => `<option value="${status}" ${mindClutter.status === status ? 'selected' : ''}>${label}</option>`).join('')}</select></label></section><section class="thought-body"><label>Gedachte<textarea name="content">${escapeHtml(mindClutter.content)}</textarea></label>${original !== mindClutter.content ? `<p class="original-text"><span>Oorspronkelijk vastgelegd</span>${escapeHtml(original)}</p>` : ''}</section><section class="developments"><div><p>ALLEEN ALS HET HELPT</p><h3>Ontwikkelingen</h3></div><ul>${mindClutter.actions.map((action) => `<li class="${action.state === 'done' ? 'is-done' : ''}"><button type="button" data-command="toggle-action" data-action-id="${action.id}" aria-label="Markeer ${escapeHtml(action.text)} als ${action.state === 'done' ? 'onafgerond' : 'gedaan'}">${action.state === 'done' ? '✓' : '○'}</button><input class="development-input" name="development" data-action-id="${action.id}" value="${escapeHtml(action.text)}" aria-label="Bewerk ontwikkeling"><button type="button" class="delete-development" data-command="delete-action" data-action-id="${action.id}" aria-label="Verwijder ontwikkeling ${escapeHtml(action.text)}">×</button></li>`).join('') || '<li class="quiet">Nog geen ontwikkelingen. Dat is helemaal prima.</li>'}</ul><form id="action-form" class="add-development"><input name="action" placeholder="Een ontwikkeling, ontdekking of mogelijke stap"><button type="submit">Voeg toe</button></form></section><section class="thought-actions"><button class="archive-button" type="button" data-command="archive">Archiveer deze gedachte</button><button class="delete-mind-clutter" type="button" data-command="delete-mind-clutter">Verwijder permanent</button></section></div></dialog>`
}

function legacyDetailTemplate(mindClutter) {
  if (!mindClutter) return ''
  const original = mindClutter.originalContent || mindClutter.content
  return `<dialog id="detail-dialog" class="detail-dialog"><div class="detail-shell"><header class="detail-header"><div><p>JOUW GEDACHTE</p><h2>${escapeHtml(mindClutter.title)}</h2></div><button type="button" class="icon-button" data-command="close-dialog" aria-label="Sluiten">×</button></header><section class="thought-body"><label>Gedachte<textarea name="content">${escapeHtml(mindClutter.content)}</textarea></label>${original !== mindClutter.content ? `<p class="original-text"><span>Oorspronkelijk vastgelegd</span>${escapeHtml(original)}</p>` : ''}</section><section class="developments"><div><p>ALLEEN ALS HET HELPT</p><h3>Ontwikkelingen</h3></div><ul>${mindClutter.actions.map((action) => `<li class="${action.state === 'done' ? 'is-done' : ''}"><button type="button" data-command="toggle-action" data-action-id="${action.id}" aria-label="Markeer ${escapeHtml(action.text)} als ${action.state === 'done' ? 'onafgerond' : 'gedaan'}">${action.state === 'done' ? '✓' : '○'}</button><input class="development-input" name="development" data-action-id="${action.id}" value="${escapeHtml(action.text)}" aria-label="Bewerk ontwikkeling"><button type="button" class="delete-development" data-command="delete-action" data-action-id="${action.id}" aria-label="Verwijder ontwikkeling ${escapeHtml(action.text)}">×</button></li>`).join('') || '<li class="quiet">Nog geen ontwikkelingen. Dat is helemaal prima.</li>'}</ul><form id="action-form" class="add-development"><input name="action" placeholder="Een ontwikkeling, ontdekking of mogelijke stap"><button type="submit">Voeg toe</button></form></section><details class="thought-settings"><summary>Meer over deze gedachte</summary><div><label>Titel<input name="title" value="${escapeHtml(mindClutter.title)}"></label><label>Mentale ruimte<select name="weight">${[1, 2, 3, 4, 5].map((weight) => `<option value="${weight}" ${mindClutter.weight === weight ? 'selected' : ''}>${weight} - ${weightLabel(weight)}</option>`).join('')}</select></label><label>Fase<select name="status">${Object.entries(statusLabels).filter(([status]) => status !== 'archived').map(([status, label]) => `<option value="${status}" ${mindClutter.status === status ? 'selected' : ''}>${label}</option>`).join('')}</select></label><button class="archive-button" type="button" data-command="archive">Archiveer deze gedachte</button><button class="delete-mind-clutter" type="button" data-command="delete-mind-clutter">Verwijder permanent</button></div></details></div></dialog>`
}

function weightLabel(weight) { return ['Nauwelijks aanwezig', 'Merkbaar', 'Belangrijk', 'Veel druk', 'Steeds aanwezig'][weight - 1] }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]) }