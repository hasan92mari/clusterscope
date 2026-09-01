import { useEffect, useState } from 'react';
import './App.css';

interface ClusterConfig {
  podIp: string;
  namespace: string;
  appName: string;
  podName: string;
  nodeName: string;
  podStartTime: string | null;
  restartCount: number;
}

/**
 * Calculate the number of seconds the Pod has already been running.
 */
function getInitialUptime(startTime: string | null): number {
  if (!startTime) {
    return 0;
  }

  const start = new Date(startTime).getTime();

  if (Number.isNaN(start)) {
    return 0;
  }

  return Math.max(0, Math.floor((Date.now() - start) / 1000));
}

/**
 * Convert seconds to HH:MM:SS.
 */
function formatUptime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ].join(':');
}

function App() {
  const [clusterConfig, setClusterConfig] = useState<ClusterConfig>({
    podIp: 'Loading...',
    namespace: 'Loading...',
    appName: 'Loading...',
    podName: 'Loading...',
    nodeName: 'Loading...',
    podStartTime: null,
    restartCount: 0,
  });

  const [uptimeSeconds, setUptimeSeconds] = useState(0);

  const [redisConnected, setRedisConnected] = useState(false);
  const [name, setName] = useState('');
  const [magicNumber, setMagicNumber] = useState('');
  const [foundMagicNumber, setFoundMagicNumber] = useState<string | null>(
    null
  );
  const [nameChecked, setNameChecked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * Load Kubernetes information from the backend.
   */
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/config');

        if (!response.ok) {
          throw new Error('Failed to load cluster config');
        }

        const data: ClusterConfig = await response.json();

        setClusterConfig(data);

        /**
         * podStartTime comes from the Kubernetes API.
         *
         * We calculate the current uptime once when the
         * configuration is loaded.
         */
        setUptimeSeconds(getInitialUptime(data.podStartTime));
      } catch (error) {
        console.error('Failed to load cluster config:', error);

        setClusterConfig({
          podIp: 'Unavailable',
          namespace: 'Unavailable',
          appName: 'Unavailable',
          podName: 'Unavailable',
          nodeName: 'Unavailable',
          podStartTime: null,
          restartCount: 0,
        });

        setUptimeSeconds(0);
      }
    };

    loadConfig();
  }, []);

  /**
   * Pod uptime counter.
   *
   * The initial value comes from Kubernetes podStartTime.
   * After that, the browser increments the counter every second.
   */
  useEffect(() => {
    if (!clusterConfig.podStartTime) {
      return;
    }

    const interval = window.setInterval(() => {
      setUptimeSeconds((previous) => previous + 1);
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [clusterConfig.podStartTime]);

  /**
   * Check Redis connectivity.
   */
  useEffect(() => {
    const checkRedisStatus = async () => {
      try {
        const response = await fetch('/api/session/status');

        if (!response.ok) {
          throw new Error('Redis status request failed');
        }

        const data = await response.json();

        setRedisConnected(data.connected === true);
      } catch {
        setRedisConnected(false);
      }
    };

    checkRedisStatus();
  }, []);

  /**
   * Check whether a name already exists in Redis.
   */
  const checkName = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    setChecking(true);
    setNameChecked(false);
    setFoundMagicNumber(null);
    setMagicNumber('');
    setSaved(false);

    try {
      const response = await fetch(
        `/api/session/${encodeURIComponent(trimmedName)}`
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

  /**
   * Save a new magic number or update an existing one.
   */
  const saveMagicNumber = async () => {
    const trimmedName = name.trim();
    const trimmedMagicNumber = magicNumber.trim();

    if (!trimmedName || !trimmedMagicNumber) {
      return;
    }

    setSaving(true);
    setSaved(false);

    try {
      const response = await fetch(
        `/api/session/${encodeURIComponent(trimmedName)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            magicNumber: trimmedMagicNumber,
          }),
        }
      );

      const data = await response.json();

      if (!data.connected) {
        setRedisConnected(false);
        return;
      }

      if (data.saved) {
        setRedisConnected(true);
        setSaved(true);
        setFoundMagicNumber(data.magicNumber);
        setMagicNumber('');
      }
    } catch {
      setRedisConnected(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>ClusterScope</h1>
          <p>Kubernetes Environment Dashboard</p>
        </div>

        <span className="status">
          Pod Uptime: {formatUptime(uptimeSeconds)}
        </span>
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
          <span>Restart Count</span>
          <strong>{clusterConfig.restartCount}</strong>
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
                      setMagicNumber('');
                      setSaved(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        checkName();
                      }
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
                  <>
                    <p className="redis-message">
                      Your magic number is:{' '}
                      <strong>{foundMagicNumber}</strong>
                    </p>

                    <div className="magic-number-form">
                      <input
                        type="number"
                        placeholder="Enter new magic number"
                        value={magicNumber}
                        onChange={(event) =>
                          setMagicNumber(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            saveMagicNumber();
                          }
                        }}
                      />

                      <button
                        type="button"
                        onClick={saveMagicNumber}
                        disabled={!magicNumber.trim() || saving}
                      >
                        {saving ? 'Updating...' : 'Update'}
                      </button>
                    </div>
                  </>
                )}

                {nameChecked && foundMagicNumber === null && !saved && (
                  <div className="magic-number-form">
                    <input
                      type="number"
                      placeholder="Enter magic number"
                      value={magicNumber}
                      onChange={(event) => setMagicNumber(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          saveMagicNumber();
                        }
                      }}
                    />

                    <button
                      type="button"
                      onClick={saveMagicNumber}
                      disabled={!magicNumber.trim() || saving}
                    >
                      {saving ? 'Saving...' : 'Send'}
                    </button>
                  </div>
                )}

                {saved && (
                  <p className="redis-success">
                    ✓ Magic number updated successfully
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