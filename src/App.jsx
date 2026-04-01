import { useMemo, useState } from 'react'
import './App.css'

const sampleQuestion = {
  prompt: 'Which five of these are mammals?',
  options: [
    { id: 1, text: 'Dog', isCorrect: true },
    { id: 2, text: 'Cat', isCorrect: true },
    { id: 3, text: 'Whale', isCorrect: true },
    { id: 4, text: 'Bat', isCorrect: true },
    { id: 5, text: 'Horse', isCorrect: true },
    { id: 6, text: 'Shark', isCorrect: false },
    { id: 7, text: 'Frog', isCorrect: false },
    { id: 8, text: 'Crocodile', isCorrect: false },
    { id: 9, text: 'Eagle', isCorrect: false },
    { id: 10, text: 'Octopus', isCorrect: false },
  ],
}

function scoreAnswers(question, selectedIds) {
  const correctIds = question.options
    .filter((option) => option.isCorrect)
    .map((option) => option.id)

  return selectedIds.filter((id) => correctIds.includes(id)).length
}

function sortPlayers(players) {
  return [...players].sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore
    }
    return a.totalTimeMs - b.totalTimeMs
  })
}

function App() {
  const [mode, setMode] = useState('host')
  const [players, setPlayers] = useState([
    { id: 1, name: 'Alice', totalScore: 0, totalTimeMs: 0 },
    { id: 2, name: 'Ben', totalScore: 0, totalTimeMs: 0 },
    { id: 3, name: 'Chloe', totalScore: 0, totalTimeMs: 0 },
  ])
  const [selectedPlayerId, setSelectedPlayerId] = useState(1)
  const [selectedOptions, setSelectedOptions] = useState([])
  const [questionOpen, setQuestionOpen] = useState(false)
  const [questionClosed, setQuestionClosed] = useState(false)
  const [questionStartTime, setQuestionStartTime] = useState(null)
  const [submissions, setSubmissions] = useState({})
  const [showAnswers, setShowAnswers] = useState(false)

  const leaderboard = useMemo(() => sortPlayers(players), [players])

  function startQuestion() {
    setQuestionOpen(true)
    setQuestionClosed(false)
    setShowAnswers(false)
    setSelectedOptions([])
    setSubmissions({})
    setQuestionStartTime(Date.now())
  }

  function closeQuestion() {
    setQuestionOpen(false)
    setQuestionClosed(true)
  }

  function revealAnswers() {
    setShowAnswers(true)
  }

  function resetGame() {
    setPlayers([
      { id: 1, name: 'Alice', totalScore: 0, totalTimeMs: 0 },
      { id: 2, name: 'Ben', totalScore: 0, totalTimeMs: 0 },
      { id: 3, name: 'Chloe', totalScore: 0, totalTimeMs: 0 },
    ])
    setSelectedPlayerId(1)
    setSelectedOptions([])
    setQuestionOpen(false)
    setQuestionClosed(false)
    setQuestionStartTime(null)
    setSubmissions({})
    setShowAnswers(false)
  }

  function toggleOption(optionId) {
    if (!questionOpen) return
    if (submissions[selectedPlayerId]) return

    if (selectedOptions.includes(optionId)) {
      setSelectedOptions(selectedOptions.filter((id) => id !== optionId))
      return
    }

    if (selectedOptions.length >= 5) return

    setSelectedOptions([...selectedOptions, optionId])
  }

  function submitAnswers() {
    if (!questionOpen) return
    if (selectedOptions.length !== 5) {
      alert('You must select exactly 5 answers.')
      return
    }
    if (submissions[selectedPlayerId]) return

    const responseTimeMs = Date.now() - questionStartTime
    const correctCount = scoreAnswers(sampleQuestion, selectedOptions)

    setPlayers((currentPlayers) =>
      currentPlayers.map((player) =>
        player.id === selectedPlayerId
          ? {
              ...player,
              totalScore: player.totalScore + correctCount,
              totalTimeMs: player.totalTimeMs + responseTimeMs,
            }
          : player
      )
    )

    setSubmissions({
      ...submissions,
      [selectedPlayerId]: {
        selectedOptions,
        correctCount,
        responseTimeMs,
      },
    })

    setSelectedOptions([])
  }

  const currentSubmission = submissions[selectedPlayerId]

  return (
    <div className="app-shell">
      <h1>Live Quiz Prototype</h1>
      <p className="intro">
        This is a very simple first prototype. It runs in one browser and lets you
        test the host controls, scoring, and leaderboard.
      </p>

      <div className="mode-switch">
        <button onClick={() => setMode('host')} className={mode === 'host' ? 'active' : ''}>
          Host View
        </button>
        <button onClick={() => setMode('player')} className={mode === 'player' ? 'active' : ''}>
          Player View
        </button>
      </div>

      {mode === 'host' && (
        <div className="panel">
          <h2>Host Controls</h2>
          <p><strong>Question:</strong> {sampleQuestion.prompt}</p>

          <div className="button-row">
            <button onClick={startQuestion}>Open Question</button>
            <button onClick={closeQuestion}>Close Question</button>
            <button onClick={revealAnswers}>Reveal Answers</button>
            <button onClick={resetGame}>Reset</button>
          </div>

          <div className="status-box">
            <p><strong>Status:</strong> {questionOpen ? 'Open' : questionClosed ? 'Closed' : 'Waiting'}</p>
            <p><strong>Submissions:</strong> {Object.keys(submissions).length} / {players.length}</p>
          </div>

          <h3>Correct Answers</h3>
          <ul>
            {sampleQuestion.options.map((option) => (
              <li key={option.id}>
                {option.text} {option.isCorrect ? '✅' : '❌'}
              </li>
            ))}
          </ul>

          <h3>Leaderboard</h3>
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Name</th>
                <th>Score</th>
                <th>Tiebreak Time</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((player, index) => (
                <tr key={player.id}>
                  <td>{index + 1}</td>
                  <td>{player.name}</td>
                  <td>{player.totalScore}</td>
                  <td>{(player.totalTimeMs / 1000).toFixed(2)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mode === 'player' && (
        <div className="panel">
          <h2>Player View</h2>

          <label className="player-select-label">
            Choose player:
            <select
              value={selectedPlayerId}
              onChange={(e) => {
                setSelectedPlayerId(Number(e.target.value))
                setSelectedOptions([])
              }}
            >
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
          </label>

          <p><strong>Question:</strong> {sampleQuestion.prompt}</p>
          <p>Select exactly 5 answers.</p>

          <div className="options-grid">
            {sampleQuestion.options.map((option) => {
              const isSelected = selectedOptions.includes(option.id)
              const isCorrect = option.isCorrect

              let className = 'option-button'
              if (isSelected) className += ' selected'
              if (showAnswers && isCorrect) className += ' correct'
              if (
                showAnswers &&
                currentSubmission &&
                currentSubmission.selectedOptions.includes(option.id) &&
                !isCorrect
              ) {
                className += ' wrong'
              }

              return (
                <button
                  key={option.id}
                  className={className}
                  onClick={() => toggleOption(option.id)}
                  disabled={!questionOpen || !!currentSubmission}
                >
                  {option.text}
                </button>
              )
            })}
          </div>

          <p><strong>Selected:</strong> {selectedOptions.length} / 5</p>

          <button onClick={submitAnswers} disabled={!questionOpen || !!currentSubmission}>
            {currentSubmission ? 'Submitted' : 'Submit Answers'}
          </button>

          {currentSubmission && (
            <div className="result-box">
              <p><strong>Score this question:</strong> {currentSubmission.correctCount} / 5</p>
              <p><strong>Response time:</strong> {(currentSubmission.responseTimeMs / 1000).toFixed(2)}s</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App