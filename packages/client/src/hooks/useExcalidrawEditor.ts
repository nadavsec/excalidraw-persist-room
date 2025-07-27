import { useState, useCallback, useEffect, useRef } from 'react';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { ElementService } from '../services/elementService';
import Utils from '../utils';
import logger from '../utils/logger';
import { getSocket, disconnectSocket } from '../utils/socket';

const debouncedSave = Utils.debounce((boardId: string, elements: ExcalidrawElement[]) => {
  if (boardId && elements) {
    ElementService.replaceAllElements(boardId, elements).catch(error =>
      logger.error('Error saving elements:', error, true)
    );
  }
}, 500);

export const useExcalidrawEditor = (boardId: string | undefined) => {
  const [elements, setElements] = useState<ExcalidrawElement[]>([]);
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const isReceivingRemoteUpdate = useRef(false);
  const currentSocket = useRef<any>(null);

  // --- SOCKET.IO COLLAB LOGIC ---
  useEffect(() => {
    if (!boardId || !excalidrawAPI) { // Wait for API to be ready
      if (currentSocket.current) {
        currentSocket.current.off('client-broadcast');
        // Don't disconnect immediately in case of React Strict Mode remounting
        setTimeout(() => {
          if (currentSocket.current) {
            disconnectSocket();
            currentSocket.current = null;
          }
        }, 100);
      }
      return;
    }

    try {
      const socket = getSocket(boardId);
      currentSocket.current = socket;

      const handleRemoteUpdate = (encryptedData: ArrayBuffer, _iv: Uint8Array) => {
        try {
          const jsonString = new TextDecoder().decode(encryptedData);
          const remoteElements = JSON.parse(jsonString);

          // Get current elements from the scene
          const currentElements = excalidrawAPI.getSceneElements();

          // ONLY update if the received elements are different from the current scene
          // This prevents infinite loops and unnecessary re-renders.
          if (JSON.stringify(remoteElements) !== JSON.stringify(currentElements)) {
            // Use the Excalidraw API to update the scene
            isReceivingRemoteUpdate.current = true;
            excalidrawAPI.updateScene({ elements: remoteElements });

            // We still update our own state to be in sync
            setElements(remoteElements);

            // Reset flag after a brief delay
            setTimeout(() => {
              isReceivingRemoteUpdate.current = false;
            }, 50); // Reduced delay
          }
        } catch (e) {
          logger.error('Failed to parse remote elements:', e, true);
        }
      };

      // Clean up previous listeners
      socket.off('client-broadcast');
      
      // Add new listener
      socket.on('client-broadcast', handleRemoteUpdate);

      // Cleanup function - but don't disconnect immediately due to React Strict Mode
      return () => {
        socket.off('client-broadcast');
        // Don't disconnect socket immediately - let it stay connected for potential remount
      };
    } catch (e) {
      logger.error('Failed to setup socket connection:', e, true);
    }
  }, [boardId, excalidrawAPI]); // Add excalidrawAPI to dependencies
  // --- END SOCKET.IO COLLAB LOGIC ---

  const handleChange = useCallback(
    (excalidrawElements: readonly ExcalidrawElement[]) => {
      // Don't process changes if we're receiving a remote update
      if (isReceivingRemoteUpdate.current) {
        return;
      }

      const elementsArray = [...excalidrawElements];
      setElements(elementsArray);

      if (boardId) {
        debouncedSave(boardId, elementsArray);
        
        // --- SOCKET.IO COLLAB LOGIC ---
        try {
          if (currentSocket.current && !isReceivingRemoteUpdate.current) {
            const jsonString = JSON.stringify(elementsArray);
            const data = new TextEncoder().encode(jsonString);
            const iv = new Uint8Array(); // Empty for local dev
            currentSocket.current.emit('server-broadcast', boardId, data, iv);
          }
        } catch (e) {
          logger.error('Failed to emit socket update:', e, true);
        }
        // --- END SOCKET.IO COLLAB LOGIC ---
      }
    },
    [boardId]
  );

  return {
    elements,
    setElements,
    excalidrawAPI,
    setExcalidrawAPI,
    handleChange,
  };
};
