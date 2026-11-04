import { addCards, createDeck, db } from './db'

const LEARNING = [
  ['What is **spaced repetition**?', 'Reviewing material at increasing intervals, timed just before you would forget it.'],
  ['What is the **forgetting curve**?', 'The exponential decline of memory retention over time without review (Ebbinghaus).'],
  ['What is **active recall**?', 'Retrieving an answer from memory instead of re-reading it — the act of retrieval strengthens memory.'],
  ['What does the **Again** button do?', 'Marks the card as forgotten. It comes back in a few minutes and its interval shrinks.'],
  ['When should you press **Hard**?', 'When you recalled the answer, but only with serious effort or hesitation.'],
  ['When should you press **Good**?', 'When you recalled the answer correctly after a moment of thought. This should be your default.'],
  ['When should you press **Easy**?', 'When the answer was instant and effortless. The interval grows much faster.'],
  ['What is the **minimum information principle**?', 'Keep each card as simple as possible: one fact per card.'],
  ['What is **desired retention**?', 'The probability of recall you aim for at review time. 90% is a good default.'],
  ['Why are tests useful alongside reviews?', 'They check recall in a different format (choices, typing) and surface weak cards for extra review.'],
  ['What is the **testing effect**?', 'Information is remembered better after being tested on it than after studying it again.'],
  ['What is **interleaving**?', 'Mixing different topics or problem types in one session, which improves long-term learning.'],
]

const CAPITALS = [
  ['Capital of Japan', 'Tokyo'],
  ['Capital of Canada', 'Ottawa'],
  ['Capital of Australia', 'Canberra'],
  ['Capital of Brazil', 'Brasília'],
  ['Capital of Egypt', 'Cairo'],
  ['Capital of Kenya', 'Nairobi'],
  ['Capital of Turkey', 'Ankara'],
  ['Capital of South Korea', 'Seoul'],
  ['Capital of Argentina', 'Buenos Aires'],
  ['Capital of Norway', 'Oslo'],
  ['Capital of Vietnam', 'Hanoi'],
  ['Capital of Morocco', 'Rabat'],
  ['Capital of New Zealand', 'Wellington'],
  ['Capital of Switzerland', 'Bern'],
  ['Capital of Pakistan', 'Islamabad'],
  ['Capital of Peru', 'Lima'],
]

export function loadSampleDecks() {
  return db.transaction('rw', db.decks, db.cards, insertSamples)
}

async function insertSamples() {
  const a = await createDeck({ name: 'How to learn', description: 'The science behind this app — start here.', color: '#6366f1' })
  await addCards(a.id, LEARNING.map(([front, back]) => ({ front, back, tags: ['meta'] })))
  const b = await createDeck({ name: 'World capitals', description: 'Great for trying out tests.', color: '#10b981' })
  await addCards(b.id, CAPITALS.map(([front, back]) => ({ front, back, tags: ['geography'] })))
  return [a, b]
}
