import { io, Socket } from 'socket.io-client';

const ROOM_SERVER_URL = 'http://localhost:3002'; // Default for local dev

let socket: Socket | null = null;
let currentRoom: string | null = null;

export function getSocket(boardId: string): Socket {
  // Create socket if it doesn't exist
  if (!socket) {
    socket = io(ROOM_SERVER_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
    });

    socket.on('connect', () => {
      if (socket) {
        console.log(`[Socket] Connected to excalidraw-room server.`);
      }
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from excalidraw-room server');
      currentRoom = null;
    });

    socket.on('connect_error', (error) => {
      console.error('Failed to connect to excalidraw-room server:', error);
    });
  }

  // Connect if not connected
  if (!socket.connected) {
    socket.connect();
  }

  // Join new room if different from current
  if (currentRoom !== boardId) {
    if (currentRoom) {
      socket.emit('leave-room', currentRoom);
    }
    socket.emit('join-room', boardId);
    currentRoom = boardId;
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    if (currentRoom) {
      socket.emit('leave-room', currentRoom);
      currentRoom = null;
    }
    socket.disconnect();
    socket = null;
  }
} 