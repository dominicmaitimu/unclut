import assert from 'node:assert/strict'
import test from 'node:test'
import { addAction, createMindClutter, removeAction, toggleActionDone, updateAction, updateMindClutter } from '../src/domain/mind-clutter.js'
import { splitCaptureText } from '../src/domain/capture-segmentation.js'
import { gridPositions, mapBounds } from '../src/components/mind-map.js'

test('een Brain Fart bewaart de oorspronkelijke capturtekst zonder metadata', () => {
  const mindClutter = createMindClutter({ content: '  Misschien ooit een groentewinkel bouwen.  ' })
  assert.equal(mindClutter.title, 'Misschien ooit een groentewinkel bouwen.')
  assert.equal(mindClutter.content, '  Misschien ooit een groentewinkel bouwen.  ')
  assert.equal(mindClutter.originalContent, '  Misschien ooit een groentewinkel bouwen.  ')
  assert.equal(mindClutter.weight, 3)
  assert.equal(mindClutter.status, 'thought')
  assert.equal(mindClutter.archived, false)
  assert.deepEqual(mindClutter.actions, [])
})

test('developments can be added and marked done', () => {
  const mindClutter = createMindClutter({ title: 'School', content: 'Explore options.' })
  const withAction = addAction(mindClutter, 'Talk to school')
  const renamed = updateAction(withAction, withAction.actions[0].id, 'Call the school')
  assert.equal(renamed.actions[0].text, 'Call the school')
  const complete = toggleActionDone(withAction, withAction.actions[0].id)
  assert.equal(complete.actions[0].state, 'done')
  assert.equal(updateMindClutter(complete, { weight: 9 }).weight, 5)
  assert.deepEqual(removeAction(complete, complete.actions[0].id).actions, [])
})

test('capture splitst puntkommas en gesproken segmentatiecommando’s', () => {
  const segments = splitCaptureText('  Bel de school; NIEUWE BRAIN FART onderzoek VSO. Volgende gedachte de tuin aanpakken  ; ')

  assert.deepEqual(segments, ['Bel de school', 'onderzoek VSO.', 'de tuin aanpakken'])
})

test('mindmap kan alle verplaatste nodes begrenzen en in een raster plaatsen', () => {
  const mindClutters = [
    { ...createMindClutter({ content: 'Eerste gedachte' }), mapPosition: { x: -700, y: 200 } },
    { ...createMindClutter({ content: 'Tweede gedachte' }), mapPosition: { x: 1900, y: 600 } },
  ]
  const bounds = mapBounds(mindClutters)
  const grid = gridPositions(mindClutters)

  assert.ok(bounds.minX < -700)
  assert.ok(bounds.maxX > 1900)
  assert.notDeepEqual(grid.get(mindClutters[0].id), grid.get(mindClutters[1].id))
})