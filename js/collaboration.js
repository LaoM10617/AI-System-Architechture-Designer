const COLLABORATION_SERVER = "ws://localhost:8080";
let socket = null;
let currentRoomId = null;
let currentUsers = [];
let userId = generateUserId();
let userColor = generateUserColor();

function initCollaboration() {
    document.getElementById('startCollabBtn').addEventListener('click', startCollaborationSession);
    document.getElementById('joinCollabBtn').addEventListener('click', joinCollaborationSession);
    document.getElementById('listSessionsBtn').addEventListener('click', listActiveSessions);

    setupCursorTracking();
}

function generateUserId() {
    return 'user-' + Math.random().toString(36).substr(2, 8);
}

function generateUserColor() {
    const colors = ['#FF5252', '#FF4081', '#E040FB', '#7C4DFF', '#536DFE', '#448AFF',
        '#40C4FF', '#18FFFF', '#64FFDA', '#69F0AE', '#B2FF59', '#EEFF41',
        '#FFFF00', '#FFD740', '#FFAB40', '#FF6E40'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function startCollaborationSession() {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        connectToCollabServer();
    }

    const userName = prompt("Enter your name:", "User " + Math.floor(Math.random() * 1000));
    if (!userName) return;

    socket.send(JSON.stringify({
        type: 'createRoom',
        user: {
            id: userId,
            name: userName,
            color: userColor
        }
    }));
}

function joinCollaborationSession() {
    const roomId = document.getElementById('roomIdInput').value.trim();
    if (!roomId) {
        alert("Please enter a Room ID");
        return;
    }

    if (!socket || socket.readyState !== WebSocket.OPEN) {
        connectToCollabServer();
    }

    const userName = prompt("Enter your name:", "User " + Math.floor(Math.random() * 1000));
    if (!userName) return;

    socket.send(JSON.stringify({
        type: 'joinRoom',
        roomId: roomId,
        user: {
            id: userId,
            name: userName,
            color: userColor
        }
    }));
}

// function listActiveSessions() {
//     if (!socket || socket.readyState !== WebSocket.OPEN) {
//         alert("Please connect to server first");
//         return;
//     }

//     socket.send(JSON.stringify({
//         type: 'listRooms'
//     }));
// }

// function listActiveSessions() {
//     console.log('Find Sessions clicked'); // Debug

//     if (!socket || socket.readyState !== WebSocket.OPEN) {
//         console.error('Socket not connected'); // Debug
//         alert("Please connect to server first");
//         return;
//     }

//     console.log('Sending listRooms request'); // Debug
//     socket.send(JSON.stringify({
//         type: 'listRooms',
//         requestId: Date.now() // Add unique ID for tracking
//     }));
// }

// Replace the existing listActiveSessions and showRoomList functions with:

// function listActiveSessions() {
//     const container = document.getElementById('sessionsListContainer');
//     const list = document.getElementById('sessionsList');
    
//     if (!socket || socket.readyState !== WebSocket.OPEN) {
//         alert("Please connect to server first");
//         return;
//     }

//     // Toggle visibility
//     if (container.style.display === 'block') {
//         container.style.display = 'none';
//         return;
//     }

//     // Show loading state
//     list.innerHTML = '<div class="no-sessions">Loading sessions...</div>';
//     container.style.display = 'block';

//     // Request sessions
//     socket.send(JSON.stringify({
//         type: 'listRooms',
//         requestId: Date.now()
//     }));
// }

// In collaboration.js:

function listActiveSessions() {
    const container = document.getElementById('sessionsListContainer');
    const list = document.getElementById('sessionsList');
    
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        alert("Please connect to server first");
        return;
    }

    // Show loading state
    list.innerHTML = '<div class="no-sessions">Loading sessions...</div>';
    container.style.display = 'block';

    // Add timeout for server response
    const responseTimeout = setTimeout(() => {
        if (list.innerHTML.includes('Loading')) {
            list.innerHTML = '<div class="no-sessions">Server response timed out</div>';
        }
    }, 5000);

    // Request sessions with unique ID
    const requestId = Date.now();
    socket.send(JSON.stringify({
        type: 'listRooms',
        requestId
    }));

    // Clean up timeout when response arrives
    const originalOnMessage = socket.onmessage;
    socket.onmessage = function(event) {
        try {
            const message = JSON.parse(event.data);
            if (message.type === 'roomList' && message.requestId === requestId) {
                clearTimeout(responseTimeout);
                socket.onmessage = originalOnMessage; // Restore original handler
                showRoomList(message.rooms || []);
            } else {
                originalOnMessage(event);
            }
        } catch (err) {
            originalOnMessage(event);
        }
    };
}

// function showRoomList(rooms) {
//     const list = document.getElementById('sessionsList');
    
//     if (rooms.length === 0) {
//         list.innerHTML = '<div class="no-sessions">No active sessions found</div>';
//         return;
//     }

//     list.innerHTML = rooms.map(room => `
//         <div class="session-item">
//             <div class="session-item-info">
//                 <div class="session-item-id">${room.id}</div>
//                 <div class="session-item-users">
//                     ${room.userCount} user${room.userCount !== 1 ? 's' : ''} • 
//                     Created ${new Date(room.createdAt).toLocaleTimeString()}
//                 </div>
//             </div>
//             <button class="join-session-btn" data-room-id="${room.id}">
//                 <i class="fas fa-sign-in-alt"></i> Join
//             </button>
//         </div>
//     `).join('');

//     // Add event listeners to join buttons
//     document.querySelectorAll('.join-session-btn').forEach(btn => {
//         btn.addEventListener('click', (e) => {
//             const roomId = e.target.closest('button').dataset.roomId;
//             joinRoom(roomId);
//         });
//     });
// }

// Make sure showRoomList updates the UI properly:
function showRoomList(rooms) {
    const list = document.getElementById('sessionsList');
    const container = document.getElementById('sessionsListContainer');
    
    if (!rooms || rooms.length === 0) {
        list.innerHTML = '<div class="no-sessions">No active sessions found</div>';
        return;
    }

    list.innerHTML = rooms.map(room => `
        <div class="session-item">
            <div class="session-item-id">${room.id}</div>
            <div class="session-item-meta">
                ${room.userCount} user${room.userCount !== 1 ? 's' : ''} • 
                ${formatTimeSince(room.createdAt)}
            </div>
            <button class="join-session-btn" data-room-id="${room.id}">
                Join
            </button>
        </div>
    `).join('');

    container.style.display = 'block'; // Ensure it's visible
}

function formatTimeSince(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min ago`;
}

function joinRoom(roomId) {
    document.getElementById('roomIdInput').value = roomId;
    document.getElementById('sessionsListContainer').style.display = 'none';
    joinCollaborationSession();
}

// Add close handler
document.querySelector('.close-sessions-list')?.addEventListener('click', () => {
    document.getElementById('sessionsListContainer').style.display = 'none';
});

function connectToCollabServer() {
    socket = new WebSocket(COLLABORATION_SERVER);

    socket.onopen = () => {
        console.log("WebSocket connected");
        updateConnectionStatus('Connected', 'connected');
        document.getElementById('joinCollabBtn').disabled = false;
        document.getElementById('listSessionsBtn').disabled = false;
    };

    socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        updateConnectionStatus('Connection Failed', 'error');
    };

    socket.onclose = () => {
        console.log("WebSocket disconnected");
        updateConnectionStatus('Disconnected', 'disconnected');
        document.getElementById('joinCollabBtn').disabled = true;
        document.getElementById('listSessionsBtn').disabled = true;
    };

    socket.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log("Received message:", message.type);

            switch (message.type) {
                case 'roomCreated':
                    handleRoomCreated(message);
                    break;

                case 'userJoined':
                    updateUserList(message.users);
                    break;

                case 'userLeft':
                    updateUserList(message.users);
                    removeUserCursor(message.userId);
                    break;

                case 'noteUpdate':
                    updateNoteFromServer(message.data);
                    break;

                case 'architectureUpdate':
                    updateArchitectureFromServer(message.data);
                    break;

                case 'cursorMove':
                    updateRemoteCursor(message.userId, message.position, message.userName, message.userColor);
                    break;

                case 'initialState':
                    loadInitialState(message.notes, message.architecture, message.users);
                    break;

                case 'roomList':
                    // showRoomList(message.rooms);
                    // break;
                    console.log('Received room list:', message.rooms); // Debug
                    if (message.rooms && message.rooms.length > 0) {
                        showRoomList(message.rooms);
                    } else {
                        console.log('No active rooms received'); // Debug
                        showRoomList([]); // Show empty state
                    }
                    break;

                case 'error':
                    alert(`Error: ${message.message}`);
                    break;
            }
        } catch (err) {
            console.error("Error processing message:", err);
        }
    };

    socket.addEventListener('error', (error) => {
        console.error('WebSocket error:', error);
        document.getElementById('sessionsList').innerHTML = 
            '<div class="no-sessions">Connection failed</div>';
    });
    
}

function updateConnectionStatus(text, status) {
    const statusElement = document.getElementById('collabStatus');
    statusElement.textContent = text;
    statusElement.className = 'collab-status';
    if (status) {
        statusElement.classList.add(status);
    }
}

function handleRoomCreated(message) {
    currentRoomId = message.roomId;
    document.getElementById('roomIdInput').value = message.roomId;
    updateUserList(message.users);

    // Share existing notes with new room
    document.querySelectorAll('.note').forEach(note => {
        syncNoteToServer(note);
    });
}

function updateUserList(users) {
    currentUsers = users;
    const userList = document.getElementById('userList');
    userList.innerHTML = '';

    users.forEach(user => {
        const userEl = document.createElement('div');
        userEl.className = 'user-item';
        userEl.innerHTML = `
            <div class="user-color" style="background: ${user.color}"></div>
            <div>${user.name}</div>
        `;
        userList.appendChild(userEl);
    });
}

function syncNoteToServer(noteElement) {
    if (!socket || !currentRoomId) return;

    const noteData = {
        id: noteElement.id || generateNoteId(),
        title: noteElement.querySelector('.note-title').textContent,
        content: noteElement.querySelector('.note-content').textContent,
        position: {
            top: noteElement.style.top,
            left: noteElement.style.left
        }
    };

    noteElement.id = noteData.id;

    socket.send(JSON.stringify({
        type: 'noteUpdate',
        roomId: currentRoomId,
        data: noteData
    }));
}

function generateNoteId() {
    return 'note-' + Math.random().toString(36).substr(2, 8);
}

function updateNoteFromServer(noteData) {
    // Don't update if this is our own note
    if (document.activeElement === document.getElementById(noteData.id)) return;

    let note = document.getElementById(noteData.id);
    if (!note) {
        note = createNewNote();
        note.id = noteData.id;
        document.getElementById('whiteboard').appendChild(note);
    }

    note.querySelector('.note-title').textContent = noteData.title;
    note.querySelector('.note-content').textContent = noteData.content;
    note.style.top = noteData.position.top;
    note.style.left = noteData.position.left;
}

function updateArchitectureFromServer(architectureData) {
    // Implement architecture update logic
    console.log("Updating architecture from server:", architectureData);
}

function loadInitialState(notes, architecture, users) {
    // Clear existing notes (except predefined ones)
    document.querySelectorAll('.note').forEach(note => {
        if (!note.id || note.id.startsWith('note-')) {
            note.remove();
        }
    });

    // Add notes from server
    if (notes) {
        Object.values(notes).forEach(noteData => {
            updateNoteFromServer(noteData);
        });
    }

    // Update architecture
    if (architecture) {
        updateArchitectureFromServer(architecture);
    }

    // Update user list
    if (users) {
        updateUserList(users);
    }
}

// function showRoomList(rooms) {
//     const roomList = rooms.map(room => 
//         `<div class="room-item">
//             <strong>${room.id}</strong> (${room.userCount} user${room.userCount !== 1 ? 's' : ''})
//             <button onclick="window.joinRoom('${room.id}')">Join</button>
//         </div>`
//     ).join('');

//     const popup = document.createElement('div');
//     popup.className = 'room-list-popup';
//     popup.innerHTML = `
//         <div class="popup-header">
//             <h3>Active Sessions</h3>
//             <button class="close-popup">×</button>
//         </div>
//         <div class="room-list">
//             ${roomList || '<p>No active sessions found</p>'}
//         </div>
//     `;

//     popup.querySelector('.close-popup').addEventListener('click', () => {
//         popup.remove();
//     });

//     document.body.appendChild(popup);
// }

// function showRoomList(rooms) {
//     console.log('Displaying rooms:', rooms); // Debug

//     // Close any existing popup
//     const existingPopup = document.querySelector('.room-list-popup');
//     if (existingPopup) existingPopup.remove();

//     const roomListHTML = rooms.length > 0
//         ? rooms.map(room => `
//             <div class="room-item">
//                 <div class="room-info">
//                     <strong>${room.id}</strong>
//                     <span>${room.userCount} user${room.userCount !== 1 ? 's' : ''}</span>
//                     <small>Created ${new Date(room.createdAt).toLocaleTimeString()}</small>
//                 </div>
//                 <button onclick="window.joinRoom('${room.id}')">
//                     <i class="fas fa-sign-in-alt"></i> Join
//                 </button>
//             </div>
//         `).join('')
//         : `<div class="no-rooms">No active sessions found</div>`;

//     const popup = document.createElement('div');
//     popup.className = 'room-list-popup';
//     popup.innerHTML = `
//         <div class="popup-header">
//             <h3><i class="fas fa-users"></i> Active Sessions</h3>
//             <button class="close-popup">&times;</button>
//         </div>
//         <div class="room-list">${roomListHTML}</div>
//     `;

//     // Add close handler
//     popup.querySelector('.close-popup').addEventListener('click', () => {
//         popup.remove();
//     });

//     document.body.appendChild(popup);
// }

window.joinRoom = function (roomId) {
    document.getElementById('roomIdInput').value = roomId;
    document.querySelector('.room-list-popup')?.remove();
    joinCollaborationSession();
};

// Cursor Tracking
function setupCursorTracking() {
    const whiteboard = document.getElementById('whiteboard');

    whiteboard.addEventListener('mousemove', (e) => {
        if (!socket || !currentRoomId) return;

        const rect = whiteboard.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        socket.send(JSON.stringify({
            type: 'cursorMove',
            roomId: currentRoomId,
            userId: userId,
            position: { x, y },
            userName: currentUsers.find(u => u.id === userId)?.name || 'Anonymous',
            userColor: userColor
        }));
    });
}

function updateRemoteCursor(userId, position, userName, userColor) {
    if (userId === userId) return; // Don't show our own cursor

    let cursor = document.getElementById(`cursor-${userId}`);
    if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = `cursor-${userId}`;
        cursor.className = 'remote-cursor';
        cursor.style.backgroundColor = userColor;
        cursor.setAttribute('data-user', userName);
        document.getElementById('remoteCursors').appendChild(cursor);
    }

    cursor.style.left = position.x + 'px';
    cursor.style.top = position.y + 'px';
}

function removeUserCursor(userId) {
    const cursor = document.getElementById(`cursor-${userId}`);
    if (cursor) {
        cursor.remove();
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initCollaboration);

// Add to collaboration.js or main.js
function makeCollabPanelDraggable() {
    const container = document.getElementById('collabPanelContainer');
    let isDragging = false;
    let offsetX, offsetY;

    // Mouse down handler
    container.addEventListener('mousedown', (e) => {
        // Only start drag on header or empty space
        if (e.target.closest('.collab-header') || e.target === container) {
            isDragging = true;
            offsetX = e.clientX - container.getBoundingClientRect().left;
            offsetY = e.clientY - container.getBoundingClientRect().top;
            container.style.cursor = 'grabbing';
        }
    });

    // Mouse move handler
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const x = e.clientX - offsetX;
        const y = e.clientY - offsetY;
        
        // Boundary checking (optional)
        const maxX = window.innerWidth - container.offsetWidth;
        const maxY = window.innerHeight - container.offsetHeight;
        
        container.style.left = `${Math.min(Math.max(0, x), maxX)}px`;
        container.style.top = `${Math.min(Math.max(0, y), maxY)}px`;
    });

    // Mouse up handler
    document.addEventListener('mouseup', () => {
        isDragging = false;
        container.style.cursor = 'move';
    });

    // Touch support
    container.addEventListener('touchstart', (e) => {
        isDragging = true;
        const touch = e.touches[0];
        offsetX = touch.clientX - container.getBoundingClientRect().left;
        offsetY = touch.clientY - container.getBoundingClientRect().top;
    });

    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const touch = e.touches[0];
        const x = touch.clientX - offsetX;
        const y = touch.clientY - offsetY;
        
        container.style.left = `${x}px`;
        container.style.top = `${y}px`;
    });

    document.addEventListener('touchend', () => {
        isDragging = false;
    });
}

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', makeCollabPanelDraggable);

// Modify the mousedown handler
container.addEventListener('mousedown', (e) => {
    // Don't start drag if clicking on interactive elements
    const interactiveElements = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
    if (interactiveElements.includes(e.target.tagName)) {
        return;
    }
    
    // Only start drag on header or empty space
    if (e.target.closest('.collab-header') || e.target === container) {
        isDragging = true;
        offsetX = e.clientX - container.getBoundingClientRect().left;
        offsetY = e.clientY - container.getBoundingClientRect().top;
        container.style.cursor = 'grabbing';
    }
});

// Add to drag handlers
function savePanelPosition() {
    const container = document.getElementById('collabPanelContainer');
    localStorage.setItem('collabPanelPos', JSON.stringify({
        x: container.style.left,
        y: container.style.top
    }));
}

// Load saved position
function loadPanelPosition() {
    const savedPos = localStorage.getItem('collabPanelPos');
    if (savedPos) {
        const {x, y} = JSON.parse(savedPos);
        const container = document.getElementById('collabPanelContainer');
        container.style.left = x;
        container.style.top = y;
    }
}

// Call loadPanelPosition() when initializing
// Call savePanelPosition() when mouseup/touchend

// Add to mousedown/touchstart handlers
container.style.zIndex = 1001; // Higher than other elements
