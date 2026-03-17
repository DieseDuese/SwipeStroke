import React, { useState, useEffect, useRef } from 'react';
import Connection from './components/Connection';
import PillarControl from './components/PillarControl';
import { checkConnection } from './api/handy';
import './index.css';

function App() {
  const [connectionKey, setConnectionKey] = useState(null);
  const [intensity, setIntensity] = useState(0); // 0-100 scale
  const [connectionLost, setConnectionLost] = useState(false);

  const handleConnected = (key) => {
    setConnectionKey(key);
    setConnectionLost(false);
  };

  const handleDisconnect = () => {
    setConnectionKey(null);
    setIntensity(0);
    setConnectionLost(false);
  };

  useEffect(() => {
    let intervalId;
    if (connectionKey && !connectionLost) {
      // Poll very frequently (every 2.5 seconds) to catch physical unplugs instantly
      intervalId = setInterval(async () => {
        // Cache-busting parameter added in api/handy.js
        const isConnected = await checkConnection(connectionKey);
        if (!isConnected) {
          setConnectionLost(true);
        }
      }, 2500);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [connectionKey, connectionLost]);

    // Removed the dynamic background color change to keep it elegant and static dark.

  return (
    <div className="app-container">
      {!connectionKey ? (
        <Connection onConnected={handleConnected} />
      ) : (
        <PillarControl
          connectionKey={connectionKey}
          onDisconnect={handleDisconnect}
          onIntensityChange={setIntensity}
          connectionLost={connectionLost}
        />
      )}
    </div>
  );
}

export default App;
