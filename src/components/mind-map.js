const mapWidth = 1200
const mapHeight = 720

export function mindMapTemplate({ mindClutters, focusedId, camera }) {
  const positions = rootPositions(mindClutters)
  const roots = mindClutters.map((mindClutter, index) => ({ mindClutter, position: positions.get(mindClutter.id), index }))
  const children = roots.flatMap(({ mindClutter, position }) => childLayout(mindClutter, position))
  const viewBox = `${camera.x} ${camera.y} ${mapWidth / camera.zoom} ${mapHeight / camera.zoom}`

  return `<section class="mindmap-shell" aria-label="Visuele kaart van clutters">
    <svg id="mindmap-svg" class="mindmap-canvas" viewBox="${viewBox}" role="application" aria-label="Sleep om te verplaatsen. Gebruik de knoppen om te zoomen.">
      <defs>
        <filter id="node-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="9" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <pattern id="mindmap-grid" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" class="map-grid-dot" /></pattern>
      </defs>
      <rect class="map-background" x="-1000" y="-1000" width="3200" height="2720" fill="url(#mindmap-grid)" />
      <g class="map-connections">
        ${roots.flatMap(({ mindClutter, position }) => childEdges(mindClutter, position)).join('')}
      </g>
      <g class="map-relations">
        ${relationEdges(mindClutters, positions)}
      </g>
      <g class="map-nodes">
        ${children.map(childNodeTemplate).join('')}
        ${roots.map((root) => rootNodeTemplate({ ...root, isFocused: root.mindClutter.id === focusedId })).join('')}
      </g>
    </svg>
    <div class="map-tools" aria-label="Mindmapbediening">
      <button type="button" data-command="zoom-in" aria-label="Inzoomen">+</button>
      <button type="button" data-command="zoom-out" aria-label="Uitzoomen">−</button>
      <button type="button" data-command="reset-map">Alles tonen</button>
      <button type="button" data-command="grid-layout">Ordenen</button>
    </div>
    ${focusedId ? focusCardTemplate(mindClutters.find((mindClutter) => mindClutter.id === focusedId)) : '<p class="map-prompt">Klik op een clutter om in te zoomen op wat eronder hangt.</p>'}
  </section>`
}

export function mapNodePosition(mindClutters, id) {
  return rootPositions(mindClutters).get(id)
}

export function mapBounds(mindClutters) {
  const positions = rootPositions(mindClutters)
  const points = mindClutters.flatMap((mindClutter) => {
    const position = positions.get(mindClutter.id)
    return [{ ...position, radius: 105 }, ...childLayout(mindClutter, position).map((child) => ({ ...child, radius: 40 }))]
  })
  if (!points.length) return { minX: 0, minY: 0, maxX: mapWidth, maxY: mapHeight }
  return {
    minX: Math.min(...points.map((point) => point.x - point.radius)),
    minY: Math.min(...points.map((point) => point.y - point.radius)),
    maxX: Math.max(...points.map((point) => point.x + point.radius)),
    maxY: Math.max(...points.map((point) => point.y + point.radius)),
  }
}

export function gridPositions(mindClutters) {
  const columns = Math.ceil(Math.sqrt(mindClutters.length))
  const rows = Math.ceil(mindClutters.length / columns)
  const horizontalGap = 480
  const verticalGap = 360
  const startX = 600 - ((columns - 1) * horizontalGap) / 2
  const startY = 360 - ((rows - 1) * verticalGap) / 2
  return new Map(mindClutters.map((mindClutter, index) => [mindClutter.id, {
    x: startX + (index % columns) * horizontalGap,
    y: startY + Math.floor(index / columns) * verticalGap,
  }]))
}

function rootPositions(mindClutters) {
  const positions = new Map()
  mindClutters.forEach((mindClutter, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(mindClutters.length, 1) - Math.PI / 2
    positions.set(mindClutter.id, mindClutter.mapPosition || { x: 600 + Math.cos(angle) * 270, y: 350 + Math.sin(angle) * 190 })
  })
  return positions
}

export function childLayout(mindClutter, position) {
  const children = [
    ...(mindClutter.actions || []).map((action) => ({ id: action.id, text: action.text, state: action.state, kind: action.state === 'possible' ? 'mogelijke stap' : 'ontwikkeling' })),
    ...(mindClutter.notes || []).map((note, index) => ({ id: note.id || `note-${index}`, text: typeof note === 'string' ? note : note.text || note.content || '', kind: 'notitie' })),
    ...(mindClutter.links || []).filter((link) => typeof link !== 'object' || !link.targetId).map((link, index) => ({ id: link.id || `link-${index}`, text: typeof link === 'string' ? link : link.label || link.title || link.url || '', kind: 'relatie' })),
  ].filter((child) => child.text)
  return children.map((child, index) => {
    const angle = childAngle(index, children.length)
    return { ...child, id: `${mindClutter.id}:${child.id}`, parentId: mindClutter.id, x: position.x + 95 + Math.cos(angle) * 145, y: position.y + 25 + Math.sin(angle) * 108 }
  })
}

function childEdges(mindClutter, position) {
  return childLayout(mindClutter, position).map((child) => `<path class="map-branch" data-child-id="${child.id}" d="${childConnectionPath(position, child)}" />`).join('')
}

function relationEdges(mindClutters, positions) {
  const byId = new Map(mindClutters.map((mindClutter) => [mindClutter.id, mindClutter]))
  const rendered = new Set()
  return mindClutters.flatMap((mindClutter) => (mindClutter.links || []).map((link) => {
    const targetId = typeof link === 'object' ? link.targetId : null
    const target = byId.get(targetId)
    if (!target || rendered.has(`${targetId}:${mindClutter.id}`)) return ''
    rendered.add(`${mindClutter.id}:${targetId}`)
    return `<path class="map-relation" data-relation-id="${mindClutter.id}:${targetId}" d="${connectionPathData(positions.get(mindClutter.id), positions.get(targetId))}" />`
  })).join('')
}

export function childConnectionPath(position, child) {
  return connectionPathData({ x: position.x + 70, y: position.y + 38 }, child)
}

function childAngle(index, count) {
  if (count === 1) return 0
  return -1 + (2 * index) / (count - 1)
}

function rootNodeTemplate({ mindClutter, position, index, isFocused }) {
  const developmentCount = mindClutter.actions?.length || 0
  const radius = 63 + Math.min(mindClutter.weight || 3, 5) * 4
  const width = radius * 2.35
  const height = radius * 1.45
  return `<g class="map-root map-weight-${Math.min(5, Math.max(1, Number(mindClutter.weight) || 3))} phase-${mindClutter.status} ${isFocused ? 'is-focused' : ''}" data-command="focus-node" data-id="${mindClutter.id}" data-map-node-id="${mindClutter.id}" data-map-x="${position.x}" data-map-y="${position.y}" transform="translate(${position.x} ${position.y})" role="button" tabindex="0" aria-label="Focus op ${escapeXml(mindClutter.title)}">
    <rect class="root-halo" x="${-width / 2 - 9}" y="${-height / 2 - 9}" width="${width + 18}" height="${height + 18}" rx="${(height + 18) / 2}" />
    <rect class="root-node" x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" rx="${height / 2}" filter="url(#node-glow)" />
    <text class="root-label" text-anchor="middle" y="-5">${svgLines(mindClutter.title, 16, 2)}</text>
    <text class="root-meta" text-anchor="middle" y="${height / 2 - 17}">${statusLabel(mindClutter.status)}${developmentCount ? ` · ${developmentCount}` : ''}</text>
  </g>`
}

function childNodeTemplate(child) {
  return `<g class="map-child ${child.state === 'done' ? 'is-done' : ''}" data-child-id="${child.id}" transform="translate(${child.x} ${child.y})"><rect x="-65" y="-38" width="130" height="76" rx="38"/><text text-anchor="middle" y="-16">${svgLines(child.text, 12, 2)}</text><text class="child-kind" text-anchor="middle" y="26">${child.kind}</text></g>`
}

function focusCardTemplate(mindClutter) {
  if (!mindClutter) return ''
  const count = mindClutter.actions?.length || 0
  return `<aside class="focus-card"><p>IN FOCUS</p><strong>${escapeXml(mindClutter.title)}</strong><span>${count ? `${count} ${count === 1 ? 'ontwikkeling' : 'ontwikkelingen'} zichtbaar` : 'Nog geen ontwikkelingen'}</span><button type="button" data-command="open-detail">Open clutter</button></aside>`
}

function connectionPath(start, end, className) {
  return `<path class="${className}" d="${connectionPathData(start, end)}" />`
}

function connectionPathData(start, end) {
  const middleX = (start.x + end.x) / 2
  return `M ${start.x} ${start.y} C ${middleX} ${start.y}, ${middleX} ${end.y}, ${end.x} ${end.y}`
}

function statusLabel(status) {
  return { thought: 'gedachte', developing: 'in ontwikkeling', taking_shape: 'krijgt vorm', ready_to_act: 'krijgt richting' }[status] || 'gedachte'
}

function svgLines(text, width, maxLines) {
  const words = String(text).split(/\s+/)
  const lines = []
  let line = ''
  let truncated = false
  for (const word of words) {
    if (lines.length === maxLines) {
      truncated = true
      break
    }
    const candidate = `${line} ${word}`.trim()
    if (candidate.length > width && line) { lines.push(line); line = word } else line = candidate
  }
  if (line && lines.length < maxLines) lines.push(line)
  if (truncated && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1]}...`
  return lines.map((line, index) => `<tspan x="0" dy="${index ? 17 : 0}">${escapeXml(line)}</tspan>`).join('')
}

function escapeXml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])
}