import { useEffect, useState } from 'react'
import './App.css'
import { supabase } from './supabase'

function makeJoinCode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += letters[Math.floor(Math.random() * letters.length)]
  }
  return code
}

function createEmptyOptions() {
  return Array.from({ length: 10 }, (_, index) => ({
    option_number: index + 1,
    text: '',
    is_correct: false,
  }))
}

function sortLeaderboard(players) {
  return [...players].sort((a, b) => {
    if ((b.total_score || 0) !== (a.total_score || 0)) {
      return (b.total_score || 0) - (a.total_score || 0)
    }
    return (a.total_time_ms || 0) - (b.total_time_ms || 0)
  })
}

function App() {
  const [viewMode, setViewMode] = useState('host')

  const [statusMessage, setStatusMessage] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [createdGame, setCreatedGame] = useState(null)

  const [playerName, setPlayerName] = useState('')
  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [joinMessage, setJoinMessage] = useState('')
  const [joinedPlayer, setJoinedPlayer] = useState(null)
  const [isJoining, setIsJoining] = useState(false)

  const [playersInGame, setPlayersInGame] = useState([])
  const [playerListMessage, setPlayerListMessage] = useState('')

  const [questionPrompt, setQuestionPrompt] = useState('')
  const [answerOptions, setAnswerOptions] = useState(createEmptyOptions())
  const [questionMessage, setQuestionMessage] = useState('')
  const [isSavingQuestion, setIsSavingQuestion] = useState(false)
  const [savedQuestion, setSavedQuestion] = useState(null)

  const [loadedPlayerQuestion, setLoadedPlayerQuestion] = useState(null)
  const [loadedPlayerOptions, setLoadedPlayerOptions] = useState([])
  const [playerQuestionMessage, setPlayerQuestionMessage] = useState('')
  const [questionLoadedAt, setQuestionLoadedAt] = useState(null)

  const [selectedOptionIds, setSelectedOptionIds] = useState([])
  const [submissionMessage, setSubmissionMessage] = useState('')
  const [submittedResult, setSubmittedResult] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [leaderboard, setLeaderboard] = useState([])
  const [leaderboardMessage, setLeaderboardMessage] = useState('')
  const [submissionCount, setSubmissionCount] = useState(0)
  const [submissionCountMessage, setSubmissionCountMessage] = useState('')

  const [templates, setTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [templateMessage, setTemplateMessage] = useState('')

  async function createGame() {
    setIsCreating(true)
    setStatusMessage('Creating game...')

    const joinCode = makeJoinCode()

    const { data, error } = await supabase
      .from('games')
      .insert([
        {
          join_code: joinCode,
          status: 'lobby',
          current_question_number: 1,
        },
      ])
      .select()
      .single()

    if (error) {
      setStatusMessage(`Error: ${error.message}`)
      setIsCreating(false)
      return
    }

    setCreatedGame(data)
    setPlayersInGame([])
    setPlayerListMessage('Game created successfully.')
    setStatusMessage('Game created successfully.')
    setQuestionMessage('')
    setSavedQuestion(null)
    setQuestionPrompt('')
    setAnswerOptions(createEmptyOptions())
    setLoadedPlayerQuestion(null)
    setLoadedPlayerOptions([])
    setPlayerQuestionMessage('')
    setSelectedOptionIds([])
    setSubmissionMessage('')
    setSubmittedResult(null)
    setQuestionLoadedAt(null)
    setLeaderboard([])
    setLeaderboardMessage('')
    setSubmissionCount(0)
    setSubmissionCountMessage('')
    setIsCreating(false)
  }

  async function joinGame() {
    setIsJoining(true)
    setJoinMessage('')
    setJoinedPlayer(null)
    setLoadedPlayerQuestion(null)
    setLoadedPlayerOptions([])
    setPlayerQuestionMessage('')
    setSelectedOptionIds([])
    setSubmissionMessage('')
    setSubmittedResult(null)
    setQuestionLoadedAt(null)

    const cleanCode = joinCodeInput.trim().toUpperCase()
    const cleanName = playerName.trim()

    if (!cleanCode || !cleanName) {
      setJoinMessage('Please enter both a name and a join code.')
      setIsJoining(false)
      return
    }

    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('join_code', cleanCode)
      .single()

    if (gameError || !game) {
      setJoinMessage('Game not found. Check the join code.')
      setIsJoining(false)
      return
    }

    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert([
        {
          game_id: game.id,
          name: cleanName,
          total_score: 0,
          total_time_ms: 0,
        },
      ])
      .select()
      .single()

    if (playerError) {
      setJoinMessage(`Could not join game: ${playerError.message}`)
      setIsJoining(false)
      return
    }

    setJoinedPlayer(player)
    setJoinMessage(`Joined game ${cleanCode} successfully.`)
    setIsJoining(false)
  }

  async function loadPlayersForCreatedGame(showMessage = true) {
    if (!createdGame) {
      if (showMessage) setPlayerListMessage('Create a game first.')
      return
    }

    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', createdGame.id)
      .order('joined_at', { ascending: true })

    if (error) {
      if (showMessage) setPlayerListMessage(`Could not load players: ${error.message}`)
      return
    }

    setPlayersInGame(data || [])

    if (showMessage) {
      if (!data || data.length === 0) {
        setPlayerListMessage('No players have joined yet.')
      } else {
        setPlayerListMessage(`Loaded ${data.length} player(s).`)
      }
    }
  }

  function updateOptionText(index, value) {
    const next = [...answerOptions]
    next[index].text = value
    setAnswerOptions(next)
  }

  function updateOptionCorrect(index, checked) {
    const next = [...answerOptions]
    next[index].is_correct = checked
    setAnswerOptions(next)
  }

  async function loadTemplates() {
    const { data, error } = await supabase
      .from('question_templates')
      .select('*')
      .order('id', { ascending: true })

    if (error) {
      setTemplateMessage(`Could not load templates: ${error.message}`)
      return
    }

    setTemplates(data || [])
    if (data && data.length > 0) {
      setTemplateMessage(`Loaded ${data.length} template question(s).`)
      if (!selectedTemplateId) {
        setSelectedTemplateId(String(data[0].id))
      }
    } else {
      setTemplateMessage('No template questions found.')
    }
  }

  async function loadSelectedTemplate() {
    if (!selectedTemplateId) {
      setTemplateMessage('Choose a template first.')
      return
    }

    const templateId = Number(selectedTemplateId)

    const { data: template, error: templateError } = await supabase
      .from('question_templates')
      .select('*')
      .eq('id', templateId)
      .single()

    if (templateError || !template) {
      setTemplateMessage('Could not load selected template.')
      return
    }

    const { data: options, error: optionsError } = await supabase
      .from('question_template_options')
      .select('*')
      .eq('template_id', templateId)
      .order('option_number', { ascending: true })

    if (optionsError) {
      setTemplateMessage(`Template loaded, but options failed: ${optionsError.message}`)
      return
    }

    setQuestionPrompt(template.prompt)
    setAnswerOptions(
      (options || []).map((option) => ({
        option_number: option.option_number,
        text: option.text,
        is_correct: option.is_correct,
      }))
    )
    setTemplateMessage(`Loaded template: ${template.title}`)
    setQuestionMessage('')
    setSavedQuestion(null)
    setSubmissionCount(0)
    setSubmissionCountMessage('')
  }

  async function saveQuestion() {
    if (!createdGame) {
      setQuestionMessage('Create a game first.')
      return
    }

    const cleanPrompt = questionPrompt.trim()
    const correctCount = answerOptions.filter((option) => option.is_correct).length
    const hasEmptyOption = answerOptions.some((option) => option.text.trim() === '')

    if (!cleanPrompt) {
      setQuestionMessage('Please enter the question prompt.')
      return
    }

    if (hasEmptyOption) {
      setQuestionMessage('Please fill in all 10 answer options.')
      return
    }

    if (correctCount !== 5) {
      setQuestionMessage('You must mark exactly 5 answers as correct.')
      return
    }

    setIsSavingQuestion(true)
    setQuestionMessage('Saving question...')
    setSavedQuestion(null)

    const { data: question, error: questionError } = await supabase
      .from('questions')
      .insert([
        {
          game_id: createdGame.id,
          question_number: createdGame.current_question_number,
          prompt: cleanPrompt,
          status: 'draft',
        },
      ])
      .select()
      .single()

    if (questionError) {
      setQuestionMessage(`Could not save question: ${questionError.message}`)
      setIsSavingQuestion(false)
      return
    }

    const optionRows = answerOptions.map((option) => ({
      question_id: question.id,
      option_number: option.option_number,
      text: option.text.trim(),
      is_correct: option.is_correct,
    }))

    const { error: optionsError } = await supabase
      .from('answer_options')
      .insert(optionRows)

    if (optionsError) {
      setQuestionMessage(`Question saved, but options failed: ${optionsError.message}`)
      setIsSavingQuestion(false)
      return
    }

    setSavedQuestion(question)
    setQuestionMessage('Question saved successfully.')
    setIsSavingQuestion(false)
  }

  async function openQuestion() {
    if (!savedQuestion) {
      setQuestionMessage('Save a question first.')
      return
    }

    const { data, error } = await supabase
      .from('questions')
      .update({
        status: 'open',
        opened_at: new Date().toISOString(),
        closed_at: null,
      })
      .eq('id', savedQuestion.id)
      .select()
      .single()

    if (error) {
      setQuestionMessage(`Could not open question: ${error.message}`)
      return
    }

    setSavedQuestion(data)
    setQuestionMessage('Question is now open.')
  }

  async function closeQuestion() {
    if (!savedQuestion) {
      setQuestionMessage('Save a question first.')
      return
    }

    const { data, error } = await supabase
      .from('questions')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
      })
      .eq('id', savedQuestion.id)
      .select()
      .single()

    if (error) {
      setQuestionMessage(`Could not close question: ${error.message}`)
      return
    }

    setSavedQuestion(data)
    setQuestionMessage('Question is now closed.')
  }

  async function revealAnswers() {
    if (!savedQuestion) {
      setQuestionMessage('Save a question first.')
      return
    }

    const { data, error } = await supabase
      .from('questions')
      .update({
        status: 'revealed',
      })
      .eq('id', savedQuestion.id)
      .select()
      .single()

    if (error) {
      setQuestionMessage(`Could not reveal answers: ${error.message}`)
      return
    }

    setSavedQuestion(data)
    setQuestionMessage('Answers are now revealed.')
  }

  async function goToNextQuestion() {
    if (!createdGame) {
      setQuestionMessage('Create a game first.')
      return
    }

    const nextNumber = (createdGame.current_question_number || 1) + 1

    const { data, error } = await supabase
      .from('games')
      .update({
        current_question_number: nextNumber,
      })
      .eq('id', createdGame.id)
      .select()
      .single()

    if (error) {
      setQuestionMessage(`Could not move to next question: ${error.message}`)
      return
    }

    const { error: resetPlayersError } = await supabase
      .from('players')
      .update({
        total_score: 0,
        total_time_ms: 0,
      })
      .eq('game_id', createdGame.id)

    if (resetPlayersError) {
      setQuestionMessage(`Moved to next question, but could not reset player scores: ${resetPlayersError.message}`)
      return
    }

    setCreatedGame(data)
    setSavedQuestion(null)
    setQuestionPrompt('')
    setAnswerOptions(createEmptyOptions())
    setQuestionMessage(`Ready for question ${nextNumber}. Load a template to continue.`)
    setSubmissionCount(0)
    setSubmissionCountMessage('')
    setLeaderboard([])
    setLeaderboardMessage('')
    setPlayersInGame([])
    setLoadedPlayerQuestion(null)
    setLoadedPlayerOptions([])
    setPlayerQuestionMessage('Waiting for next question.')
    setSelectedOptionIds([])
    setSubmissionMessage('')
    setSubmittedResult(null)
    setQuestionLoadedAt(null)

    if (joinedPlayer) {
      setJoinedPlayer({
        ...joinedPlayer,
        total_score: 0,
        total_time_ms: 0,
      })
    }
  }

  async function loadQuestionForPlayer(showMessage = true) {
    if (!joinedPlayer) {
      if (showMessage) setPlayerQuestionMessage('Join a game first.')
      return
    }

    const existingQuestionId = loadedPlayerQuestion?.id || null

    const { data: question, error: questionError } = await supabase
      .from('questions')
      .select('*')
      .eq('game_id', joinedPlayer.game_id)
      .in('status', ['open', 'closed', 'revealed'])
      .order('question_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (questionError) {
      if (showMessage) setPlayerQuestionMessage(`Could not load question: ${questionError.message}`)
      return
    }

    if (!question) {
      setLoadedPlayerQuestion(null)
      setLoadedPlayerOptions([])
      if (showMessage) {
        setPlayerQuestionMessage('No live or revealed question found for this game.')
      }
      return
    }

    const { data: options, error: optionsError } = await supabase
      .from('answer_options')
      .select('*')
      .eq('question_id', question.id)
      .order('option_number', { ascending: true })

    if (optionsError) {
      if (showMessage) setPlayerQuestionMessage(`Question loaded, but options failed: ${optionsError.message}`)
      return
    }

    const isNewQuestion = existingQuestionId !== question.id

    setLoadedPlayerQuestion(question)
    setLoadedPlayerOptions(options || [])

    if (isNewQuestion) {
      setSelectedOptionIds([])
      setSubmittedResult(null)
      setSubmissionMessage('')
      setQuestionLoadedAt(Date.now())
    }

    if (showMessage) {
      if (question.status === 'revealed') {
        setPlayerQuestionMessage('Answers have been revealed.')
      } else if (question.status === 'closed') {
        setPlayerQuestionMessage('Question is closed.')
      } else {
        setPlayerQuestionMessage('Open question loaded successfully.')
      }
    }
  }

  function togglePlayerOption(optionId) {
    if (submittedResult) return
    if (!loadedPlayerQuestion || loadedPlayerQuestion.status !== 'open') return

    if (selectedOptionIds.includes(optionId)) {
      setSelectedOptionIds(selectedOptionIds.filter((id) => id !== optionId))
      return
    }

    if (selectedOptionIds.length >= 5) {
      return
    }

    setSelectedOptionIds([...selectedOptionIds, optionId])
  }

  async function submitAnswers() {
    if (!joinedPlayer) {
      setSubmissionMessage('Join a game first.')
      return
    }

    if (!loadedPlayerQuestion) {
      setSubmissionMessage('Load an open question first.')
      return
    }

    if (loadedPlayerQuestion.status !== 'open') {
      setSubmissionMessage('This question is no longer open.')
      return
    }

    if (selectedOptionIds.length !== 5) {
      setSubmissionMessage('You must select exactly 5 answers.')
      return
    }

    if (!questionLoadedAt) {
      setSubmissionMessage('Question timing was not started properly. Reload the question and try again.')
      return
    }

    setIsSubmitting(true)
    setSubmissionMessage('Submitting answers...')
    setSubmittedResult(null)

    const { data: freshQuestion, error: freshQuestionError } = await supabase
      .from('questions')
      .select('*')
      .eq('id', loadedPlayerQuestion.id)
      .single()

    if (freshQuestionError || !freshQuestion) {
      setSubmissionMessage('Could not verify question status before submitting.')
      setIsSubmitting(false)
      return
    }

    if (freshQuestion.status !== 'open') {
      setLoadedPlayerQuestion(freshQuestion)
      setSubmissionMessage('The host has closed this question. Submission blocked.')
      setIsSubmitting(false)
      return
    }

    const correctIds = loadedPlayerOptions
      .filter((option) => option.is_correct)
      .map((option) => option.id)

    const correctCount = selectedOptionIds.filter((id) => correctIds.includes(id)).length
    const responseTimeMs = Math.max(0, Date.now() - questionLoadedAt)

    const { data: submission, error: submissionError } = await supabase
      .from('submissions')
      .insert([
        {
          question_id: loadedPlayerQuestion.id,
          player_id: joinedPlayer.id,
          selected_option_ids: selectedOptionIds,
          correct_count: correctCount,
          response_time_ms: responseTimeMs,
        },
      ])
      .select()
      .single()

    if (submissionError) {
      setSubmissionMessage(`Could not submit answers: ${submissionError.message}`)
      setIsSubmitting(false)
      return
    }

    const updatedTotalScore = (joinedPlayer.total_score || 0) + correctCount
    const updatedTotalTimeMs = (joinedPlayer.total_time_ms || 0) + responseTimeMs

    const { error: playerUpdateError } = await supabase
      .from('players')
      .update({
        total_score: updatedTotalScore,
        total_time_ms: updatedTotalTimeMs,
      })
      .eq('id', joinedPlayer.id)

    if (playerUpdateError) {
      setSubmissionMessage(`Answers saved, but player score update failed: ${playerUpdateError.message}`)
      setIsSubmitting(false)
      return
    }

    setJoinedPlayer({
      ...joinedPlayer,
      total_score: updatedTotalScore,
      total_time_ms: updatedTotalTimeMs,
    })

    setSubmittedResult(submission)
    setSubmissionMessage('Answers submitted. Waiting for reveal.')
    setIsSubmitting(false)
  }

  async function loadLeaderboard(showMessage = true) {
    if (!createdGame) {
      if (showMessage) setLeaderboardMessage('Create a game first.')
      return
    }

    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', createdGame.id)

    if (error) {
      if (showMessage) setLeaderboardMessage(`Could not load leaderboard: ${error.message}`)
      return
    }

    const sorted = sortLeaderboard(data || [])
    setLeaderboard(sorted)

    if (showMessage) {
      if (!sorted.length) {
        setLeaderboardMessage('No players in leaderboard yet.')
      } else {
        setLeaderboardMessage(`Loaded ${sorted.length} player(s).`)
      }
    }
  }

  async function loadSubmissionCount(showMessage = true) {
    if (!savedQuestion) {
      if (showMessage) setSubmissionCountMessage('Save a question first.')
      return
    }

    const { count, error } = await supabase
      .from('submissions')
      .select('*', { count: 'exact', head: true })
      .eq('question_id', savedQuestion.id)

    if (error) {
      if (showMessage) setSubmissionCountMessage(`Could not load submission count: ${error.message}`)
      return
    }

    setSubmissionCount(count || 0)
    if (showMessage) {
      setSubmissionCountMessage('Submission count loaded.')
    }
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  useEffect(() => {
    if (viewMode !== 'host' || !createdGame) return

    const interval = setInterval(() => {
      loadPlayersForCreatedGame(false)
      loadLeaderboard(false)
      if (savedQuestion) {
        loadSubmissionCount(false)
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [viewMode, createdGame, savedQuestion])

  useEffect(() => {
    if (viewMode !== 'player' || !joinedPlayer) return

    const interval = setInterval(() => {
      loadQuestionForPlayer(false)
    }, 3000)

    return () => clearInterval(interval)
  }, [viewMode, joinedPlayer, submittedResult, loadedPlayerQuestion])

  return (
    <div className="app-shell">
      <h1>Live Quiz Prototype</h1>
      <p className="intro">
        This version adds a proper next-question flow using your Supabase templates.
      </p>

      <div className="mode-switch">
        <button
          onClick={() => setViewMode('host')}
          className={viewMode === 'host' ? 'active' : ''}
        >
          Host View
        </button>
        <button
          onClick={() => setViewMode('player')}
          className={viewMode === 'player' ? 'active' : ''}
        >
          Player View
        </button>
      </div>

      {viewMode === 'host' && (
        <>
          <div className="panel">
            <h2>Host: Create a Game</h2>
            <button onClick={createGame} disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create Game'}
            </button>

            <div className="status-box">
              <p><strong>Status:</strong> {statusMessage || 'Waiting'}</p>
            </div>

            {createdGame && (
              <div className="result-box">
                <p><strong>Game ID:</strong> {createdGame.id}</p>
                <p><strong>Join code:</strong> {createdGame.join_code}</p>
                <p><strong>Question number:</strong> {createdGame.current_question_number}</p>
              </div>
            )}
          </div>

          <div className="panel" style={{ marginTop: '20px' }}>
            <h2>Host: Load Template Question</h2>

            <div style={{ marginBottom: '12px' }}>
              <label>
                <strong>Choose template</strong>
              </label>
              <br />
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                style={{ marginTop: '6px', padding: '8px', width: '100%', maxWidth: '420px' }}
              >
                <option value="">Select a question template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))}
              </select>
            </div>

            <button onClick={loadTemplates}>Reload Templates</button>
            <button onClick={loadSelectedTemplate} style={{ marginLeft: '10px' }}>
              Load Selected Template
            </button>

            <div className="status-box">
              <p><strong>Template status:</strong> {templateMessage || 'Waiting'}</p>
            </div>
          </div>

          <div className="panel" style={{ marginTop: '20px' }}>
            <h2>Host: Player List</h2>

            <button onClick={() => loadPlayersForCreatedGame(true)} disabled={!createdGame}>
              Refresh Player List
            </button>

            <div className="status-box">
              <p><strong>Player list status:</strong> {playerListMessage || 'Waiting'}</p>
              <p><strong>Auto-refresh:</strong> Every 3 seconds</p>
            </div>

            {playersInGame.length > 0 && (
              <div className="result-box">
                <p><strong>Players in this game:</strong></p>
                <ul>
                  {playersInGame.map((player) => (
                    <li key={player.id}>
                      {player.name} — score: {player.total_score} — tiebreak time: {player.total_time_ms} ms
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="panel" style={{ marginTop: '20px' }}>
            <h2>Host: Current Question</h2>

            <div style={{ marginBottom: '12px' }}>
              <label>
                <strong>Question prompt</strong>
              </label>
              <br />
              <input
                type="text"
                value={questionPrompt}
                onChange={(e) => setQuestionPrompt(e.target.value)}
                placeholder="Enter the question"
                style={{ marginTop: '6px', padding: '8px', width: '100%', maxWidth: '700px' }}
              />
            </div>

            <p><strong>Round number:</strong> {createdGame?.current_question_number || 1}</p>
            <p><strong>Answer options</strong> — 10 total, exactly 5 correct.</p>

            {answerOptions.map((option, index) => (
              <div key={option.option_number} style={{ marginBottom: '10px' }}>
                <input
                  type="text"
                  value={option.text}
                  onChange={(e) => updateOptionText(index, e.target.value)}
                  placeholder={`Option ${option.option_number}`}
                  style={{ padding: '8px', width: '100%', maxWidth: '420px', marginRight: '10px' }}
                />
                <label style={{ marginLeft: '10px' }}>
                  <input
                    type="checkbox"
                    checked={option.is_correct}
                    onChange={(e) => updateOptionCorrect(index, e.target.checked)}
                  />{' '}
                  Correct
                </label>
              </div>
            ))}

            <button onClick={saveQuestion} disabled={isSavingQuestion || !createdGame}>
              {isSavingQuestion ? 'Saving...' : 'Save Question'}
            </button>

            <button onClick={openQuestion} disabled={!savedQuestion} style={{ marginLeft: '10px' }}>
              Open Question
            </button>

            <button onClick={closeQuestion} disabled={!savedQuestion} style={{ marginLeft: '10px' }}>
              Close Question
            </button>

            <button onClick={revealAnswers} disabled={!savedQuestion} style={{ marginLeft: '10px' }}>
              Reveal Answers
            </button>

            <button onClick={goToNextQuestion} disabled={!createdGame} style={{ marginLeft: '10px' }}>
              Next Question
            </button>

            <div className="status-box">
              <p><strong>Question status:</strong> {questionMessage || 'Waiting'}</p>
            </div>

            {savedQuestion && (
              <div className="result-box">
                <p><strong>Question ID:</strong> {savedQuestion.id}</p>
                <p><strong>Game ID:</strong> {savedQuestion.game_id}</p>
                <p><strong>Question number:</strong> {savedQuestion.question_number}</p>
                <p><strong>Prompt:</strong> {savedQuestion.prompt}</p>
                <p><strong>Status:</strong> {savedQuestion.status}</p>
              </div>
            )}
          </div>

          <div className="panel" style={{ marginTop: '20px' }}>
            <h2>Host: Leaderboard</h2>

            <button onClick={() => loadLeaderboard(true)} disabled={!createdGame}>
              Refresh Leaderboard
            </button>

            <div className="status-box">
              <p><strong>Leaderboard status:</strong> {leaderboardMessage || 'Waiting'}</p>
              <p><strong>Auto-refresh:</strong> Every 3 seconds</p>
            </div>

            {leaderboard.length > 0 && (
              <div className="result-box">
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
                        <td>{player.total_score}</td>
                        <td>{player.total_time_ms} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel" style={{ marginTop: '20px' }}>
            <h2>Host: Submission Count</h2>

            <button onClick={() => loadSubmissionCount(true)} disabled={!savedQuestion}>
              Refresh Submission Count
            </button>

            <div className="status-box">
              <p><strong>Submission count status:</strong> {submissionCountMessage || 'Waiting'}</p>
              <p><strong>Auto-refresh:</strong> Every 3 seconds</p>
            </div>

            <div className="result-box">
              <p><strong>Submissions for current question:</strong> {submissionCount}</p>
            </div>
          </div>
        </>
      )}

      {viewMode === 'player' && (
        <>
          <div className="panel">
            <h2>Player: Join a Game</h2>

            <div style={{ marginBottom: '12px' }}>
              <label>
                <strong>Your name</strong>
              </label>
              <br />
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                style={{ marginTop: '6px', padding: '8px', width: '100%', maxWidth: '320px' }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label>
                <strong>Join code</strong>
              </label>
              <br />
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="ABCD"
                style={{ marginTop: '6px', padding: '8px', width: '100%', maxWidth: '320px' }}
              />
            </div>

            <button onClick={joinGame} disabled={isJoining}>
              {isJoining ? 'Joining...' : 'Join Game'}
            </button>

            <div className="status-box">
              <p><strong>Join status:</strong> {joinMessage || 'Waiting'}</p>
            </div>

            {joinedPlayer && (
              <div className="result-box">
                <p><strong>Player ID:</strong> {joinedPlayer.id}</p>
                <p><strong>Name:</strong> {joinedPlayer.name}</p>
                <p><strong>Game ID:</strong> {joinedPlayer.game_id}</p>
                <p><strong>Total score:</strong> {joinedPlayer.total_score}</p>
              </div>
            )}
          </div>

          <div className="panel" style={{ marginTop: '20px' }}>
            <h2>Player: Current Question</h2>

            <button onClick={() => loadQuestionForPlayer(true)} disabled={!joinedPlayer}>
              Load Current Question
            </button>

            <div className="status-box">
              <p><strong>Question load status:</strong> {playerQuestionMessage || 'Waiting'}</p>
              <p><strong>Auto-refresh:</strong> Every 3 seconds</p>
            </div>

            {loadedPlayerQuestion && (
              <div className="result-box">
                <p><strong>Question:</strong> {loadedPlayerQuestion.prompt}</p>
                <p><strong>Question number:</strong> {loadedPlayerQuestion.question_number}</p>
                <p><strong>Status:</strong> {loadedPlayerQuestion.status}</p>

                {loadedPlayerOptions.length > 0 && (
                  <>
                    <p><strong>Choose exactly 5 answers:</strong></p>
                    <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
                      {loadedPlayerOptions.map((option) => {
                        const isSelected = selectedOptionIds.includes(option.id)
                        const isCorrect = option.is_correct
                        const showReveal = loadedPlayerQuestion.status === 'revealed'
                        const selectedWrong = showReveal && isSelected && !isCorrect

                        return (
                          <li
                            key={option.id}
                            style={{
                              marginBottom: '8px',
                              padding: '6px 8px',
                              borderRadius: '8px',
                              background:
                                showReveal && isCorrect
                                  ? '#dcfce7'
                                  : selectedWrong
                                  ? '#fee2e2'
                                  : 'transparent',
                              border:
                                showReveal && isCorrect
                                  ? '1px solid #16a34a'
                                  : selectedWrong
                                  ? '1px solid #dc2626'
                                  : '1px solid transparent',
                            }}
                          >
                            <label>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => togglePlayerOption(option.id)}
                                disabled={
                                  isSubmitting ||
                                  !!submittedResult ||
                                  loadedPlayerQuestion.status !== 'open' ||
                                  (!isSelected && selectedOptionIds.length >= 5)
                                }
                              />{' '}
                              {option.text}
                              {showReveal && isCorrect ? ' ✅' : ''}
                              {selectedWrong ? ' ❌' : ''}
                            </label>
                          </li>
                        )
                      })}
                    </ul>

                    <p><strong>Selected:</strong> {selectedOptionIds.length} / 5</p>

                    <button
                      onClick={submitAnswers}
                      disabled={
                        isSubmitting ||
                        !!submittedResult ||
                        loadedPlayerQuestion.status !== 'open'
                      }
                    >
                      {isSubmitting ? 'Submitting...' : submittedResult ? 'Submitted' : 'Submit Answers'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="panel" style={{ marginTop: '20px' }}>
            <h2>Player: Submission Result</h2>

            <div className="status-box">
              <p><strong>Submission status:</strong> {submissionMessage || 'Waiting'}</p>
            </div>

            {submittedResult && loadedPlayerQuestion?.status !== 'revealed' && (
              <div className="result-box">
                <p><strong>Submission received.</strong></p>
                <p>Waiting for the host to reveal the answers.</p>
              </div>
            )}

            {submittedResult && loadedPlayerQuestion?.status === 'revealed' && (
              <div className="result-box">
                <p><strong>Submission ID:</strong> {submittedResult.id}</p>
                <p><strong>Correct count:</strong> {submittedResult.correct_count} / 5</p>
                <p><strong>Response time:</strong> {submittedResult.response_time_ms} ms</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default App