import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { supabase } from './supabase'

const HOST_KEY = 'host123'
const SCREEN_KEY = 'screen123'
const HOLDING_LOGO_URL = '/prize-fight-logo.png'

const GAME_PHASES = {
  LOBBY: 'lobby',
  HOLDING: 'holding',
  QUESTION_READY: 'question_ready',
  QUESTION_OPEN: 'question_open',
  QUESTION_CLOSED: 'question_closed',
  ANSWER_REVEAL: 'answer_reveal',
  LEADERBOARD: 'leaderboard',
}

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

function scoreFromCorrectCount(correctCount) {
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

function formatMoney(value) {
  return `£${Number(value || 0).toLocaleString('en-GB')}`
}

function sortLeaderboard(players) {
  return [...players].sort((a, b) => {
    if ((b.total_score || 0) !== (a.total_score || 0)) {
      return (b.total_score || 0) - (a.total_score || 0)
    }
    return (a.total_time_ms || 0) - (b.total_time_ms || 0)
  })
}

function resolveGamePhase(gameStatus, questionStatus) {
  if (gameStatus === GAME_PHASES.LOBBY) return GAME_PHASES.LOBBY
  if (gameStatus === GAME_PHASES.HOLDING) return GAME_PHASES.HOLDING
  if (gameStatus === GAME_PHASES.LEADERBOARD) return GAME_PHASES.LEADERBOARD
  if (gameStatus === GAME_PHASES.QUESTION_READY) return GAME_PHASES.QUESTION_READY
  if (gameStatus === GAME_PHASES.QUESTION_OPEN) return GAME_PHASES.QUESTION_OPEN
  if (gameStatus === GAME_PHASES.QUESTION_CLOSED) return GAME_PHASES.QUESTION_CLOSED
  if (gameStatus === GAME_PHASES.ANSWER_REVEAL) return GAME_PHASES.ANSWER_REVEAL

  if (questionStatus === 'revealed') return GAME_PHASES.ANSWER_REVEAL
  if (questionStatus === 'closed') return GAME_PHASES.QUESTION_CLOSED
  if (questionStatus === 'open') return GAME_PHASES.QUESTION_OPEN
  if (questionStatus === 'draft') return GAME_PHASES.QUESTION_READY

  return GAME_PHASES.LOBBY
}

function getPhaseLabel(phase) {
  switch (phase) {
    case GAME_PHASES.LOBBY:
      return 'Lobby'
    case GAME_PHASES.HOLDING:
      return 'Holding'
    case GAME_PHASES.QUESTION_READY:
      return 'Question Ready'
    case GAME_PHASES.QUESTION_OPEN:
      return 'Question Open'
    case GAME_PHASES.QUESTION_CLOSED:
      return 'Question Closed'
    case GAME_PHASES.ANSWER_REVEAL:
      return 'Answer Reveal'
    case GAME_PHASES.LEADERBOARD:
      return 'Leaderboard'
    default:
      return 'Lobby'
  }
}

function getPhaseDescription(phase) {
  switch (phase) {
    case GAME_PHASES.LOBBY:
      return 'Waiting for players and the next question.'
    case GAME_PHASES.HOLDING:
      return 'Show logo / holding screen on the big display.'
    case GAME_PHASES.QUESTION_READY:
      return 'Question saved and ready for the host to open.'
    case GAME_PHASES.QUESTION_OPEN:
      return 'Players can currently answer on their phones.'
    case GAME_PHASES.QUESTION_CLOSED:
      return 'Answers are locked. Waiting for reveal.'
    case GAME_PHASES.ANSWER_REVEAL:
      return 'Correct answers are being shown on the big screen.'
    case GAME_PHASES.LEADERBOARD:
      return 'Leaderboard is showing on the big screen.'
    default:
      return 'Waiting for players and the next question.'
  }
}

function getNextActionLabel(phase) {
  switch (phase) {
    case GAME_PHASES.LOBBY:
      return 'Load a template or write a question.'
    case GAME_PHASES.HOLDING:
      return 'Return to join, question or leaderboard when ready.'
    case GAME_PHASES.QUESTION_READY:
      return 'Open the question when ready.'
    case GAME_PHASES.QUESTION_OPEN:
      return 'Monitor submissions, then close the question.'
    case GAME_PHASES.QUESTION_CLOSED:
      return 'Reveal the correct answers.'
    case GAME_PHASES.ANSWER_REVEAL:
      return 'Show the leaderboard or move to the next question.'
    case GAME_PHASES.LEADERBOARD:
      return 'Move to the next question when ready.'
    default:
      return 'Continue the game.'
  }
}

function mapOptionsToFullSet(options) {
  const base = createEmptyOptions()
  ;(options || []).forEach((option) => {
    const index = (option.option_number || 1) - 1
    if (base[index]) {
      base[index] = {
        option_number: option.option_number,
        text: option.text,
        is_correct: option.is_correct,
      }
    }
  })
  return base
}

function App() {
  const [viewMode, setViewMode] = useState('player')
  const [accessLevel, setAccessLevel] = useState('player')

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

  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [currentQuestionOptions, setCurrentQuestionOptions] = useState([])

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

  const gamePhase = useMemo(
    () => resolveGamePhase(createdGame?.status, currentQuestion?.status),
    [createdGame?.status, currentQuestion?.status]
  )

  const screenUrl = useMemo(() => {
    if (!createdGame) return ''
    return `${window.location.origin}/?mode=screen&key=${SCREEN_KEY}&code=${createdGame.join_code}`
  }, [createdGame])

  const playerJoinUrl = useMemo(() => {
    if (!createdGame) return ''
    return `${window.location.origin}/?code=${createdGame.join_code}`
  }, [createdGame])

  const qrCodeUrl = useMemo(() => {
    if (!playerJoinUrl) return ''
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(playerJoinUrl)}`
  }, [playerJoinUrl])

  const canOpenQuestion = !!createdGame && !!currentQuestion && currentQuestion.status === 'draft'
  const canCloseQuestion = !!createdGame && !!currentQuestion && currentQuestion.status === 'open'
  const canRevealAnswers = !!createdGame && !!currentQuestion && currentQuestion.status === 'closed'
  const canShowQuestionOnScreen = !!createdGame && !!currentQuestion
  const canShowLeaderboard = !!createdGame
  const canGoNext = !!createdGame

  const playerQuestionIsOpen = loadedPlayerQuestion?.status === 'open'
  const playerQuestionIsRevealed = loadedPlayerQuestion?.status === 'revealed'
  const playerWaitingAfterSubmit = !!submittedResult && !playerQuestionIsRevealed
  const playerShowLiveQuestion = !!joinedPlayer && playerQuestionIsOpen && !submittedResult

  const hostLeaderboardPlayers = useMemo(
    () =>
      sortLeaderboard(leaderboard).filter(
        (player) => (player.total_score || 0) > 0 || (player.total_time_ms || 0) > 0
      ),
    [leaderboard]
  )

  const screenLeaderboardPlayers = useMemo(
    () => hostLeaderboardPlayers.slice(1),
    [hostLeaderboardPlayers]
  )

  const playerRevealOptions = useMemo(
    () => loadedPlayerOptions.filter((option) => selectedOptionIds.includes(option.id)),
    [loadedPlayerOptions, selectedOptionIds]
  )

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

  async function refreshGame(gameId, showMessage = false) {
    if (!gameId) return null

    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single()

    if (error || !data) {
      if (showMessage) {
        setStatusMessage(error?.message ? `Could not refresh game: ${error.message}` : 'Could not refresh game.')
      }
      return null
    }

    setCreatedGame(data)
    return data
  }

  async function loadGameByJoinCode(joinCode) {
    if (!joinCode) return null

    const cleanCode = joinCode.trim().toUpperCase()

    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('join_code', cleanCode)
      .single()

    if (error || !data) {
      return null
    }

    setCreatedGame(data)
    return data
  }

  async function updateGameStatus(nextStatus, message = '') {
    if (!createdGame) return null

    const { data, error } = await supabase
      .from('games')
      .update({ status: nextStatus })
      .eq('id', createdGame.id)
      .select()
      .single()

    if (error) {
      setStatusMessage(`Could not update game phase: ${error.message}`)
      return null
    }

    setCreatedGame(data)
    if (message) setStatusMessage(message)
    return data
  }

  async function loadCurrentQuestionForGame(gameId, questionNumber, showMessage = false) {
    if (!gameId || !questionNumber) {
      setCurrentQuestion(null)
      setCurrentQuestionOptions([])
      return null
    }

    const { data: question, error: questionError } = await supabase
      .from('questions')
      .select('*')
      .eq('game_id', gameId)
      .eq('question_number', questionNumber)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (questionError) {
      if (showMessage) {
        setQuestionMessage(`Could not load current question: ${questionError.message}`)
      }
      return null
    }

    if (!question) {
      setCurrentQuestion(null)
      setCurrentQuestionOptions([])
      if (showMessage) {
        setQuestionMessage('No saved question for this round yet.')
      }
      return null
    }

    const { data: options, error: optionsError } = await supabase
      .from('answer_options')
      .select('*')
      .eq('question_id', question.id)
      .order('option_number', { ascending: true })

    if (optionsError) {
      if (showMessage) {
        setQuestionMessage(`Question loaded, but options failed: ${optionsError.message}`)
      }
      return null
    }

    setCurrentQuestion(question)
    setCurrentQuestionOptions(options || [])
    return question
  }

  async function createGame() {
    setIsCreating(true)
    setStatusMessage('Creating game...')

    const joinCode = makeJoinCode()

    const { data, error } = await supabase
      .from('games')
      .insert([
        {
          join_code: joinCode,
          status: GAME_PHASES.LOBBY,
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
    setQuestionPrompt('')
    setAnswerOptions(createEmptyOptions())
    setCurrentQuestion(null)
    setCurrentQuestionOptions([])
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
    setAnswerOptions(mapOptionsToFullSet(options || []))
    setTemplateMessage(`Loaded template: ${template.title}`)
    setQuestionMessage('Template loaded. Save when ready.')
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

    const currentRoundNumber = createdGame.current_question_number

    const { data: existingQuestion } = await supabase
      .from('questions')
      .select('*')
      .eq('game_id', createdGame.id)
      .eq('question_number', currentRoundNumber)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    let questionRecord = null

    if (existingQuestion) {
      const { data: updatedQuestion, error: updateQuestionError } = await supabase
        .from('questions')
        .update({
          prompt: cleanPrompt,
          status: 'draft',
          opened_at: null,
          closed_at: null,
        })
        .eq('id', existingQuestion.id)
        .select()
        .single()

      if (updateQuestionError) {
        setQuestionMessage(`Could not update question: ${updateQuestionError.message}`)
        setIsSavingQuestion(false)
        return
      }

      const { error: deleteOptionsError } = await supabase
        .from('answer_options')
        .delete()
        .eq('question_id', existingQuestion.id)

      if (deleteOptionsError) {
        setQuestionMessage(`Question updated, but old options could not be cleared: ${deleteOptionsError.message}`)
        setIsSavingQuestion(false)
        return
      }

      questionRecord = updatedQuestion
    } else {
      const { data: insertedQuestion, error: insertQuestionError } = await supabase
        .from('questions')
        .insert([
          {
            game_id: createdGame.id,
            question_number: currentRoundNumber,
            prompt: cleanPrompt,
            status: 'draft',
          },
        ])
        .select()
        .single()

      if (insertQuestionError) {
        setQuestionMessage(`Could not save question: ${insertQuestionError.message}`)
        setIsSavingQuestion(false)
        return
      }

      questionRecord = insertedQuestion
    }

    const optionRows = answerOptions.map((option) => ({
      question_id: questionRecord.id,
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

    await updateGameStatus(GAME_PHASES.QUESTION_READY, 'Question saved and ready.')
    await loadCurrentQuestionForGame(createdGame.id, createdGame.current_question_number, false)
    setIsSavingQuestion(false)
  }

  async function openQuestion() {
    if (!currentQuestion) {
      setQuestionMessage('Save a question first.')
      return
    }

    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('questions')
      .update({
        status: 'open',
        opened_at: now,
        closed_at: null,
      })
      .eq('id', currentQuestion.id)
      .select()
      .single()

    if (error) {
      setQuestionMessage(`Could not open question: ${error.message}`)
      return
    }

    setCurrentQuestion(data)
    await updateGameStatus(GAME_PHASES.QUESTION_OPEN, 'Question is now open.')
    setQuestionMessage('Question is now open.')
  }

  async function closeQuestion() {
    if (!currentQuestion) {
      setQuestionMessage('Save a question first.')
      return
    }

    const { data, error } = await supabase
      .from('questions')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
      })
      .eq('id', currentQuestion.id)
      .select()
      .single()

    if (error) {
      setQuestionMessage(`Could not close question: ${error.message}`)
      return
    }

    setCurrentQuestion(data)
    await updateGameStatus(GAME_PHASES.QUESTION_CLOSED, 'Question is now closed.')
    setQuestionMessage('Question is now closed.')
  }

  async function revealAnswers() {
    if (!currentQuestion) {
      setQuestionMessage('Save a question first.')
      return
    }

    const { data, error } = await supabase
      .from('questions')
      .update({
        status: 'revealed',
      })
      .eq('id', currentQuestion.id)
      .select()
      .single()

    if (error) {
      setQuestionMessage(`Could not reveal answers: ${error.message}`)
      return
    }

    setCurrentQuestion(data)
    await updateGameStatus(GAME_PHASES.ANSWER_REVEAL, 'Answers are now revealed.')
    setQuestionMessage('Answers are now revealed.')
  }

  async function showJoinScreen() {
    if (!createdGame) return
    await updateGameStatus(GAME_PHASES.LOBBY, 'Showing join screen.')
  }

  async function showHoldingScreen() {
    if (!createdGame) return
    await updateGameStatus(GAME_PHASES.HOLDING, 'Showing holding screen.')
  }

  async function showQuestionOnScreen() {
    if (!createdGame) return

    if (currentQuestion?.status === 'revealed') {
      await updateGameStatus(GAME_PHASES.ANSWER_REVEAL, 'Showing answer reveal on screen.')
    } else if (currentQuestion?.status === 'closed') {
      await updateGameStatus(GAME_PHASES.QUESTION_CLOSED, 'Showing locked question on screen.')
    } else if (currentQuestion?.status === 'open') {
      await updateGameStatus(GAME_PHASES.QUESTION_OPEN, 'Showing live question on screen.')
    } else if (currentQuestion?.status === 'draft') {
      await updateGameStatus(GAME_PHASES.QUESTION_READY, 'Question ready on screen.')
    } else {
      await updateGameStatus(GAME_PHASES.LOBBY, 'Showing join screen.')
    }
  }

  async function showLeaderboardOnScreen() {
    if (!createdGame) return
    await updateGameStatus(GAME_PHASES.LEADERBOARD, 'Showing leaderboard on screen.')
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
        status: GAME_PHASES.LOBBY,
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
    setCurrentQuestion(null)
    setCurrentQuestionOptions([])
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
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (questionError) {
      if (showMessage) setPlayerQuestionMessage(`Could not load question: ${questionError.message}`)
      return
    }

    if (!question) {
      setLoadedPlayerQuestion(null)
      setLoadedPlayerOptions([])
      setSubmittedResult(null)
      if (showMessage) {
        setPlayerQuestionMessage('No live question found for this game yet.')
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

    const { data: existingSubmission } = await supabase
      .from('submissions')
      .select('*')
      .eq('question_id', question.id)
      .eq('player_id', joinedPlayer.id)
      .maybeSingle()

    const isNewQuestion = existingQuestionId !== question.id

    setLoadedPlayerQuestion(question)
    setLoadedPlayerOptions(options || [])

    if (existingSubmission) {
      setSubmittedResult(existingSubmission)
      setSelectedOptionIds(existingSubmission.selected_option_ids || [])
    } else if (isNewQuestion) {
      setSelectedOptionIds([])
      setSubmittedResult(null)
    }

    if (isNewQuestion && question.status === 'open' && !existingSubmission) {
      setQuestionLoadedAt(Date.now())
    }

    if (showMessage) {
      if (question.status === 'revealed') {
        setPlayerQuestionMessage('Answers have been revealed.')
      } else if (existingSubmission) {
        setPlayerQuestionMessage('Answers submitted.')
      } else if (question.status === 'closed') {
        setPlayerQuestionMessage('Question is closed.')
      } else {
        setPlayerQuestionMessage('Question is live. Pick exactly 5 answers.')
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

    const { data: alreadySubmitted } = await supabase
      .from('submissions')
      .select('*')
      .eq('question_id', loadedPlayerQuestion.id)
      .eq('player_id', joinedPlayer.id)
      .maybeSingle()

    if (alreadySubmitted) {
      setSubmittedResult(alreadySubmitted)
      setSelectedOptionIds(alreadySubmitted.selected_option_ids || [])
      setSubmissionMessage('You have already submitted for this question.')
      setIsSubmitting(false)
      return
    }

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
    const moneyScore = scoreFromCorrectCount(correctCount)
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

    const { error: playerUpdateError } = await supabase
      .from('players')
      .update({
        total_score: moneyScore,
        total_time_ms: responseTimeMs,
      })
      .eq('id', joinedPlayer.id)

    if (playerUpdateError) {
      setSubmissionMessage(`Answers saved, but player score update failed: ${playerUpdateError.message}`)
      setIsSubmitting(false)
      return
    }

    setJoinedPlayer({
      ...joinedPlayer,
      total_score: moneyScore,
      total_time_ms: responseTimeMs,
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
    if (!currentQuestion) {
      setSubmissionCount(0)
      if (showMessage) setSubmissionCountMessage('No current question yet.')
      return
    }

    const { count, error } = await supabase
      .from('submissions')
      .select('*', { count: 'exact', head: true })
      .eq('question_id', currentQuestion.id)

    if (error) {
      if (showMessage) setSubmissionCountMessage(`Could not load submission count: ${error.message}`)
      return
    }

    setSubmissionCount(count || 0)
    if (showMessage) {
      setSubmissionCountMessage('Submission count loaded.')
    }
  }

  async function copyScreenUrl() {
    if (!screenUrl) return
    try {
      await navigator.clipboard.writeText(screenUrl)
      setStatusMessage('Screen URL copied.')
    } catch {
      setStatusMessage('Could not copy screen URL. You can still copy it manually.')
    }
  }

  async function refreshHostAndScreenData(showMessage = false) {
    if (!createdGame) return

    const freshGame = await refreshGame(createdGame.id, false)
    const gameToUse = freshGame || createdGame

    await loadCurrentQuestionForGame(gameToUse.id, gameToUse.current_question_number, false)
    await loadPlayersForCreatedGame(false)
    await loadLeaderboard(false)
    await loadSubmissionCount(false)

    if (showMessage) {
      setStatusMessage('Game data refreshed.')
    }
  }

  useEffect(() => {
    async function bootstrap() {
      await loadTemplates()

      const params = new URLSearchParams(window.location.search)
      const mode = params.get('mode')
      const key = params.get('key')
      const code = params.get('code')

      if (mode === 'host' && key === HOST_KEY) {
        setAccessLevel('host')
        setViewMode('host')

        if (code) {
          const game = await loadGameByJoinCode(code)
          if (game) {
            await loadCurrentQuestionForGame(game.id, game.current_question_number, false)
            await loadPlayersForCreatedGame(false)
            await loadLeaderboard(false)
          }
        }
      } else if (mode === 'screen' && key === SCREEN_KEY) {
        setAccessLevel('screen')
        setViewMode('screen')

        if (code) {
          const game = await loadGameByJoinCode(code)
          if (game) {
            await loadCurrentQuestionForGame(game.id, game.current_question_number, false)
            await loadPlayersForCreatedGame(false)
            await loadLeaderboard(false)
            await loadSubmissionCount(false)
            setStatusMessage(`Loaded screen for ${game.join_code}.`)
          } else {
            setStatusMessage('Could not find game from URL join code.')
          }
        } else {
          setStatusMessage('No join code in screen URL.')
        }
      } else {
        setAccessLevel('player')
        setViewMode('player')
        if (code) {
          setJoinCodeInput(code.toUpperCase())
        }
      }
    }

    bootstrap()
  }, [])

  useEffect(() => {
    if (viewMode !== 'host' || !createdGame) return

    const delay = gamePhase === GAME_PHASES.QUESTION_OPEN ? 1500 : 3000

    const interval = setInterval(() => {
      refreshHostAndScreenData(false)
    }, delay)

    return () => clearInterval(interval)
  }, [viewMode, createdGame, gamePhase, currentQuestion?.id])

  useEffect(() => {
    if (viewMode !== 'player' || !joinedPlayer) return

    loadQuestionForPlayer(false)

    const delay = loadedPlayerQuestion?.status === 'open' ? 1500 : 2500

    const interval = setInterval(() => {
      loadQuestionForPlayer(false)
    }, delay)

    return () => clearInterval(interval)
  }, [viewMode, joinedPlayer, loadedPlayerQuestion?.id, loadedPlayerQuestion?.status])

  useEffect(() => {
    if (viewMode !== 'screen' || !createdGame) return

    const delay = gamePhase === GAME_PHASES.QUESTION_OPEN ? 1500 : 2500

    const interval = setInterval(() => {
      refreshHostAndScreenData(false)
    }, delay)

    return () => clearInterval(interval)
  }, [viewMode, createdGame, gamePhase, currentQuestion?.id])

  const screenShellStyle = {
    minHeight: '100vh',
    background:
      'radial-gradient(circle at top left, rgba(255, 62, 168, 0.12), transparent 22%), radial-gradient(circle at top right, rgba(66, 198, 255, 0.16), transparent 24%), linear-gradient(180deg, #061128 0%, #081a3a 42%, #091c42 100%)',
    color: '#fff',
    padding: '28px 34px 32px',
  }

  const screenFrameStyle = {
    maxWidth: '1720px',
    margin: '0 auto',
    minHeight: 'calc(100vh - 60px)',
    display: 'grid',
    gridTemplateRows: 'auto 1fr',
    gap: '22px',
  }

  const screenTopBarStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '24px',
    fontSize: 'clamp(20px, 1.3vw, 28px)',
    fontWeight: 700,
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: '0.02em',
  }

  return (
    <div className={`app-shell ${viewMode === 'screen' ? 'screen-shell' : ''}`}>
      {viewMode !== 'screen' && (
        <>
          <div className="topbar">
            <div>
              <h1 style={{ color: '#000', fontWeight: 800 }}>PRIZE FIGHT</h1>
            </div>
          </div>

          <div className="mode-switch">
            {accessLevel === 'host' && (
              <>
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
                <button
                  onClick={() => setViewMode('screen')}
                  className={viewMode === 'screen' ? 'active' : ''}
                >
                  Screen View
                </button>
              </>
            )}

            {accessLevel === 'screen' && <button className="active">Screen View</button>}
            {accessLevel === 'player' && <button className="active">Player View</button>}
          </div>
        </>
      )}

      {viewMode === 'host' && (
        <div className="host-layout">
          <div className="panel hero-panel">
            <div className="hero-row">
              <div>
                <div className="eyebrow">Host Control</div>
                <h2 className="hero-title">Run the round from one place</h2>
                <p className="hero-text">
                  Clear phase control, shared screen state, and live round monitoring.
                </p>
              </div>

              <div className="phase-card">
                <div className="phase-label">Current phase</div>
                <div className="phase-value">{getPhaseLabel(gamePhase)}</div>
                <div className="phase-description">{getPhaseDescription(gamePhase)}</div>
              </div>
            </div>

            <div className="status-box">
              <p><strong>Status:</strong> {statusMessage || 'Waiting'}</p>
              <p><strong>Next action:</strong> {getNextActionLabel(gamePhase)}</p>
            </div>

            <div className="hero-actions">
              <button onClick={createGame} disabled={isCreating} className="primary-button">
                {isCreating ? 'Creating...' : 'Create New Game'}
              </button>

              <button onClick={() => refreshHostAndScreenData(true)} disabled={!createdGame}>
                Refresh Live Data
              </button>
            </div>
          </div>

          <div className="host-grid">
            <div className="panel">
              <h2>Game Desk</h2>

              {!createdGame && (
                <div className="result-box">
                  <p><strong>No game yet.</strong></p>
                  <p>Create a game to begin hosting.</p>
                </div>
              )}

              {createdGame && (
                <>
                  <div className="stat-grid">
                    <div className="stat-card">
                      <div className="stat-label">Join code</div>
                      <div className="stat-value code-value">{createdGame.join_code}</div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-label">Round</div>
                      <div className="stat-value">{createdGame.current_question_number}</div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-label">Players</div>
                      <div className="stat-value">{playersInGame.length}</div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-label">Submissions</div>
                      <div className="stat-value">{submissionCount}</div>
                    </div>
                  </div>

                  <div className="screen-url-box">
                    <div>
                      <div className="screen-url-label">Screen URL</div>
                      <div className="screen-url-value">{screenUrl}</div>
                    </div>
                    <button onClick={copyScreenUrl}>Copy URL</button>
                  </div>
                </>
              )}
            </div>

            <div className="panel">
              <h2>Screen Controls</h2>

              <div className="control-stack">
                <button
                  onClick={showJoinScreen}
                  disabled={!createdGame}
                  className={gamePhase === GAME_PHASES.LOBBY ? 'primary-button' : ''}
                >
                  Show Join Screen
                </button>

                <button
                  onClick={showHoldingScreen}
                  disabled={!createdGame}
                  className={gamePhase === GAME_PHASES.HOLDING ? 'primary-button' : ''}
                >
                  Show Holding Screen
                </button>

                <button
                  onClick={showQuestionOnScreen}
                  disabled={!canShowQuestionOnScreen}
                  className={
                    gamePhase !== GAME_PHASES.LEADERBOARD &&
                    gamePhase !== GAME_PHASES.LOBBY &&
                    gamePhase !== GAME_PHASES.HOLDING
                      ? 'primary-button'
                      : ''
                  }
                >
                  Show Question Screen
                </button>

                <button
                  onClick={showLeaderboardOnScreen}
                  disabled={!canShowLeaderboard}
                  className={gamePhase === GAME_PHASES.LEADERBOARD ? 'primary-button' : ''}
                >
                  Show Leaderboard
                </button>
              </div>

              <div className="status-box">
                <p><strong>Screen phase:</strong> {getPhaseLabel(gamePhase)}</p>
                <p><strong>Submission count status:</strong> {submissionCountMessage || 'Live updates running'}</p>
              </div>
            </div>

            <div className="panel">
              <h2>Template Question</h2>

              <div className="field-block">
                <label className="field-label">Choose template</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="field-input"
                >
                  <option value="">Select a question template</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="control-row">
                <button onClick={loadTemplates}>Reload Templates</button>
                <button onClick={loadSelectedTemplate}>Load Selected Template</button>
              </div>

              <div className="status-box">
                <p><strong>Template status:</strong> {templateMessage || 'Waiting'}</p>
              </div>
            </div>

            <div className="panel">
              <h2>Current Round</h2>

              <div className="status-box">
                <p><strong>Round number:</strong> {createdGame?.current_question_number || 1}</p>
                <p><strong>Question status:</strong> {currentQuestion?.status || 'Not saved yet'}</p>
                <p><strong>Question message:</strong> {questionMessage || 'Waiting'}</p>
              </div>

              <div className="field-block">
                <label className="field-label">Question prompt</label>
                <input
                  type="text"
                  value={questionPrompt}
                  onChange={(e) => setQuestionPrompt(e.target.value)}
                  placeholder="Enter the question"
                  className="field-input"
                />
              </div>

              <div className="option-header">
                <span>Answer options</span>
                <span>{answerOptions.filter((option) => option.is_correct).length} / 5 marked correct</span>
              </div>

              <div className="option-list">
                {answerOptions.map((option, index) => (
                  <div key={option.option_number} className="option-row">
                    <input
                      type="text"
                      value={option.text}
                      onChange={(e) => updateOptionText(index, e.target.value)}
                      placeholder={`Option ${option.option_number}`}
                      className="field-input"
                    />
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={option.is_correct}
                        onChange={(e) => updateOptionCorrect(index, e.target.checked)}
                      />
                      Correct
                    </label>
                  </div>
                ))}
              </div>

              <div className="control-stack">
                <button
                  onClick={saveQuestion}
                  disabled={isSavingQuestion || !createdGame}
                  className={!currentQuestion ? 'primary-button' : ''}
                >
                  {isSavingQuestion ? 'Saving...' : 'Save Question'}
                </button>

                <button
                  onClick={openQuestion}
                  disabled={!canOpenQuestion}
                  className={canOpenQuestion ? 'primary-button' : ''}
                >
                  Open Question
                </button>

                <button
                  onClick={closeQuestion}
                  disabled={!canCloseQuestion}
                  className={canCloseQuestion ? 'primary-button' : ''}
                >
                  Close Question
                </button>

                <button
                  onClick={revealAnswers}
                  disabled={!canRevealAnswers}
                  className={canRevealAnswers ? 'primary-button' : ''}
                >
                  Reveal Answers
                </button>

                <button onClick={goToNextQuestion} disabled={!canGoNext}>
                  Next Question
                </button>
              </div>
            </div>

            <div className="panel">
              <h2>Players</h2>

              <div className="control-row">
                <button onClick={() => loadPlayersForCreatedGame(true)} disabled={!createdGame}>
                  Refresh Player List
                </button>
                <button onClick={() => loadLeaderboard(true)} disabled={!createdGame}>
                  Refresh Leaderboard
                </button>
              </div>

              <div className="status-box">
                <p><strong>Player list:</strong> {playerListMessage || 'Live updates running'}</p>
                <p><strong>Leaderboard:</strong> {leaderboardMessage || 'Live updates running'}</p>
              </div>

              {playersInGame.length > 0 ? (
                <div className="player-chip-list">
                  {playersInGame.map((player) => (
                    <div key={player.id} className="player-chip">
                      <span>{player.name}</span>
                      <strong>{formatMoney(player.total_score)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="result-box">
                  <p>No players have joined yet.</p>
                </div>
              )}
            </div>

            <div className="panel">
              <h2>Leaderboard Preview</h2>

              {hostLeaderboardPlayers.length > 0 ? (
                <div className="leaderboard-list">
                  {hostLeaderboardPlayers.map((player, index) => (
                    <div key={player.id} className={`leaderboard-row ${index === 0 ? 'leaderboard-row-top' : ''}`}>
                      <div className="leaderboard-rank">#{index + 1}</div>
                      <div className="leaderboard-name">{player.name}</div>
                      <div className="leaderboard-score">{formatMoney(player.total_score)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="result-box">
                  <p>No leaderboard data yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {viewMode === 'player' && (
        <>
          {!joinedPlayer && (
            <div className="player-layout">
              <div className="panel player-panel">
                <h2>Join the Game</h2>

                <div className="field-block">
                  <label className="field-label">Your name</label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Enter your name"
                    className="field-input"
                  />
                </div>

                <div className="field-block">
                  <label className="field-label">Join code</label>
                  <input
                    type="text"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    placeholder="ABCD"
                    className="field-input"
                  />
                </div>

                <button onClick={joinGame} disabled={isJoining} className="primary-button full-width">
                  {isJoining ? 'Joining...' : 'Join Game'}
                </button>

                <div className="status-box">
                  <p><strong>Join status:</strong> {joinMessage || 'Waiting'}</p>
                </div>
              </div>
            </div>
          )}

          {joinedPlayer && playerShowLiveQuestion && (
            <div
              style={{
                minHeight: 'calc(100vh - 120px)',
                maxWidth: '760px',
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                className="panel player-panel"
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  paddingTop: '18px',
                  paddingBottom: '18px',
                }}
              >
                <div className="question-card-top" style={{ marginBottom: '10px' }}>
                  <span className="question-round">Question {loadedPlayerQuestion.question_number}</span>
                  <span className={`question-status question-status-${loadedPlayerQuestion.status}`}>
                    live
                  </span>
                </div>

                <h2
                  className="player-question-title"
                  style={{
                    fontSize: '24px',
                    marginBottom: '10px',
                    color: '#000',
                    textAlign: 'center',
                  }}
                >
                  {loadedPlayerQuestion.prompt}
                </h2>

                <div
                  className="selection-counter"
                  style={{
                    fontSize: '15px',
                    marginBottom: '12px',
                    textAlign: 'center',
                  }}
                >
                  Select exactly 5 answers — <strong>{selectedOptionIds.length} / 5 selected</strong>
                </div>

                <button
                  onClick={submitAnswers}
                  disabled={
                    isSubmitting ||
                    loadedPlayerQuestion.status !== 'open' ||
                    selectedOptionIds.length !== 5
                  }
                  className="primary-button full-width"
                  style={{
                    paddingTop: '14px',
                    paddingBottom: '14px',
                    fontSize: '18px',
                    fontWeight: 700,
                    marginBottom: '16px',
                  }}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Answers'}
                </button>

                <div
                  className="answers-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                  }}
                >
                  {loadedPlayerOptions.map((option) => {
                    const isSelected = selectedOptionIds.includes(option.id)

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => togglePlayerOption(option.id)}
                        disabled={
                          isSubmitting ||
                          loadedPlayerQuestion.status !== 'open' ||
                          (!isSelected && selectedOptionIds.length >= 5)
                        }
                        className={[
                          'answer-tile',
                          isSelected ? 'answer-tile-selected' : '',
                        ].join(' ').trim()}
                        style={{
                          padding: '10px 12px',
                          minHeight: '52px',
                          fontSize: '14px',
                          ...(isSelected
                            ? {
                                borderColor: 'rgba(255, 62, 168, 0.95)',
                                background:
                                  'linear-gradient(135deg, rgba(255, 62, 168, 0.18), rgba(66, 198, 255, 0.18)), #f8fafc',
                                boxShadow:
                                  '0 0 0 4px rgba(255, 62, 168, 0.2), 0 0 16px rgba(255, 62, 168, 0.28), 0 0 18px rgba(66, 198, 255, 0.22)',
                                transform: 'scale(1.02)',
                              }
                            : {}),
                        }}
                      >
                        <span className="answer-number">{option.option_number}</span>
                        <span className="answer-text">{option.text}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {joinedPlayer && playerWaitingAfterSubmit && (
            <div
              style={{
                minHeight: 'calc(100vh - 120px)',
                maxWidth: '760px',
                margin: '0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                className="panel player-panel"
                style={{
                  width: '100%',
                  textAlign: 'center',
                  paddingTop: '48px',
                  paddingBottom: '48px',
                }}
              >
                <div
                  style={{
                    fontSize: '52px',
                    lineHeight: 1,
                    marginBottom: '18px',
                    color: '#16a34a',
                  }}
                >
                  ✓
                </div>

                <h2 style={{ fontSize: '34px', marginBottom: '12px', color: '#000' }}>
                  Answers Submitted
                </h2>

                <p style={{ fontSize: '18px', color: '#526274', marginBottom: 0 }}>
                  Waiting for the host to reveal the answers...
                </p>
              </div>
            </div>
          )}

          {joinedPlayer && !playerShowLiveQuestion && !playerWaitingAfterSubmit && (
            <>
              {loadedPlayerQuestion && playerQuestionIsRevealed ? (
                <div
                  style={{
                    minHeight: 'calc(100vh - 120px)',
                    maxWidth: '760px',
                    margin: '0 auto',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div
                    className="panel player-panel"
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      paddingTop: '18px',
                      paddingBottom: '18px',
                    }}
                  >
                    <div className="question-card-top" style={{ marginBottom: '10px' }}>
                      <span className="question-round">Question {loadedPlayerQuestion.question_number}</span>
                      <span className={`question-status question-status-${loadedPlayerQuestion.status}`}>
                        {loadedPlayerQuestion.status}
                      </span>
                    </div>

                    <h2
                      className="player-question-title"
                      style={{
                        fontSize: '24px',
                        marginBottom: '12px',
                        color: '#000',
                        textAlign: 'center',
                      }}
                    >
                      {loadedPlayerQuestion.prompt}
                    </h2>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr',
                        gap: '10px',
                      }}
                    >
                      {playerRevealOptions.map((option) => {
                        const isCorrect = option.is_correct

                        return (
                          <div
                            key={option.id}
                            className="answer-tile"
                            style={{
                              padding: '14px 16px',
                              minHeight: 'unset',
                              fontSize: '16px',
                              background: isCorrect ? '#dcfce7' : '#fee2e2',
                              border: `2px solid ${isCorrect ? '#16a34a' : '#dc2626'}`,
                              boxShadow: 'none',
                            }}
                          >
                            <span className="answer-text">{option.text}</span>
                            <span className="answer-badge" style={{ color: isCorrect ? '#16a34a' : '#dc2626' }}>
                              {isCorrect ? '✓' : '✕'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="player-layout">
                  <div className="panel player-panel">
                    <h2 style={{ color: '#000' }}>Player</h2>

                    <div className="result-box">
                      <p><strong>Name:</strong> {joinedPlayer.name}</p>
                      <p><strong>Score:</strong> {formatMoney(joinedPlayer.total_score)}</p>
                    </div>

                    <button onClick={() => loadQuestionForPlayer(true)} className="full-width">
                      Refresh Question
                    </button>

                    <div className="status-box">
                      <p><strong>Status:</strong> {playerQuestionMessage || 'Waiting'}</p>
                    </div>

                    {!loadedPlayerQuestion && (
                      <div className="result-box">
                        <p>Once the host opens a question, it will appear here.</p>
                      </div>
                    )}

                    {loadedPlayerQuestion && loadedPlayerQuestion.status === 'closed' && !submittedResult && (
                      <div className="result-box">
                        <p><strong>Question closed.</strong></p>
                        <p>The host has locked answers. Wait for the reveal.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {viewMode === 'screen' && (
        <div style={screenShellStyle}>
          {!createdGame && (
            <div style={screenFrameStyle}>
              <div style={screenTopBarStyle}>
                <span>PRIZE FIGHT</span>
                <span>Screen View</span>
              </div>

              <div
                style={{
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    minHeight: '72vh',
                    borderRadius: '36px',
                    background:
                      'radial-gradient(circle at top left, rgba(255, 62, 168, 0.14), transparent 28%), radial-gradient(circle at top right, rgba(66, 198, 255, 0.16), transparent 30%), rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: '60px',
                    boxShadow: '0 24px 70px rgba(0,0,0,0.3)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 'clamp(22px, 1.6vw, 30px)',
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      opacity: 0.78,
                      marginBottom: '18px',
                    }}
                  >
                    Live Quiz
                  </div>

                  <div
                    style={{
                      fontSize: 'clamp(54px, 5vw, 92px)',
                      fontWeight: 800,
                      lineHeight: 1.05,
                      marginBottom: '18px',
                    }}
                  >
                    No game loaded
                  </div>

                  <div
                    style={{
                      fontSize: 'clamp(24px, 2vw, 38px)',
                      maxWidth: '1000px',
                      lineHeight: 1.35,
                      opacity: 0.92,
                    }}
                  >
                    Use a valid screen URL with a join code to attach this display to a game.
                  </div>
                </div>
              </div>
            </div>
          )}

          {createdGame && gamePhase === GAME_PHASES.HOLDING && (
            <div style={screenFrameStyle}>
              <div style={screenTopBarStyle}>
                <span>PRIZE FIGHT</span>
                <span>Holding Screen</span>
              </div>

              <div
                style={{
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    minHeight: '72vh',
                    borderRadius: '40px',
                    background:
                      'radial-gradient(circle at top left, rgba(255, 62, 168, 0.12), transparent 28%), radial-gradient(circle at top right, rgba(66, 198, 255, 0.14), transparent 30%), rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: '0 26px 70px rgba(0,0,0,0.32)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '50px',
                  }}
                >
                  <img
                    src={HOLDING_LOGO_URL}
                    alt="Prize Fight logo"
                    style={{
                      maxWidth: 'min(88vw, 1100px)',
                      maxHeight: '60vh',
                      width: 'auto',
                      height: 'auto',
                      objectFit: 'contain',
                      display: 'block',
                    }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {createdGame && gamePhase === GAME_PHASES.LOBBY && (
            <div style={screenFrameStyle}>
              <div style={screenTopBarStyle}>
                <span>Round {createdGame.current_question_number}</span>
                <span>{playersInGame.length} players joined</span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 0.8fr',
                  gap: '28px',
                  alignItems: 'stretch',
                }}
              >
                <div
                  style={{
                    borderRadius: '40px',
                    background:
                      'radial-gradient(circle at top left, rgba(255, 62, 168, 0.16), transparent 28%), radial-gradient(circle at top right, rgba(66, 198, 255, 0.18), transparent 30%), rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    boxShadow: '0 26px 70px rgba(0,0,0,0.32)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    padding: '60px 56px',
                    minHeight: '72vh',
                  }}
                >
                  <div
                    style={{
                      fontSize: 'clamp(22px, 1.4vw, 30px)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.2em',
                      opacity: 0.78,
                      marginBottom: '22px',
                    }}
                  >
                    Join now
                  </div>

                  <div
                    style={{
                      fontSize: 'clamp(120px, 12vw, 220px)',
                      fontWeight: 900,
                      letterSpacing: '0.12em',
                      lineHeight: 0.95,
                      marginBottom: '24px',
                      textShadow:
                        '0 0 14px rgba(255,255,255,0.7), 0 0 28px rgba(255,62,168,0.45), 0 0 32px rgba(66,198,255,0.35)',
                    }}
                  >
                    {createdGame.join_code}
                  </div>

                  <div
                    style={{
                      fontSize: 'clamp(26px, 1.9vw, 38px)',
                      lineHeight: 1.35,
                      opacity: 0.95,
                      maxWidth: '760px',
                    }}
                  >
                    Scan the QR code or open the player page on your phone and enter the room code.
                  </div>
                </div>

                <div
                  style={{
                    borderRadius: '40px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    boxShadow: '0 26px 70px rgba(0,0,0,0.32)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '34px',
                    minHeight: '72vh',
                  }}
                >
                  <div
                    style={{
                      background: '#fff',
                      borderRadius: '28px',
                      padding: '22px',
                      boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                    }}
                  >
                    {qrCodeUrl ? (
                      <img
                        src={qrCodeUrl}
                        alt="QR code to join the game"
                        style={{
                          width: 'min(30vw, 360px)',
                          maxWidth: '360px',
                          minWidth: '220px',
                          height: 'auto',
                          display: 'block',
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          )}

          {createdGame && gamePhase === GAME_PHASES.QUESTION_READY && (
            <div style={screenFrameStyle}>
              <div style={screenTopBarStyle}>
                <span>Join code {createdGame.join_code}</span>
                <span>{playersInGame.length} players joined</span>
              </div>

              <div
                style={{
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    minHeight: '72vh',
                    borderRadius: '40px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: '60px',
                    boxShadow: '0 26px 70px rgba(0,0,0,0.32)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 'clamp(22px, 1.5vw, 30px)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.2em',
                      opacity: 0.78,
                      marginBottom: '22px',
                    }}
                  >
                    Get ready
                  </div>

                  <div
                    style={{
                      fontSize: 'clamp(58px, 5vw, 96px)',
                      fontWeight: 800,
                      lineHeight: 1.05,
                      marginBottom: '18px',
                    }}
                  >
                    Next question coming up
                  </div>

                  <div
                    style={{
                      fontSize: 'clamp(28px, 2.1vw, 40px)',
                      opacity: 0.92,
                    }}
                  >
                    The host is preparing the round.
                  </div>
                </div>
              </div>
            </div>
          )}

          {createdGame && gamePhase === GAME_PHASES.QUESTION_OPEN && (
            <div style={screenFrameStyle}>
              <div style={screenTopBarStyle}>
                <span>Join code {createdGame.join_code}</span>
                <span>{submissionCount} submissions</span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateRows: 'auto 1fr',
                  gap: '22px',
                }}
              >
                <div
                  style={{
                    textAlign: 'center',
                    padding: '4px 40px 0',
                  }}
                >
                  <div
                    style={{
                      fontSize: 'clamp(18px, 1.1vw, 24px)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.18em',
                      opacity: 0.78,
                      marginBottom: '12px',
                    }}
                  >
                    Pick exactly 5 answers
                  </div>

                  <div
                    style={{
                      fontSize: 'clamp(46px, 4.2vw, 84px)',
                      fontWeight: 800,
                      lineHeight: 1.08,
                      maxWidth: '1500px',
                      margin: '0 auto',
                    }}
                  >
                    {currentQuestion?.prompt || 'Question loading...'}
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '18px',
                    alignContent: 'center',
                  }}
                >
                  {currentQuestionOptions.map((option) => (
                    <div
                      key={option.id}
                      style={{
                        minHeight: '126px',
                        borderRadius: '26px',
                        background:
                          'linear-gradient(135deg, rgba(255,62,168,0.08), rgba(66,198,255,0.08)), rgba(255,255,255,0.07)',
                        border: '1px solid rgba(255,255,255,0.14)',
                        display: 'grid',
                        gridTemplateColumns: '76px 1fr',
                        alignItems: 'center',
                        gap: '16px',
                        padding: '22px 24px',
                        boxShadow: '0 18px 34px rgba(0,0,0,0.18)',
                      }}
                    >
                      <div
                        style={{
                          width: '54px',
                          height: '54px',
                          borderRadius: '999px',
                          background: 'linear-gradient(135deg, rgba(255,62,168,0.88), rgba(66,198,255,0.88))',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 900,
                          fontSize: '24px',
                          color: '#fff',
                        }}
                      >
                        {option.option_number}
                      </div>

                      <div
                        style={{
                          fontSize: 'clamp(24px, 1.8vw, 36px)',
                          fontWeight: 700,
                          lineHeight: 1.18,
                          color: '#fff',
                        }}
                      >
                        {option.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {createdGame && gamePhase === GAME_PHASES.QUESTION_CLOSED && (
            <div style={screenFrameStyle}>
              <div style={screenTopBarStyle}>
                <span>Join code {createdGame.join_code}</span>
                <span>{submissionCount} submissions received</span>
              </div>

              <div
                style={{
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    minHeight: '72vh',
                    borderRadius: '40px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    padding: '60px',
                    boxShadow: '0 26px 70px rgba(0,0,0,0.32)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 'clamp(22px, 1.5vw, 30px)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.2em',
                      opacity: 0.78,
                      marginBottom: '22px',
                    }}
                  >
                    Answers locked
                  </div>

                  <div
                    style={{
                      fontSize: 'clamp(54px, 4.8vw, 92px)',
                      fontWeight: 800,
                      lineHeight: 1.08,
                      maxWidth: '1450px',
                      marginBottom: '18px',
                    }}
                  >
                    {currentQuestion?.prompt || 'Question closed'}
                  </div>

                  <div
                    style={{
                      fontSize: 'clamp(28px, 2.1vw, 40px)',
                      opacity: 0.92,
                    }}
                  >
                    Stand by for the reveal.
                  </div>
                </div>
              </div>
            </div>
          )}

          {createdGame && gamePhase === GAME_PHASES.ANSWER_REVEAL && (
            <div style={screenFrameStyle}>
              <div style={screenTopBarStyle}>
                <span>Join code {createdGame.join_code}</span>
                <span>Answer Reveal</span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateRows: 'auto 1fr',
                  gap: '22px',
                }}
              >
                <div
                  style={{
                    textAlign: 'center',
                    padding: '4px 40px 0',
                  }}
                >
                  <div
                    style={{
                      fontSize: 'clamp(18px, 1.1vw, 24px)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.18em',
                      opacity: 0.78,
                      marginBottom: '12px',
                    }}
                  >
                    Correct answers
                  </div>

                  <div
                    style={{
                      fontSize: 'clamp(46px, 4.2vw, 84px)',
                      fontWeight: 800,
                      lineHeight: 1.08,
                      maxWidth: '1500px',
                      margin: '0 auto',
                    }}
                  >
                    {currentQuestion?.prompt || 'Reveal'}
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '18px',
                    alignContent: 'center',
                  }}
                >
                  {currentQuestionOptions.map((option) => {
                    const isCorrect = option.is_correct

                    return (
                      <div
                        key={option.id}
                        style={{
                          minHeight: '126px',
                          borderRadius: '26px',
                          background: isCorrect
                            ? 'linear-gradient(135deg, rgba(40,255,170,0.22), rgba(66,198,255,0.14)), rgba(255,255,255,0.1)'
                            : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${isCorrect ? 'rgba(74,222,128,0.8)' : 'rgba(255,255,255,0.1)'}`,
                          opacity: isCorrect ? 1 : 0.42,
                          display: 'grid',
                          gridTemplateColumns: '76px 1fr auto',
                          alignItems: 'center',
                          gap: '16px',
                          padding: '22px 24px',
                          boxShadow: '0 18px 34px rgba(0,0,0,0.18)',
                        }}
                      >
                        <div
                          style={{
                            width: '54px',
                            height: '54px',
                            borderRadius: '999px',
                            background: 'linear-gradient(135deg, rgba(255,62,168,0.88), rgba(66,198,255,0.88))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 900,
                            fontSize: '24px',
                            color: '#fff',
                          }}
                        >
                          {option.option_number}
                        </div>

                        <div
                          style={{
                            fontSize: 'clamp(24px, 1.8vw, 36px)',
                            fontWeight: 700,
                            lineHeight: 1.18,
                            color: '#fff',
                          }}
                        >
                          {option.text}
                        </div>

                        <div
                          style={{
                            fontSize: '42px',
                            fontWeight: 900,
                            color: '#fff',
                            opacity: isCorrect ? 1 : 0,
                          }}
                        >
                          ✓
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {createdGame && gamePhase === GAME_PHASES.LEADERBOARD && (
            <div style={screenFrameStyle}>
              <div style={screenTopBarStyle}>
                <span>Join code {createdGame.join_code}</span>
                <span>Results</span>
              </div>

              <div
                style={{
                  display: 'grid',
                  alignContent: 'center',
                  gap: '18px',
                  minHeight: '100%',
                }}
              >
                {screenLeaderboardPlayers.length === 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      fontSize: 'clamp(40px, 3.2vw, 60px)',
                      fontWeight: 700,
                      paddingTop: '120px',
                    }}
                  >
                    No leaderboard data yet.
                  </div>
                ) : (
                  screenLeaderboardPlayers.map((player) => (
                    <div
                      key={player.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) auto',
                        alignItems: 'center',
                        gap: '28px',
                        padding: '28px 30px',
                        minHeight: '120px',
                        borderRadius: '28px',
                        background:
                          'linear-gradient(135deg, rgba(255,62,168,0.07), rgba(66,198,255,0.08)), rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        boxShadow: '0 16px 30px rgba(0,0,0,0.18)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 'clamp(42px, 3.2vw, 66px)',
                          fontWeight: 800,
                          lineHeight: 1.04,
                          color: '#fff',
                        }}
                      >
                        {player.name}
                      </div>

                      <div
                        style={{
                          fontSize: 'clamp(42px, 3.2vw, 66px)',
                          fontWeight: 900,
                          lineHeight: 1.04,
                          color: '#fff',
                        }}
                      >
                        {formatMoney(player.total_score)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App