/**
 * PuzzleTracker - Frontend Application
 */

// State
let state = {
    puzzles: [],
    sessions: [],
    currentPuzzle: null,
    currentSession: null,
    sessionTimer: null,
    pieceTimer: null,
    sessionStartTime: null,
    lastEventTime: null,
    piecePickedTime: null,  // Time when current piece was picked
    isPiecePicked: false,   // Whether a piece is currently picked
    isPaused: false,        // Whether session is paused
    pausedAt: null,         // When pause started
    totalPausedTime: 0,     // Total time spent paused (ms)
    piecePausedTime: 0,     // Time paused while holding current piece (ms)
    pieceTimes: [],         // Array of placement times for graph
    sessionScope: 'project', // 'project' (all sessions for puzzle) or 'current'
    lastPieceTime: null      // Time it took to place the last piece (seconds)
};

// DOM Elements
const views = {
    puzzleList: document.getElementById('puzzle-list-view'),
    newPuzzle: document.getElementById('new-puzzle-view'),
    puzzleDetail: document.getElementById('puzzle-detail-view'),
    session: document.getElementById('session-view'),
    stats: document.getElementById('stats-view')
};

const elements = {
    backBtn: document.getElementById('back-btn'),
    puzzlesContainer: document.getElementById('puzzles-container'),
    addPuzzleBtn: document.getElementById('add-puzzle-btn'),
    newPuzzleForm: document.getElementById('new-puzzle-form'),
    puzzleName: document.getElementById('puzzle-name'),
    puzzlePieces: document.getElementById('puzzle-pieces'),
    puzzleDetailName: document.getElementById('puzzle-detail-name'),
    puzzleDetailPieces: document.getElementById('puzzle-detail-pieces'),
    statsSummary: document.getElementById('stats-summary'),
    startSessionBtn: document.getElementById('start-session-btn'),
    viewStatsBtn: document.getElementById('view-stats-btn'),
    sessionPuzzleName: document.getElementById('session-puzzle-name'),
    sessionTimer: document.getElementById('session-timer'),
    pieceTime: document.getElementById('piece-time'),
    lastPieceTime: document.getElementById('last-piece-time'),
    sessionPlaced: document.getElementById('session-placed'),
    sessionFailed: document.getElementById('session-failed'),
    sessionPlacedLabel: document.getElementById('session-placed-label'),
    sessionFailedLabel: document.getElementById('session-failed-label'),
    piecePickedBtn: document.getElementById('piece-picked-btn'),
    piecePlacedBtn: document.getElementById('piece-placed-btn'),
    pieceFailedBtn: document.getElementById('piece-failed-btn'),
    endSessionBtn: document.getElementById('end-session-btn'),
    statsContent: document.getElementById('stats-content'),
    pauseBtn: document.getElementById('pause-btn'),
    pauseIcon: document.getElementById('pause-icon'),
    playIcon: document.getElementById('play-icon'),
    progressionCanvas: document.getElementById('progression-canvas'),
    graphEmpty: document.getElementById('graph-empty'),
    histogramCanvas: document.getElementById('histogram-canvas'),
    histogramEmpty: document.getElementById('histogram-empty'),
    sessionView: document.getElementById('session-view'),
    undoBtn: document.getElementById('undo-btn'),
    sessionScopeButtons: document.querySelectorAll('[data-session-scope]')
};

// View Management
let viewHistory = [];

function showView(viewName, addToHistory = true) {
    // Hide all views
    Object.values(views).forEach(view => view.classList.remove('active'));

    // Show requested view
    views[viewName].classList.add('active');

    // Manage back button visibility
    if (viewName === 'puzzleList') {
        elements.backBtn.classList.add('hidden');
        viewHistory = [];
    } else {
        elements.backBtn.classList.remove('hidden');
        if (addToHistory && viewHistory[viewHistory.length - 1] !== viewName) {
            viewHistory.push(viewName);
        }
    }
}

function goBack() {
    viewHistory.pop(); // Remove current view
    const previousView = viewHistory.pop() || 'puzzleList';
    showView(previousView);
}

const sessionScopes = {
    project: 'project',
    current: 'current'
};

function updateSessionScopeUI() {
    elements.sessionScopeButtons.forEach(btn => {
        const isActive = btn.dataset.sessionScope === state.sessionScope;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

function updateScopeEmptyMessage() {
    elements.graphEmpty.textContent = state.sessionScope === sessionScopes.current
        ? 'Place pieces to see this sitting\'s progression'
        : 'Place pieces to see this puzzle\'s progression';
}

function getProjectSessions() {
    if (!state.currentPuzzle) return [];
    return state.sessions.filter(session => session.puzzleId === state.currentPuzzle.id);
}

function countSessionEvents(sessions) {
    let placed = 0;
    let failed = 0;

    sessions.forEach(session => {
        (session.events || []).forEach(event => {
            if (event.type === 'piece_placed') {
                placed += 1;
            } else if (event.type === 'piece_failed') {
                failed += 1;
            }
        });
    });

    return { placed, failed };
}

function updateSessionStats() {
    const counts = state.sessionScope === sessionScopes.current
        ? countSessionEvents(state.currentSession ? [state.currentSession] : [])
        : countSessionEvents(getProjectSessions());

    elements.sessionPlaced.textContent = counts.placed.toString();
    elements.sessionFailed.textContent = counts.failed.toString();

    const labelSuffix = state.sessionScope === sessionScopes.current ? 'This Sitting' : 'Project';
    elements.sessionPlacedLabel.textContent = `Placed (${labelSuffix})`;
    elements.sessionFailedLabel.textContent = `Failed (${labelSuffix})`;
}

function setSessionScope(scope, options = {}) {
    const nextScope = scope === sessionScopes.current ? sessionScopes.current : sessionScopes.project;
    state.sessionScope = nextScope;
    updateSessionScopeUI();
    updateSessionStats();
    updateScopeEmptyMessage();
    if (!options.skipRender) {
        updateProgressionGraph();
        updateHistogram();
    }
}

function getProjectPieceTimes() {
    const sessions = getProjectSessions();
    const events = [];

    sessions.forEach(session => {
        (session.events || []).forEach(event => {
            if (event.type === 'piece_placed') {
                events.push({
                    elapsed: event.elapsed || 0,
                    timestamp: event.timestamp || null,
                    sessionStartedAt: session.startedAt || null
                });
            }
        });
    });

    events.sort((a, b) => {
        const aTime = a.timestamp || a.sessionStartedAt;
        const bTime = b.timestamp || b.sessionStartedAt;
        if (!aTime || !bTime) {
            return 0;
        }
        return new Date(aTime) - new Date(bTime);
    });

    return events.map(event => event.elapsed);
}

function getScopePieceTimes() {
    if (state.sessionScope === sessionScopes.current) {
        return state.pieceTimes.slice();
    }
    return getProjectPieceTimes();
}

// API Functions
async function fetchData() {
    try {
        const response = await fetch('/api/data');
        const data = await response.json();
        state.puzzles = data.puzzles || [];
        state.sessions = data.sessions || [];
        renderPuzzleList();
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

async function createPuzzle(name, totalPieces) {
    try {
        const response = await fetch('/api/puzzles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, totalPieces })
        });
        const puzzle = await response.json();
        state.puzzles.push(puzzle);
        return puzzle;
    } catch (error) {
        console.error('Error creating puzzle:', error);
        return null;
    }
}

async function deletePuzzle(puzzleId) {
    try {
        await fetch(`/api/puzzles/${puzzleId}`, { method: 'DELETE' });
        state.puzzles = state.puzzles.filter(p => p.id !== puzzleId);
        state.sessions = state.sessions.filter(s => s.puzzleId !== puzzleId);
    } catch (error) {
        console.error('Error deleting puzzle:', error);
    }
}

async function startSession(puzzleId) {
    try {
        const response = await fetch('/api/sessions/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ puzzleId })
        });
        const session = await response.json();
        state.sessions.push(session);
        return session;
    } catch (error) {
        console.error('Error starting session:', error);
        return null;
    }
}

async function endSession(sessionId) {
    try {
        const response = await fetch(`/api/sessions/${sessionId}/end`, {
            method: 'POST'
        });
        const session = await response.json();
        const index = state.sessions.findIndex(s => s.id === sessionId);
        if (index !== -1) {
            state.sessions[index] = session;
        }
        return session;
    } catch (error) {
        console.error('Error ending session:', error);
        return null;
    }
}

async function recordEvent(sessionId, type, elapsed) {
    try {
        const response = await fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, type, elapsed })
        });
        let recordedEvent = {
            type,
            elapsed,
            timestamp: new Date().toISOString()
        };

        if (response.ok) {
            recordedEvent = await response.json();
        }

        const session = state.sessions.find(s => s.id === sessionId);
        if (session) {
            session.events = session.events || [];
            session.events.push(recordedEvent);
        }

        if (state.currentSession && state.currentSession.id === sessionId && state.currentSession !== session) {
            state.currentSession.events = state.currentSession.events || [];
            state.currentSession.events.push(recordedEvent);
        }

        return recordedEvent;
    } catch (error) {
        console.error('Error recording event:', error);
        const fallbackEvent = {
            type,
            elapsed,
            timestamp: new Date().toISOString()
        };
        const session = state.sessions.find(s => s.id === sessionId);
        if (session) {
            session.events = session.events || [];
            session.events.push(fallbackEvent);
        }
        if (state.currentSession && state.currentSession.id === sessionId && state.currentSession !== session) {
            state.currentSession.events = state.currentSession.events || [];
            state.currentSession.events.push(fallbackEvent);
        }
        return fallbackEvent;
    }
}

async function undoLastEvent(sessionId) {
    try {
        const response = await fetch(`/api/sessions/${sessionId}/undo`, {
            method: 'POST'
        });
        if (!response.ok) {
            return null;
        }
        return await response.json();
    } catch (error) {
        console.error('Error undoing event:', error);
        return null;
    }
}

async function fetchStats(puzzleId) {
    try {
        const response = await fetch(`/api/stats/${puzzleId}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching stats:', error);
        return null;
    }
}

async function fetchActiveSession(puzzleId) {
    try {
        const response = await fetch(`/api/puzzles/${puzzleId}/active-session`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching active session:', error);
        return null;
    }
}

async function deleteSession(sessionId) {
    try {
        await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
        state.sessions = state.sessions.filter(s => s.id !== sessionId);
    } catch (error) {
        console.error('Error deleting session:', error);
    }
}

// Rendering Functions
function renderPuzzleList() {
    if (state.puzzles.length === 0) {
        elements.puzzlesContainer.innerHTML = `
            <div class="empty-state">
                <p>No puzzles yet</p>
                <button class="btn btn-primary" onclick="document.getElementById('add-puzzle-btn').click()">
                    Create your first puzzle
                </button>
            </div>
        `;
        return;
    }

    elements.puzzlesContainer.innerHTML = state.puzzles.map(puzzle => {
        const sessions = state.sessions.filter(s => s.puzzleId === puzzle.id);
        const totalPlaced = sessions.reduce((sum, s) => {
            return sum + (s.events || []).filter(e => e.type === 'piece_placed').length;
        }, 0);
        const progress = puzzle.totalPieces > 0 ? (totalPlaced / puzzle.totalPieces * 100) : 0;

        return `
            <div class="puzzle-card" onclick="openPuzzle('${puzzle.id}')">
                <h3>${escapeHtml(puzzle.name)}</h3>
                <div class="puzzle-card-meta">
                    <span>${puzzle.totalPieces} pieces</span>
                    <span>${totalPlaced} placed (${Math.round(progress)}%)</span>
                </div>
                <div class="puzzle-card-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function renderPuzzleDetail(puzzle) {
    elements.puzzleDetailName.textContent = puzzle.name;
    elements.puzzleDetailPieces.textContent = `${puzzle.totalPieces} pieces`;

    const stats = await fetchStats(puzzle.id);
    if (stats) {
        elements.statsSummary.innerHTML = `
            <div class="stat-card">
                <div class="value">${stats.totalPiecesPlaced}</div>
                <div class="label">Pieces Placed</div>
            </div>
            <div class="stat-card">
                <div class="value">${stats.progress}%</div>
                <div class="label">Progress</div>
            </div>
            <div class="stat-card">
                <div class="value">${formatTime(stats.avgTimePerPiece)}</div>
                <div class="label">Avg per Piece</div>
            </div>
            <div class="stat-card">
                <div class="value">${stats.sessionsCount}</div>
                <div class="label">Sessions</div>
            </div>
        `;
    }
}

async function renderStats(puzzleId) {
    const stats = await fetchStats(puzzleId);
    if (!stats) {
        elements.statsContent.innerHTML = '<p>Error loading statistics</p>';
        return;
    }

    const sessions = stats.sessions || [];
    const sessionsCount = sessions.length;
    const avgPiecesPerSession = sessionsCount ? (stats.totalPiecesPlaced / sessionsCount) : 0;
    const avgVelocity = stats.totalTime > 0 ? (stats.totalPiecesPlaced / stats.totalTime) * 3600 : 0;
    const sessionsWithVelocity = sessions.map(session => {
        const totalTime = session.totalTime || 0;
        const piecesPlaced = session.piecesPlaced || 0;
        const velocity = totalTime > 0 ? (piecesPlaced / totalTime) * 3600 : 0;
        return { ...session, velocity };
    });

    elements.statsContent.innerHTML = `
        <div class="stats-card">
            <h3>Overall Progress</h3>
            <div class="stats-grid">
                <div class="stats-item">
                    <div class="value">${stats.totalPiecesPlaced}</div>
                    <div class="label">Pieces Placed</div>
                </div>
                <div class="stats-item">
                    <div class="value">${stats.progress}%</div>
                    <div class="label">Complete</div>
                </div>
                <div class="stats-item">
                    <div class="value">${stats.totalPiecesFailed}</div>
                    <div class="label">Failed Attempts</div>
                </div>
                <div class="stats-item">
                    <div class="value">${stats.successRate}%</div>
                    <div class="label">Success Rate</div>
                </div>
            </div>
        </div>

        <div class="stats-card">
            <h3>Time Statistics</h3>
            <div class="stats-grid">
                <div class="stats-item">
                    <div class="value">${formatDuration(stats.totalTime)}</div>
                    <div class="label">Total Time</div>
                </div>
                <div class="stats-item">
                    <div class="value">${formatTime(stats.avgTimePerPiece)}</div>
                    <div class="label">Avg per Piece</div>
                </div>
            </div>
        </div>

        <div class="stats-card">
            <h3>Session Averages</h3>
            <div class="stats-grid">
                <div class="stats-item">
                    <div class="value">${avgPiecesPerSession.toFixed(1)}</div>
                    <div class="label">Pieces per Sitting</div>
                </div>
                <div class="stats-item">
                    <div class="value">${formatVelocity(avgVelocity)}</div>
                    <div class="label">Avg Velocity</div>
                </div>
            </div>
        </div>

        <div class="stats-card">
            <h3>Velocity Over Time</h3>
            <div class="stats-graph">
                <canvas id="velocity-canvas"></canvas>
                <div id="velocity-empty" class="graph-empty">Complete a sitting session to see velocity</div>
            </div>
        </div>

        <div class="stats-card">
            <h3>Sessions (${stats.sessionsCount})</h3>
            <div class="sessions-list">
                ${sessionsWithVelocity.map(session => `
                    <div class="session-item">
                        <div class="session-item-header">
                            <span>${formatDate(session.startedAt)}</span>
                            <span>${formatDuration(session.totalTime)}</span>
                        </div>
                        <div class="session-item-stats">
                            <span>+${session.piecesPlaced} placed</span>
                            <span>-${session.piecesFailed} failed</span>
                            <span>${formatVelocity(session.velocity)}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <button class="btn btn-danger" onclick="handleDeletePuzzle('${puzzleId}')">
            Delete Puzzle
        </button>
    `;

    const velocityCanvas = document.getElementById('velocity-canvas');
    const velocityEmpty = document.getElementById('velocity-empty');
    const velocitySeries = sessionsWithVelocity
        .slice()
        .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt))
        .map(session => session.velocity);

    requestAnimationFrame(() => {
        updateVelocityGraph(velocityCanvas, velocityEmpty, velocitySeries);
    });
}

// Event Handlers
async function openPuzzle(puzzleId) {
    state.currentPuzzle = state.puzzles.find(p => p.id === puzzleId);
    if (!state.currentPuzzle) return;

    // Check for active (orphaned) session
    const activeSession = await fetchActiveSession(puzzleId);
    if (activeSession) {
        showSessionRecoveryDialog(activeSession);
        return;
    }

    await renderPuzzleDetail(state.currentPuzzle);
    showView('puzzleDetail');
}

function showSessionRecoveryDialog(session) {
    const startedAt = formatDate(session.startedAt);
    const placedCount = (session.events || []).filter(e => e.type === 'piece_placed').length;
    const failedCount = (session.events || []).filter(e => e.type === 'piece_failed').length;

    const dialog = document.getElementById('session-recovery-dialog');
    dialog.innerHTML = `
        <div class="dialog-content">
            <h3>Unfinished Session Found</h3>
            <p>You have an active session that was interrupted:</p>
            <div class="session-recovery-info">
                <div><strong>Started:</strong> ${startedAt}</div>
                <div><strong>Pieces placed:</strong> ${placedCount}</div>
                <div><strong>Failed attempts:</strong> ${failedCount}</div>
            </div>
            <div class="dialog-buttons">
                <button class="btn btn-primary" onclick="handleContinueSession('${session.id}')">
                    Continue Session
                </button>
                <button class="btn btn-danger" onclick="handleDeleteOrphanedSession('${session.id}')">
                    Delete Session
                </button>
                <button class="btn btn-secondary" onclick="hideSessionRecoveryDialog()">
                    Cancel
                </button>
            </div>
        </div>
    `;
    dialog.classList.add('active');
}

function hideSessionRecoveryDialog() {
    const dialog = document.getElementById('session-recovery-dialog');
    dialog.classList.remove('active');
}

async function handleContinueSession(sessionId) {
    hideSessionRecoveryDialog();

    const fetchedSession = state.sessions.find(s => s.id === sessionId) ||
                    await fetch(`/api/puzzles/${state.currentPuzzle.id}/active-session`).then(r => r.json());

    if (!fetchedSession) return;

    const existingIndex = state.sessions.findIndex(s => s.id === fetchedSession.id);
    if (existingIndex === -1) {
        state.sessions.push(fetchedSession);
        state.currentSession = fetchedSession;
    } else {
        state.sessions[existingIndex] = fetchedSession;
        state.currentSession = state.sessions[existingIndex];
    }

    const sessionEvents = state.currentSession.events || [];

    const totalTime = sessionEvents.reduce((sum, e) => sum + (e.elapsed || 0), 0);

    // Restore session state
    state.sessionStartTime = Date.now() - (totalTime * 1000); // Offset to show correct elapsed time
    state.lastEventTime = Date.now();
    state.piecePickedTime = null;
    state.isPiecePicked = false;
    state.isPaused = false;
    state.pausedAt = null;
    state.totalPausedTime = 0;
    state.piecePausedTime = 0;
    state.pieceTimes = sessionEvents
        .filter(e => e.type === 'piece_placed')
        .map(e => e.elapsed || 0);
    state.lastPieceTime = state.pieceTimes.length > 0 ? state.pieceTimes[state.pieceTimes.length - 1] : null;
    setSessionScope(sessionScopes.project, { skipRender: true });

    elements.sessionPuzzleName.textContent = state.currentPuzzle.name;
    elements.sessionTimer.textContent = '00:00:00';
    elements.pieceTime.textContent = '--';
    elements.lastPieceTime.textContent = state.lastPieceTime !== null ? formatTime(state.lastPieceTime) : '--';
    elements.sessionView.classList.remove('session-paused');
    elements.pauseIcon.classList.remove('hidden');
    elements.playIcon.classList.add('hidden');

    updateButtonStates();
    updateUndoButtonState();
    startTimers();
    showView('session');

    requestAnimationFrame(() => {
        updateProgressionGraph();
        updateHistogram();
    });
}

async function handleDeleteOrphanedSession(sessionId) {
    hideSessionRecoveryDialog();
    await deleteSession(sessionId);
    await renderPuzzleDetail(state.currentPuzzle);
    showView('puzzleDetail');
}

async function handleStartSession() {
    if (!state.currentPuzzle) return;

    const session = await startSession(state.currentPuzzle.id);
    if (!session) return;

    state.currentSession = session;
    state.sessionStartTime = Date.now();
    state.lastEventTime = Date.now();
    state.piecePickedTime = null;
    state.isPiecePicked = false;
    state.isPaused = false;
    state.pausedAt = null;
    state.totalPausedTime = 0;
    state.piecePausedTime = 0;
    state.pieceTimes = [];
    state.lastPieceTime = null;
    setSessionScope(sessionScopes.project, { skipRender: true });

    elements.sessionPuzzleName.textContent = state.currentPuzzle.name;
    elements.sessionTimer.textContent = '00:00:00';
    elements.pieceTime.textContent = '--';
    elements.lastPieceTime.textContent = '--';
    elements.sessionView.classList.remove('session-paused');
    elements.pauseIcon.classList.remove('hidden');
    elements.playIcon.classList.add('hidden');

    updateButtonStates();
    updateUndoButtonState();
    startTimers();
    showView('session');

    // Render graph after view is visible so canvas has proper dimensions
    requestAnimationFrame(() => {
        updateProgressionGraph();
        updateHistogram();
    });
}

function updateButtonStates() {
    const paused = state.isPaused;

    if (state.isPiecePicked) {
        elements.piecePickedBtn.classList.add('disabled');
        elements.piecePickedBtn.disabled = true;
        elements.piecePlacedBtn.classList.toggle('disabled', paused);
        elements.piecePlacedBtn.disabled = paused;
        elements.pieceFailedBtn.classList.toggle('disabled', paused);
        elements.pieceFailedBtn.disabled = paused;
    } else {
        elements.piecePickedBtn.classList.toggle('disabled', paused);
        elements.piecePickedBtn.disabled = paused;
        elements.piecePlacedBtn.classList.add('disabled');
        elements.piecePlacedBtn.disabled = true;
        elements.pieceFailedBtn.classList.add('disabled');
        elements.pieceFailedBtn.disabled = true;
    }
}

function handlePiecePicked() {
    if (!state.currentSession || state.isPiecePicked || state.isPaused) return;

    state.piecePickedTime = Date.now();
    state.piecePausedTime = 0;
    state.isPiecePicked = true;
    updateButtonStates();

    // Visual feedback
    elements.piecePickedBtn.style.transform = 'scale(0.95)';
    setTimeout(() => {
        elements.piecePickedBtn.style.transform = '';
    }, 100);
}

async function handleEndSession() {
    if (!state.currentSession) return;

    stopTimers();
    await endSession(state.currentSession.id);

    state.currentSession = null;
    state.sessionStartTime = null;
    state.lastEventTime = null;

    await renderPuzzleDetail(state.currentPuzzle);
    showView('puzzleDetail');
}

async function handlePiecePlaced() {
    if (!state.currentSession || !state.isPiecePicked || state.isPaused) return;

    const elapsed = (Date.now() - state.piecePickedTime - state.piecePausedTime) / 1000;
    state.lastEventTime = Date.now();
    state.piecePickedTime = null;
    state.piecePausedTime = 0;
    state.isPiecePicked = false;
    state.lastPieceTime = elapsed;

    await recordEvent(state.currentSession.id, 'piece_placed', elapsed);

    // Track time for progression graph
    state.pieceTimes.push(elapsed);
    updateProgressionGraph();
    updateHistogram();
    updateSessionStats();

    updateButtonStates();
    updateUndoButtonState();
    elements.pieceTime.textContent = '--';
    elements.lastPieceTime.textContent = formatTime(elapsed);

    // Visual feedback
    elements.piecePlacedBtn.style.transform = 'scale(0.95)';
    setTimeout(() => {
        elements.piecePlacedBtn.style.transform = '';
    }, 100);
}

async function handlePieceFailed() {
    if (!state.currentSession || !state.isPiecePicked || state.isPaused) return;

    const elapsed = (Date.now() - state.piecePickedTime - state.piecePausedTime) / 1000;
    state.lastEventTime = Date.now();
    state.piecePickedTime = null;
    state.piecePausedTime = 0;
    state.isPiecePicked = false;

    await recordEvent(state.currentSession.id, 'piece_failed', elapsed);
    updateSessionStats();

    updateButtonStates();
    updateUndoButtonState();
    elements.pieceTime.textContent = '--';

    // Visual feedback
    elements.pieceFailedBtn.style.transform = 'scale(0.95)';
    setTimeout(() => {
        elements.pieceFailedBtn.style.transform = '';
    }, 100);
}

async function handleUndo() {
    if (!state.currentSession || state.isPaused) return;

    const result = await undoLastEvent(state.currentSession.id);
    if (!result) return;

    const removedEvent = result.removed;
    const session = state.sessions.find(s => s.id === state.currentSession.id);
    if (session && session.events && session.events.length) {
        session.events.pop();
    }
    if (state.currentSession && state.currentSession !== session && state.currentSession.events && state.currentSession.events.length) {
        state.currentSession.events.pop();
    }

    // Update UI counters
    if (removedEvent.type === 'piece_placed') {
        // Remove from pieceTimes array for graph
        state.pieceTimes.pop();
        // Update lastPieceTime to the new last piece (or null if none)
        state.lastPieceTime = state.pieceTimes.length > 0 ? state.pieceTimes[state.pieceTimes.length - 1] : null;
        elements.lastPieceTime.textContent = state.lastPieceTime !== null ? formatTime(state.lastPieceTime) : '--';
        updateProgressionGraph();
        updateHistogram();
    }

    updateSessionStats();
    updateUndoButtonState();

    // Visual feedback
    elements.undoBtn.style.transform = 'scale(0.95)';
    setTimeout(() => {
        elements.undoBtn.style.transform = '';
    }, 100);
}

function updateUndoButtonState() {
    const hasEvents = !!(state.currentSession && (state.currentSession.events || []).length);

    if (hasEvents && !state.isPaused) {
        elements.undoBtn.classList.remove('disabled');
        elements.undoBtn.disabled = false;
    } else {
        elements.undoBtn.classList.add('disabled');
        elements.undoBtn.disabled = true;
    }
}

async function handleDeletePuzzle(puzzleId) {
    if (!confirm('Are you sure you want to delete this puzzle? All data will be lost.')) {
        return;
    }

    await deletePuzzle(puzzleId);
    state.currentPuzzle = null;
    renderPuzzleList();
    showView('puzzleList');
}

// Timer Functions
function startTimers() {
    state.sessionTimer = setInterval(updateSessionTimer, 1000);
    state.pieceTimer = setInterval(updatePieceTimer, 100);
}

function stopTimers() {
    if (state.sessionTimer) {
        clearInterval(state.sessionTimer);
        state.sessionTimer = null;
    }
    if (state.pieceTimer) {
        clearInterval(state.pieceTimer);
        state.pieceTimer = null;
    }
}

function updateSessionTimer() {
    if (!state.sessionStartTime || state.isPaused) return;

    const elapsed = Math.floor((Date.now() - state.sessionStartTime - state.totalPausedTime) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;

    elements.sessionTimer.textContent =
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function updatePieceTimer() {
    if (!state.piecePickedTime || state.isPaused) return;

    const elapsed = (Date.now() - state.piecePickedTime - state.piecePausedTime) / 1000;
    elements.pieceTime.textContent = `${elapsed.toFixed(1)}s`;
}

// Utility Functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(seconds) {
    if (seconds < 60) {
        return `${seconds.toFixed(1)}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
}

function formatVelocity(value) {
    if (!value || value <= 0) {
        return '--';
    }
    return `${value.toFixed(1)} pcs/hr`;
}

function formatVelocityTick(value) {
    if (!value || value <= 0) {
        return '0';
    }
    return value.toFixed(0);
}

function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
}

function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Pause/Resume Functions
function handlePauseToggle() {
    if (!state.currentSession) return;

    if (state.isPaused) {
        // Resume
        const pauseDuration = Date.now() - state.pausedAt;
        state.totalPausedTime += pauseDuration;
        if (state.isPiecePicked) {
            state.piecePausedTime += pauseDuration;
        }
        state.isPaused = false;
        state.pausedAt = null;

        elements.sessionView.classList.remove('session-paused');
        elements.pauseIcon.classList.remove('hidden');
        elements.playIcon.classList.add('hidden');
    } else {
        // Pause
        state.isPaused = true;
        state.pausedAt = Date.now();

        elements.sessionView.classList.add('session-paused');
        elements.pauseIcon.classList.add('hidden');
        elements.playIcon.classList.remove('hidden');
    }

    updateButtonStates();
    updateUndoButtonState();
}

// Progression Graph Functions
function resetProgressionGraph() {
    const canvas = elements.progressionCanvas;
    const ctx = canvas.getContext('2d');

    // Set canvas size for retina
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.clearRect(0, 0, rect.width, rect.height);
    canvas.classList.remove('has-data');
    updateScopeEmptyMessage();
    elements.graphEmpty.style.display = 'block';
}

function updateProgressionGraph() {
    const canvas = elements.progressionCanvas;
    const ctx = canvas.getContext('2d');
    const times = getScopePieceTimes();

    if (times.length === 0) {
        resetProgressionGraph();
        return;
    }

    canvas.classList.add('has-data');
    elements.graphEmpty.style.display = 'none';

    // Get actual display size
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Set canvas size for retina
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Padding
    const padding = { top: 10, right: 15, bottom: 25, left: 40 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;

    // Calculate scales
    const maxTime = Math.max(...times) * 1.1;
    const minTime = 0;

    // Draw grid lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;

    // Horizontal grid lines (time values)
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
        const y = padding.top + (graphHeight * i / gridLines);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        // Y-axis labels
        const timeValue = maxTime - (maxTime * i / gridLines);
        ctx.fillStyle = '#64748b';
        ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatTime(timeValue), padding.left - 5, y);
    }

    // Draw X-axis label
    ctx.fillStyle = '#64748b';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Piece #', width / 2, height - 5);

    // Draw line chart
    if (times.length > 0) {
        ctx.strokeStyle = '#4f46e5';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        times.forEach((time, index) => {
            const x = padding.left + (graphWidth * index / Math.max(times.length - 1, 1));
            const y = padding.top + graphHeight - (graphHeight * (time - minTime) / (maxTime - minTime));

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();

        // Draw points
        ctx.fillStyle = '#4f46e5';
        times.forEach((time, index) => {
            const x = padding.left + (graphWidth * index / Math.max(times.length - 1, 1));
            const y = padding.top + graphHeight - (graphHeight * (time - minTime) / (maxTime - minTime));

            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        });

        // Draw trend line if we have enough data
        if (times.length >= 3) {
            const avgFirst = times.slice(0, Math.ceil(times.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(times.length / 2);
            const avgSecond = times.slice(Math.ceil(times.length / 2)).reduce((a, b) => a + b, 0) / (times.length - Math.ceil(times.length / 2));

            ctx.strokeStyle = avgSecond < avgFirst ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.3)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);

            const startY = padding.top + graphHeight - (graphHeight * (avgFirst - minTime) / (maxTime - minTime));
            const endY = padding.top + graphHeight - (graphHeight * (avgSecond - minTime) / (maxTime - minTime));

            ctx.beginPath();
            ctx.moveTo(padding.left, startY);
            ctx.lineTo(width - padding.right, endY);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
}

function resetHistogram() {
    const canvas = elements.histogramCanvas;
    const ctx = canvas.getContext('2d');

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.clearRect(0, 0, rect.width, rect.height);
    canvas.classList.remove('has-data');
    elements.histogramEmpty.style.display = 'block';
}

function updateHistogram() {
    const canvas = elements.histogramCanvas;
    const ctx = canvas.getContext('2d');
    const times = getScopePieceTimes();

    if (times.length === 0) {
        resetHistogram();
        return;
    }

    canvas.classList.add('has-data');
    elements.histogramEmpty.style.display = 'none';

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.clearRect(0, 0, width, height);

    const padding = { top: 10, right: 15, bottom: 25, left: 40 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;

    // Calculate histogram bins
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const range = maxTime - minTime;

    // Use ~8 bins or fewer for small datasets
    const binCount = Math.min(8, Math.max(3, Math.ceil(Math.sqrt(times.length))));
    const binWidth = range > 0 ? range / binCount : 1;

    // Create bins
    const bins = new Array(binCount).fill(0);
    const binEdges = [];
    for (let i = 0; i <= binCount; i++) {
        binEdges.push(minTime + i * binWidth);
    }

    // Count values in each bin
    times.forEach(time => {
        let binIndex = Math.floor((time - minTime) / binWidth);
        if (binIndex >= binCount) binIndex = binCount - 1;
        if (binIndex < 0) binIndex = 0;
        bins[binIndex]++;
    });

    const maxCount = Math.max(...bins);

    // Draw grid lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;

    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
        const y = padding.top + (graphHeight * i / gridLines);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        // Y-axis labels (counts)
        const countValue = Math.round(maxCount - (maxCount * i / gridLines));
        ctx.fillStyle = '#64748b';
        ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(countValue.toString(), padding.left - 5, y);
    }

    // Draw X-axis label
    ctx.fillStyle = '#64748b';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Time (s)', width / 2, height - 5);

    // Draw bars
    const barPadding = 2;
    const barWidth = (graphWidth / binCount) - barPadding;

    ctx.fillStyle = '#4f46e5';
    bins.forEach((count, index) => {
        const barHeight = maxCount > 0 ? (count / maxCount) * graphHeight : 0;
        const x = padding.left + index * (barWidth + barPadding) + barPadding / 2;
        const y = padding.top + graphHeight - barHeight;

        ctx.fillRect(x, y, barWidth, barHeight);
    });

    // Draw bin edge labels (just first, middle, last)
    ctx.fillStyle = '#64748b';
    ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const labelY = padding.top + graphHeight + 3;
    // First bin label
    ctx.textAlign = 'left';
    ctx.fillText(formatTime(binEdges[0]), padding.left, labelY);
    // Last bin label
    ctx.textAlign = 'right';
    ctx.fillText(formatTime(binEdges[binCount]), width - padding.right, labelY);
}

function updateVelocityGraph(canvas, emptyElement, velocities) {
    if (!canvas || !emptyElement) return;

    const ctx = canvas.getContext('2d');
    const hasData = velocities.length > 0 && velocities.some(value => value > 0);

    // Set canvas size for retina
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.clearRect(0, 0, rect.width, rect.height);

    if (!hasData) {
        canvas.classList.remove('has-data');
        emptyElement.style.display = 'block';
        return;
    }

    canvas.classList.add('has-data');
    emptyElement.style.display = 'none';

    const padding = { top: 10, right: 15, bottom: 25, left: 40 };
    const graphWidth = rect.width - padding.left - padding.right;
    const graphHeight = rect.height - padding.top - padding.bottom;

    const maxVelocity = Math.max(...velocities);
    const minVelocity = 0;
    const safeMax = maxVelocity === 0 ? 1 : maxVelocity * 1.1;

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;

    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
        const y = padding.top + (graphHeight * i / gridLines);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(rect.width - padding.right, y);
        ctx.stroke();

        const velocityValue = safeMax - (safeMax * i / gridLines);
        ctx.fillStyle = '#64748b';
        ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatVelocityTick(velocityValue), padding.left - 5, y);
    }

    ctx.fillStyle = '#64748b';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Session #', rect.width / 2, rect.height - 5);

    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    velocities.forEach((velocity, index) => {
        const x = padding.left + (graphWidth * index / Math.max(velocities.length - 1, 1));
        const y = padding.top + graphHeight - (graphHeight * (velocity - minVelocity) / (safeMax - minVelocity));

        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();

    ctx.fillStyle = '#22c55e';
    velocities.forEach((velocity, index) => {
        const x = padding.left + (graphWidth * index / Math.max(velocities.length - 1, 1));
        const y = padding.top + graphHeight - (graphHeight * (velocity - minVelocity) / (safeMax - minVelocity));

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
    });
}

// Event Listeners
elements.backBtn.addEventListener('click', goBack);

elements.addPuzzleBtn.addEventListener('click', () => {
    elements.puzzleName.value = '';
    elements.puzzlePieces.value = '';
    showView('newPuzzle');
});

elements.newPuzzleForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = elements.puzzleName.value.trim();
    const pieces = parseInt(elements.puzzlePieces.value);

    if (!name || !pieces) return;

    const puzzle = await createPuzzle(name, pieces);
    if (puzzle) {
        renderPuzzleList();
        state.currentPuzzle = puzzle;
        await renderPuzzleDetail(puzzle);
        showView('puzzleDetail');
    }
});

elements.startSessionBtn.addEventListener('click', handleStartSession);
elements.viewStatsBtn.addEventListener('click', async () => {
    showView('stats');
    await renderStats(state.currentPuzzle.id);
});

elements.piecePickedBtn.addEventListener('click', handlePiecePicked);
elements.piecePlacedBtn.addEventListener('click', handlePiecePlaced);
elements.pieceFailedBtn.addEventListener('click', handlePieceFailed);
elements.undoBtn.addEventListener('click', handleUndo);
elements.endSessionBtn.addEventListener('click', handleEndSession);
elements.pauseBtn.addEventListener('click', handlePauseToggle);
elements.sessionScopeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        setSessionScope(btn.dataset.sessionScope);
    });
});

// Prevent accidental navigation during session
window.addEventListener('beforeunload', (e) => {
    if (state.currentSession) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Initialize
fetchData();
