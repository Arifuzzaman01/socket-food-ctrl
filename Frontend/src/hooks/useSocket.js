import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
export const useSocket = () => {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    socketRef.current = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
    });

    // socket connected event
    socketRef.current.on("connect", () => {
      setConnected(true);
      console.log("user connected with server:", socketRef.current.id);
    });
    // socket disconnect event
    socketRef.current.on("disconnect", () => {
      setConnected(false);
      console.log("disconnected form server");
    });
    socketRef.current.on("connected", (data) => {
      console.log("   Server says:", data.message);
    });
    // cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        console.log("socket disconnected");
      }
    };
  }, []);
  return {
    socket: socketRef.current,
    connected,
  };
};
