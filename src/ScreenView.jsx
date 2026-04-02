function ScreenView({
  createdGame,
  screenMode,
  playersInGame,
  submissionCount,
  screenMessage,
  screenQuestion,
  screenOptions,
  leaderboard,
  sortLeaderboard,
  formatMoney,
}) {
  return (
    <div className="panel">
      <h2>Screen View</h2>

      {!createdGame && (
        <div className="result-box">
          <p><strong>No active game yet.</strong></p>
          <p>Create a game in Host View to begin.</p>
        </div>
      )}

      {createdGame && screenMode === 'leaderboard' && (
        <>
          <div className="status-box">
            <p><strong>Join code:</strong> {createdGame.join_code}</p>
            <p><strong>Round:</strong> {createdGame.current_question_number}</p>
            <p><strong>Leaderboard</strong></p>
          </div>

          <div className="result-box">
            {leaderboard.length === 0 ? (
              <p>No leaderboard data yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Name</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {sortLeaderboard(leaderboard).map((player, index) => (
                    <tr key={player.id}>
                      <td>{index + 1}</td>
                      <td>{player.name}</td>
                      <td>{formatMoney(player.total_score)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {createdGame && screenMode === 'question' && (
        <>
          <div className="status-box">
            <p><strong>Join code:</strong> {createdGame.join_code}</p>
            <p><strong>Round:</strong> {createdGame.current_question_number}</p>
            <p><strong>Players joined:</strong> {playersInGame.length}</p>
            <p><strong>Submissions:</strong> {submissionCount}</p>
            <p><strong>Screen status:</strong> {screenMessage || 'Waiting for host'}</p>
          </div>

          {!screenQuestion && (
            <div className="result-box">
              <p><strong>Players join now</strong></p>
              <p>Use the join code <strong>{createdGame.join_code}</strong> on your phone.</p>
            </div>
          )}

          {screenQuestion && (
            <div className="result-box">
              <p><strong>Question:</strong> {screenQuestion.prompt}</p>
              <p><strong>Status:</strong> {screenQuestion.status}</p>

              <div style={{ marginTop: '20px' }}>
                {screenOptions.map((option) => {
                  const showReveal = screenQuestion.status === 'revealed'
                  return (
                    <div
                      key={option.id}
                      style={{
                        padding: '12px',
                        marginBottom: '10px',
                        borderRadius: '10px',
                        border: showReveal && option.is_correct
                          ? '2px solid #16a34a'
                          : '1px solid #cbd5e1',
                        background: showReveal && option.is_correct
                          ? '#dcfce7'
                          : '#ffffff',
                        fontSize: '18px',
                      }}
                    >
                      {option.option_number}. {option.text}
                      {showReveal && option.is_correct ? ' ✅' : ''}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default ScreenView