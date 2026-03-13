import React, { useState, useEffect } from 'react';
import Connection from './components/Connection';
import PillarControl from './components/PillarControl';
import './index.css';

function App() {
  const [connectionKey, setConnectionKey] = useState(null);
  const [intensity, setIntensity] = useState(0); // 0-100 scale

  const handleConnected = (key) => {
    setConnectionKey(key);
  };

  const handleDisconnect = () => {
    setConnectionKey(null);
    setIntensity(0);
  };

  // Color mapping: 
  // Intensity 0 => Hue 200 (Deep Blue/Teal)
  // Intensity 50 => Hue 85 (Yellow/Green)
  // Intensity 100 => Hue -30 / 330 (Deep Red/Magenta)
  useEffect(() => {
    const hue = 200 - (intensity * 2.3);
    document.body.style.backgroundColor = `hsl(${hue}, 80%, 12%)`;
    document.body.style.transition = 'background-color 0.5s ease';
  }, [intensity]);

  return (
    <div className="app-container">
      {!connectionKey ? (
        <Connection onConnected={handleConnected} />
      ) : (
        <PillarControl
          connectionKey={connectionKey}
          onDisconnect={handleDisconnect}
          onIntensityChange={setIntensity}
        />
      )}
    </div>
  );
}

export default App;
