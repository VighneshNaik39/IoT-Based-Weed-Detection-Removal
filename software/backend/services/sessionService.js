const fs = require("fs");
const path = require("path");

// ==========================================
// Sessions file
// ==========================================
const sessionFilePath = path.join(
    __dirname,
    "../data/sessions.json"
);

// ==========================================
// Make sure sessions.json exists
// ==========================================
if (!fs.existsSync(sessionFilePath)) {
    fs.writeFileSync(sessionFilePath, "[]");
}

// ==========================================
// Read sessions
// ==========================================
function readSessions() {
    try {
        return JSON.parse(
            fs.readFileSync(sessionFilePath, "utf8")
        );
    } catch (error) {
        console.error("❌ Error reading sessions:", error);
        return [];
    }
}

// ==========================================
// Write sessions
// ==========================================
function writeSessions(sessions) {
    try {
        fs.writeFileSync(
            sessionFilePath,
            JSON.stringify(sessions, null, 2)
        );
    } catch (error) {
        console.error("❌ Error writing sessions:", error);
    }
}

// ==========================================
// Current active session
// ==========================================
let currentSession = null;

// ==========================================
// Start new session
// ==========================================
function startNewSession() {

    const sessions = readSessions();

    const sessionNumber = sessions.length + 1;

    currentSession = {
        sessionNumber,
        startTime: new Date().toISOString(),
        endTime: null,
        durationMs: 0,
        totalDetections: 0,
        executions: 0,
        avgMoisture: null,

        completed: false,

        _moistureSum: 0,
        _moistureCount: 0
    };

    saveCurrentSessionToDisk();

    console.log(
        `🌿 Session ${sessionNumber} started.`
    );
}

// ==========================================
// Save current session
// ==========================================
function saveCurrentSessionToDisk() {

    if (!currentSession) {
        return;
    }

    const sessions = readSessions();

    const liveAvg =
        currentSession._moistureCount > 0
            ? Math.round(
                currentSession._moistureSum /
                currentSession._moistureCount
            )
            : null;

    const snapshot = {
        sessionNumber: currentSession.sessionNumber,
        startTime: currentSession.startTime,
        endTime: new Date().toISOString(),

        durationMs:
            Date.now() -
            new Date(
                currentSession.startTime
            ).getTime(),

        totalDetections:
            currentSession.totalDetections,

        executions:
            currentSession.executions,

        avgMoisture: liveAvg,

        completed: false
    };

    const existingIndex = sessions.findIndex(
        session =>
            session.sessionNumber ===
            currentSession.sessionNumber
    );

    if (existingIndex >= 0) {

        sessions[existingIndex] = snapshot;

    } else {

        sessions.push(snapshot);

    }

    writeSessions(sessions);
}

// ==========================================
// Record ESP32 / AI detection
// ==========================================
function recordDetection({
    weed = false,
    moisture = null
} = {}) {

    if (!currentSession) {
        startNewSession();
    }

    currentSession.executions++;

    if (weed) {
        currentSession.totalDetections++;
    }

    if (moisture !== null && moisture !== undefined) {

        currentSession._moistureSum +=
            Number(moisture);

        currentSession._moistureCount++;
    }

    saveCurrentSessionToDisk();
}

// ==========================================
// Complete current session
// ==========================================
function completeCurrentSession() {

    if (!currentSession) {
        return;
    }

    const endTime = new Date().toISOString();

    const durationMs =
        Date.now() -
        new Date(
            currentSession.startTime
        ).getTime();

    const liveAvg =
        currentSession._moistureCount > 0
            ? Math.round(
                currentSession._moistureSum /
                currentSession._moistureCount
            )
            : null;

    const completedSession = {

        sessionNumber:
            currentSession.sessionNumber,

        startTime:
            currentSession.startTime,

        endTime,

        durationMs,

        totalDetections:
            currentSession.totalDetections,

        executions:
            currentSession.executions,

        avgMoisture:
            liveAvg,

        completed: true
    };

    const sessions = readSessions();

    const existingIndex = sessions.findIndex(
        session =>
            session.sessionNumber ===
            currentSession.sessionNumber
    );

    if (existingIndex >= 0) {

        sessions[existingIndex] =
            completedSession;

    } else {

        sessions.push(
            completedSession
        );

    }

    writeSessions(sessions);

    console.log(
        `✅ Session ${currentSession.sessionNumber} completed.`
    );

    currentSession = null;
}

// ==========================================
// Startup
// ==========================================
function onStartup() {

    const sessions = readSessions();

    if (sessions.length > 0) {

        const last =
            sessions[sessions.length - 1];

        if (!last.completed) {

            last.completed = true;

            last.endTime =
                last.endTime ||
                new Date().toISOString();

            last.durationMs =
                new Date(
                    last.endTime
                ).getTime() -
                new Date(
                    last.startTime
                ).getTime();

            writeSessions(sessions);

            console.log(
                `✅ Previous session ${last.sessionNumber} marked complete on startup.`
            );
        }
    }

    startNewSession();
}

// ==========================================
// Get current session
// ==========================================
function getCurrentSession() {

    return currentSession;
}

// ==========================================
// Get latest sessions
// ==========================================
function getLatestSessions(limit = 5) {

    const saved = readSessions();

    const all = saved.filter(
        session =>
            !currentSession ||
            session.sessionNumber !==
            currentSession.sessionNumber
    );

    if (currentSession) {

        const liveDuration =
            Date.now() -
            new Date(
                currentSession.startTime
            ).getTime();

        const liveAvg =
            currentSession._moistureCount > 0
                ? Math.round(
                    currentSession._moistureSum /
                    currentSession._moistureCount
                )
                : null;

        all.push({

            sessionNumber:
                currentSession.sessionNumber,

            startTime:
                currentSession.startTime,

            endTime: null,

            durationMs:
                liveDuration,

            totalDetections:
                currentSession.totalDetections,

            executions:
                currentSession.executions,

            avgMoisture:
                liveAvg,

            completed: false
        });
    }

    return all
        .slice(-limit)
        .reverse();
}

// ==========================================
// Export
// ==========================================
module.exports = {

    readSessions,
    writeSessions,

    startNewSession,
    saveCurrentSessionToDisk,

    recordDetection,

    completeCurrentSession,

    onStartup,

    getCurrentSession,
    getLatestSessions

};