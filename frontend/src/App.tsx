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

interface BackendStatus {
  podIp: string | null;
  namespace: string | null;
  appName: string | null;
  podName: string | null;
  nodeName: string | null;
  podStartTime: string | null;
  restartCount: number;
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

  const [uptimeSeconds, setUptimeSeconds] = useState<number | null>(null);

  const [backendStatus, setBackendStatus] =
  useState<BackendStatus | null>(null);

  const [backendConnected, setBackendConnected] =
  useState(false);

  const [backendLoading, setBackendLoading] =
  useState(false);

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
   * Load Kubernetes environment values from the backend.
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

        if (data.podStartTime) {
          const startTime = new Date(data.podStartTime).getTime();
          const now = Date.now();

          setUptimeSeconds(
            Math.max(0, Math.floor((now - startTime) / 1000))
          );
        }
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

        setUptimeSeconds(null);
      }
    };

    loadConfig();
  }, []);

  /**
   * Keep Pod uptime counter running every second.
   *
   * The counter is calculated from the Kubernetes Pod start time,
   * rather than simply incrementing from zero when the browser loads.
   */
  useEffect(() => {
    if (!clusterConfig.podStartTime) {
      return;
    }

    const updateUptime = () => {
      const startTime = new Date(clusterConfig.podStartTime!).getTime();

      if (Number.isNaN(startTime)) {
        setUptimeSeconds(null);
        return;
      }

      const now = Date.now();

      setUptimeSeconds(
        Math.max(0, Math.floor((now - startTime) / 1000))
      );
    };

    updateUptime();

    const interval = window.setInterval(updateUptime, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [clusterConfig.podStartTime]);

  /**
   * Format uptime seconds as HH:MM:SS.
   */
  const formatUptime = (seconds: number | null) => {
    if (seconds === null) {
      return 'Unavailable';
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    return [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      remainingSeconds.toString().padStart(2, '0'),
    ].join(':');
  };


  /**
   * Check backend connectivity and load backend information.
   */
  const checkBackendStatus = async () => {
    setBackendLoading(true);

    try {
      const response = await fetch('/api/backend/status', {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Backend status request failed');
      }

      const data = await response.json();

      if (!data.connected || !data.data) {
        setBackendConnected(false);
        setBackendStatus(null);
        return;
      }

      setBackendConnected(true);
      setBackendStatus(data.data);
    } catch (error) {
      console.error('Failed to connect to backend:', error);

      setBackendConnected(false);
      setBackendStatus(null);
    } finally {
      setBackendLoading(false);
    }
  };

  
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

        <span className="status">● Demo</span>
      </header>

      <main className="dashboard">
        <div className="card">
          <span>Pod Uptime</span>
          <strong>{formatUptime(uptimeSeconds)}</strong>
        </div>

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
        <div className="card backend-card">
          <div className="backend-header">
            <span>Backend</span>

            <button
              type="button"
              onClick={checkBackendStatus}
              disabled={backendLoading}
            >
              {backendLoading
                ? backendConnected
                  ? 'Refreshing...'
                  : 'Connecting...'
                : backendConnected
                  ? 'Refresh'
                  : 'Connect'}
            </button>
          </div>

          {!backendConnected ? (
            <strong>Backend not found</strong>
          ) : (
            <div className="backend-info-grid">
              <div className="info-item">
                <span>Pod IP</span>
                <strong>{backendStatus?.podIp ?? 'Unavailable'}</strong>
              </div>

              <div className="info-item">
                <span>Namespace</span>
                <strong>{backendStatus?.namespace ?? 'Unavailable'}</strong>
              </div>

              <div className="info-item">
                <span>Application</span>
                <strong>{backendStatus?.appName ?? 'Unavailable'}</strong>
              </div>

              <div className="info-item">
                <span>Pod</span>
                <strong>{backendStatus?.podName ?? 'Unavailable'}</strong>
              </div>

              <div className="info-item">
                <span>Node</span>
                <strong>{backendStatus?.nodeName ?? 'Unavailable'}</strong>
              </div>

              <div className="info-item">
                <span>Restart Count</span>
                <strong>{backendStatus?.restartCount ?? 0}</strong>
              </div>

              <div className="info-item">
                <span>Pod Start Time</span>
                <strong>
                  {backendStatus?.podStartTime ?? 'Unavailable'}
                </strong>
              </div>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}

export default App;