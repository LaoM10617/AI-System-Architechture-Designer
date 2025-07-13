const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const activeRooms = new Map(); // Track all active rooms

wss.on('connection', (ws) => {
    console.log('New client connected');
    let currentRoom = null;
    let currentUser = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch(data.type) {
                case 'createRoom':
                    const roomId = generateRoomId();
                    currentRoom = roomId;
                    currentUser = data.user;
                    
                    activeRooms.set(roomId, {
                        users: [data.user],
                        createdAt: new Date(),
                        notes: {},
                        architecture: null
                    });
                    
                    console.log(`Room created: ${roomId} by ${data.user.name}`);
                    listRooms();
                    
                    ws.send(JSON.stringify({
                        type: 'roomCreated',
                        roomId,
                        users: [data.user]
                    }));
                    break;
                    
                case 'joinRoom':
                    if (activeRooms.has(data.roomId)) {
                        currentRoom = data.roomId;
                        currentUser = data.user;
                        const room = activeRooms.get(data.roomId);
                        
                        // Check if user already exists in room
                        if (!room.users.some(u => u.id === data.user.id)) {
                            room.users.push(data.user);
                        }
                        
                        // Notify all users in the room
                        broadcast(room.users, {
                            type: 'userJoined',
                            users: room.users
                        });
                        
                        // Send current state to new user
                        ws.send(JSON.stringify({
                            type: 'initialState',
                            notes: room.notes,
                            architecture: room.architecture,
                            users: room.users
                        }));
                        
                        console.log(`User ${data.user.name} joined room ${data.roomId}`);
                        listRooms();
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Room not found'
                        }));
                    }
                    break;
                    
                case 'noteUpdate':
                    if (currentRoom && activeRooms.has(currentRoom)) {
                        const room = activeRooms.get(currentRoom);
                        room.notes[data.data.id] = data.data;
                        
                        broadcast(room.users.filter(u => u.ws !== ws), {
                            type: 'noteUpdate',
                            data: data.data
                        });
                    }
                    break;
                    
                case 'architectureUpdate':
                    if (currentRoom && activeRooms.has(currentRoom)) {
                        const room = activeRooms.get(currentRoom);
                        room.architecture = data.data;
                        
                        broadcast(room.users.filter(u => u.ws !== ws), {
                            type: 'architectureUpdate',
                            data: data.data
                        });
                    }
                    break;
                    
                case 'cursorMove':
                    if (currentRoom && activeRooms.has(currentRoom)) {
                        const room = activeRooms.get(currentRoom);
                        
                        broadcast(room.users.filter(u => u.id !== data.userId), {
                            type: 'cursorMove',
                            userId: data.userId,
                            position: data.position,
                            userName: data.userName,
                            userColor: data.userColor
                        });
                    }
                    break;
                    
                case 'listRooms':
                    const rooms = Array.from(activeRooms.entries()).map(([id, room]) => ({
                        id,
                        userCount: room.users.length,
                        createdAt: room.createdAt
                    }));
                    
                    ws.send(JSON.stringify({
                        type: 'roomList',
                        rooms
                    }));
                    break;
            }
        } catch (err) {
            console.error('Error processing message:', err);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        if (currentRoom && activeRooms.has(currentRoom)) {
            const room = activeRooms.get(currentRoom);
            room.users = room.users.filter(u => u.id !== currentUser?.id);
            
            if (room.users.length === 0) {
                activeRooms.delete(currentRoom);
                console.log(`Room ${currentRoom} closed (no users)`);
            } else {
                broadcast(room.users, {
                    type: 'userLeft',
                    users: room.users
                });
                console.log(`User ${currentUser?.name} left room ${currentRoom}`);
            }
            listRooms();
        }
    });
    
    // Attach the WebSocket connection to the object for broadcasting
    ws.userId = currentUser?.id;
});

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8);
}

function broadcast(users, message) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && users.some(u => u.id === client.userId)) {
            client.send(JSON.stringify(message));
        }
    });
}

function listRooms() {
    console.log('\n=== Active Rooms ===');
    if (activeRooms.size === 0) {
        console.log('No active rooms');
        return;
    }
    
    activeRooms.forEach((room, id) => {
        console.log(`Room ID: ${id}`);
        console.log(`Created: ${room.createdAt.toLocaleTimeString()}`);
        console.log(`Users: ${room.users.map(u => u.name).join(', ')}`);
        console.log(`Notes: ${Object.keys(room.notes).length}`);
        console.log('------------------');
    });
}

// Command line interface
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('WebSocket server running on ws://localhost:8080');
console.log('Type "list" to see active rooms, "help" for commands');

rl.on('line', (input) => {
    if (input === 'list') {
        listRooms();
    } else if (input === 'help') {
        console.log('Available commands:');
        console.log('list - Show active rooms');
        console.log('help - Show this help');
        console.log('exit - Close server');
    } else if (input === 'exit') {
        wss.close();
        rl.close();
        process.exit();
    }
});