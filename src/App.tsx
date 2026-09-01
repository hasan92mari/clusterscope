import { useEffect, useState } from 'react';
import './App.css';
import { clusterConfig } from './config';

function App() {
  const [redisConnected, setRedisConnected] = useState(false);
  const [name, setName] = useState('');
  const [magicNumber, setMagicNumber] = useState('');
  const [foundMagicNumber, setFoundMagicNumber] = useState<string | null>(null);
  const [nameChecked, setNameChecked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const checkRedisStatus = async () => {
      try {
        const response = await fetch('/api/session/status');
        const data = await response.json();

        setRedisConnected(data.connected === true);
      } catch {
        setRedisConnected(false);
      }
    };

    checkRedisStatus();
  }, []);

  const checkName = async () => {
    if (!name.trim()) {
      return;
    }

    setChecking(true);
    setNameChecked(false);
    setFoundMagicNumber(null);
    setSaved(false);

    try {
      const response = await fetch(
        `/api/session/${encodeURIComponent(name.trim())}`
      );

      const data = await response.json();

      if (!data.connected) {
        setRedisConnected(false);
        return;
      }

      setRedisConnected(true);
      setNameChecked(true);

      if (data.found) {
        setFoundMagicNumber(data.magicNumber);
      }
    } catch {
      setRedisConnected(false);
    } finally {
      setChecking(false);
    }
  };

  const saveMagicNumber = async () => {
    if (!name.trim() || !magicNumber.trim()) {
      return;
    }

    try {
      const response = await fetch(
        `/api/session/${encodeURIComponent(name.trim())}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            magicNumber: magicNumber.trim(),
          }),
        }
      );

      const data = await response.json();

      if (data.saved) {
        setSaved(true);
        setFoundMagicNumber(magicNumber.trim());
        setMagicNumber('');
      }
    } catch {
      setRedisConnected(false);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>ClusterScope</h1>
          <p>Kubernetes Environment Dashboard</p>
        </div>

        <span className="status">● Demo</span>
      </header>

      <main className="dashboard">
        <div className="card">
          <span>Pod IP</span>
          <strong>{clusterConfig.podIp}</strong>
        </div>

        <div className="card">
          <span>Namespace</span>
          <strong>{clusterConfig.namespace}</strong>
        </div>

        <div className="card">
          <span>Application</span>
          <strong>{clusterConfig.appName}</strong>
        </div>

        <div className="card">
          <span>Pod</span>
          <strong>{clusterConfig.podName}</strong>
        </div>

        <div className="card">
          <span>Node</span>
          <strong>{clusterConfig.nodeName}</strong>
        </div>

        <div className="card">
          <span>Pod Status</span>
          <strong>Running</strong>
        </div>

        <div className="card redis-card">
          <span>Redis</span>

          {!redisConnected ? (
            <strong>Not connected</strong>
          ) : (
            <>
              <strong>Connected</strong>

              <div className="redis-form">
                <div className="input-row">
                  <input
                    type="text"
                    placeholder="Enter name"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setNameChecked(false);
                      setFoundMagicNumber(null);
                      setSaved(false);
                    }}
                  />

                  <button
                    type="button"
                    onClick={checkName}
                    disabled={!name.trim() || checking}
                  >
                    {checking ? 'Checking...' : '✓'}
                  </button>
                </div>

                {nameChecked && foundMagicNumber !== null && (
                  <p className="redis-message">
                    Your magic number is: <strong>{foundMagicNumber}</strong>
                  </p>
                )}

                {nameChecked && foundMagicNumber === null && !saved && (
                  <div className="magic-number-form">
                    <input
                      type="number"
                      placeholder="Enter magic number"
                      value={magicNumber}
                      onChange={(event) => setMagicNumber(event.target.value)}
                    />

                    <button
                      type="button"
                      onClick={saveMagicNumber}
                      disabled={!magicNumber.trim()}
                    >
                      Send
                    </button>
                  </div>
                )}

                {saved && (
                  <p className="redis-success">
                    ✓ Magic number saved successfully
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;