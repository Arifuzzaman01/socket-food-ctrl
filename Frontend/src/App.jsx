import { useSocket } from "./hooks/useSocket";

function App() {
  const { socket, connected } = useSocket();
  return (
    <>
      <div>
        <h3>
          {`This div connected for socket io testing ${connected ? "and connected" : "but not connected"}`}
        </h3>
        <h3>{`Socket ID: ${socket?.id || "Not connected"}`}</h3>
      </div>
    </>
  );
}

export default App;
