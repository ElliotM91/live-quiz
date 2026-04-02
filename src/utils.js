export function makeJoinCode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += letters[Math.floor(Math.random() * letters.length)]
  }
  return code
}

export function createEmptyOptions() {
  return Array.from({ length: 10 }, (_, index) => ({
    option_number: index + 1,
    text: '',
    is_correct: false,
  }))
}

export function scoreFromCorrectCount(correctCount) {
  const scoreMap = {
    0: 100,
    1: 500,
    2: 1000,
    3: 2500,
    4: 5000,
    5: 10000,
  }
  return scoreMap[correctCount] ?? 0
}

export function formatMoney(value) {
  return `£${Number(value || 0).toLocaleString('en-GB')}`
}

export function sortLeaderboard(players) {
  return [...players].sort((a, b) => {
    if ((b.total_score || 0) !== (a.total_score || 0)) {
      return (b.total_score || 0) - (a.total_score || 0)
    }
    return (a.total_time_ms || 0) - (b.total_time_ms || 0)
  })
}