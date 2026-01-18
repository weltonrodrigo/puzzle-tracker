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
    pieceTimes: []          // Array of placement times for graph
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
    sessionPlaced: document.getElementById('session-placed'),
    sessionFailed: document.getElementById('session-failed'),
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
    sessionView: document.getElementById('session-view')
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
        await fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, type, elapsed })
        });
    } catch (error) {
        console.error('Error recording event:', error);
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
            <h3>Sessions (${stats.sessionsCount})</h3>
            <div class="sessions-list">
                ${stats.sessions.map(session => `
                    <div class="session-item">
                        <div class="session-item-header">
                            <span>${formatDate(session.startedAt)}</span>
                            <span>${formatDuration(session.totalTime)}</span>
                        </div>
                        <div class="session-item-stats">
                            <span>+${session.piecesPlaced} placed</span>
                            <span>-${session.piecesFailed} failed</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <button class="btn btn-danger" onclick="handleDeletePuzzle('${puzzleId}')">
            Delete Puzzle
        </button>
    `;
}

// Event Handlers
async function openPuzzle(puzzleId) {
    state.currentPuzzle = state.puzzles.find(p => p.id === puzzleId);
    if (!state.currentPuzzle) return;

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

    elements.sessionPuzzleName.textContent = state.currentPuzzle.name;
    elements.sessionPlaced.textContent = '0';
    elements.sessionFailed.textContent = '0';
    elements.sessionTimer.textContent = '00:00:00';
    elements.pieceTime.textContent = '--';
    elements.sessionView.classList.remove('session-paused');
    elements.pauseIcon.classList.remove('hidden');
    elements.playIcon.classList.add('hidden');

    updateButtonStates();
    startTimers();
    showView('session');

    // Reset graph after view is visible so canvas has proper dimensions
    requestAnimationFrame(() => {
        resetProgressionGraph();
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

    await recordEvent(state.currentSession.id, 'piece_placed', elapsed);

    // Track time for progression graph
    state.pieceTimes.push(elapsed);
    updateProgressionGraph();

    const current = parseInt(elements.sessionPlaced.textContent);
    elements.sessionPlaced.textContent = current + 1;

    updateButtonStates();
    elements.pieceTime.textContent = '--';

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

    const current = parseInt(elements.sessionFailed.textContent);
    elements.sessionFailed.textContent = current + 1;

    updateButtonStates();
    elements.pieceTime.textContent = '--';

    // Visual feedback
    elements.pieceFailedBtn.style.transform = 'scale(0.95)';
    setTimeout(() => {
        elements.pieceFailedBtn.style.transform = '';
    }, 100);
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
    elements.graphEmpty.style.display = 'block';
}

function updateProgressionGraph() {
    const canvas = elements.progressionCanvas;
    const ctx = canvas.getContext('2d');
    const times = state.pieceTimes;

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
elements.viewStatsBtn.addEventListener('click', () => {
    renderStats(state.currentPuzzle.id);
    showView('stats');
});

elements.piecePickedBtn.addEventListener('click', handlePiecePicked);
elements.piecePlacedBtn.addEventListener('click', handlePiecePlaced);
elements.pieceFailedBtn.addEventListener('click', handlePieceFailed);
elements.endSessionBtn.addEventListener('click', handleEndSession);
elements.pauseBtn.addEventListener('click', handlePauseToggle);

// Prevent accidental navigation during session
window.addEventListener('beforeunload', (e) => {
    if (state.currentSession) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Initialize
fetchData();
