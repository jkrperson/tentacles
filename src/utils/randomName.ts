const adjectives = [
  'bold', 'calm', 'cool', 'dark', 'deep', 'fast', 'keen', 'kind', 'warm', 'wise',
  'brave', 'crisp', 'eager', 'fresh', 'lucid', 'quiet', 'sharp', 'swift', 'vivid', 'witty',
  'bright', 'gentle', 'nimble', 'silent', 'steady', 'subtle',
]

const nouns = [
  'arc', 'bay', 'elm', 'fox', 'gem', 'oak', 'owl', 'ray', 'sky', 'wolf',
  'bloom', 'cedar', 'crane', 'drift', 'ember', 'flame', 'grove', 'haven', 'larch', 'maple',
  'orbit', 'pearl', 'quill', 'ridge', 'spark', 'stone', 'thorn', 'vapor', 'creek', 'shade',
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function generateRandomName(): string {
  return `${pick(adjectives)}-${pick(nouns)}`
}
