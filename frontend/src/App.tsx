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

  const [uptimeSeconds, setUptimeSeconds] = useState<number | null>(
    null
  );

  const [backendStatus, setBackendStatus] =
    useState<BackendStatus | null>(null);

  const [backendConnected, setBackendConnected] = useState(false);

  const [backendLoading, setBackendLoading] = useState(false);

  const [backendMagicValue, setBackendMagicValue] =
    useState<string | null>(null);

  const [backendMagicLoading, setBackendMagicLoading] =
    useState(false);

  const [backendMagicInput, setBackendMagicInput] = useState('');

  const [backendMagicSaved, setBackendMagicSaved] = useState(false);

  const [redisConnected, setRedisConnected] = useState(false);

  const [name, setName] = useState('');

  const [magicNumber, setMagicNumber] = useState('');

  const [foundMagicNumber, setFoundMagicNumber] =
    useState<string | null>(null);

  const [nameChecked, setNameChecked] = useState(false);

  const [saved, setSaved] = useState(false);

  const [checking, setChecking] = useState(false);

  const [saving, setSaving] = useState(false);

  /**
   * Load Kubernetes environment values.
   */
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/config', {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('Failed to load cluster config');
        }

        const data: ClusterConfig = await response.json();

        setClusterConfig(data);

        if (data.podStartTime) {
          const startTime = new Date(
            data.podStartTime
          ).getTime();

          const now = Date.now();

          setUptimeSeconds(
            Math.max(
              0,
              Math.floor((now - startTime) / 1000)
            )
          );
        }
      } catch (error) {
        console.error(
          'Failed to load cluster config:',
          error
        );

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
   */
  useEffect(() => {
    if (!clusterConfig.podStartTime) {
      return;
    }

    const updateUptime = () => {
      const startTime = new Date(
        clusterConfig.podStartTime!
      ).getTime();

      if (Number.isNaN(startTime)) {
        setUptimeSeconds(null);
        return;
      }

      const now = Date.now();

      setUptimeSeconds(
        Math.max(
          0,
          Math.floor((now - startTime) / 1000)
        )
      );
    };

    updateUptime();

    const interval = window.setInterval(
      updateUptime,
      1000
    );

    return () => {
      window.clearInterval(interval);
    };
  }, [clusterConfig.podStartTime]);

  /**
   * Format uptime as HH:MM:SS.
   */
  const formatUptime = (
    seconds: number | null
  ) => {
    if (seconds === null) {
      return 'Unavailable';
    }

    const hours = Math.floor(
      seconds / 3600
    );

    const minutes = Math.floor(
      (seconds % 3600) / 60
    );

    const remainingSeconds =
      seconds % 60;

    return [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      remainingSeconds.toString().padStart(2, '0'),
    ].join(':');
  };

  /**
   * Check Backend connectivity.
   */
  const checkBackendStatus = async () => {
    setBackendLoading(true);

    try {
      const response = await fetch(
        '/api/backend/status',
        {
          cache: 'no-store',
        }
      );

      if (!response.ok) {
        throw new Error(
          `Backend status request failed: ${response.status}`
        );
      }

      const data = await response.json();

      if (!data.connected || !data.data) {
        setBackendConnected(false);
        setBackendStatus(null);
        setBackendMagicValue(null);
        return;
      }

      setBackendConnected(true);
      setBackendStatus(data.data);
    } catch (error) {
      console.error(
        'Failed to connect to backend:',
        error
      );

      setBackendConnected(false);
      setBackendStatus(null);
      setBackendMagicValue(null);
    } finally {
      setBackendLoading(false);
    }
  };

  /**
   * Load the PostgreSQL magic value whenever
   * the Backend is connected and a name is selected.
   */
  useEffect(() => {
    const trimmedName = name.trim();

    if (!backendConnected || !trimmedName) {
      setBackendMagicValue(null);
      return;
    }

    const loadBackendMagicValue = async () => {
      setBackendMagicLoading(true);
      setBackendMagicSaved(false);

      try {
        const response = await fetch(
          `/api/backend/magic/${encodeURIComponent(
            trimmedName
          )}`,
          {
            cache: 'no-store',
          }
        );

        if (response.status === 404) {
          setBackendMagicValue(null);
          return;
        }

        if (!response.ok) {
          throw new Error(
            `Backend magic request failed: ${response.status}`
          );
        }

        const data = await response.json();

        console.log(
          'PostgreSQL magic value:',
          data
        );

        setBackendMagicValue(
          data.magicValue
        );
      } catch (error) {
        console.error(
          'Failed to load PostgreSQL magic value:',
          error
        );

        setBackendMagicValue(null);
      } finally {
        setBackendMagicLoading(false);
      }
    };

    loadBackendMagicValue();
  }, [backendConnected, name]);

  /**
   * Create or update the PostgreSQL magic value.
   */
  const updateBackendMagicValue =
    async () => {
      const trimmedName = name.trim();

      const trimmedMagicValue =
        backendMagicInput.trim();

      if (
        !trimmedName ||
        !trimmedMagicValue
      ) {
        return;
      }

      setBackendMagicLoading(true);
      setBackendMagicSaved(false);

      try {
        const response = await fetch(
          `/api/backend/magic/${encodeURIComponent(
            trimmedName
          )}`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              magicValue:
                trimmedMagicValue,
            }),
          }
        );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.detail ||
              'Failed to update backend magic value'
          );
        }

        setBackendMagicValue(
          data.magicValue
        );

        setBackendMagicInput('');

        setBackendMagicSaved(true);
      } catch (error) {
        console.error(
          'Failed to update backend magic value:',
          error
        );
      } finally {
        setBackendMagicLoading(false);
      }
    };

  /**
   * Check Redis connectivity.
   */
  useEffect(() => {
    const checkRedisStatus =
      async () => {
        try {
          const response =
            await fetch(
              '/api/session/status',
              {
                cache: 'no-store',
              }
            );

          if (!response.ok) {
            throw new Error(
              'Redis status request failed'
            );
          }

          const data =
            await response.json();

          setRedisConnected(
            data.connected === true
          );
        } catch {
          setRedisConnected(false);
        }
      };

    checkRedisStatus();
  }, []);

  /**
   * Check whether a name exists in Redis.
   */
  const checkName = async () => {
    const trimmedName =
      name.trim();

    if (!trimmedName) {
      return;
    }

    setChecking(true);
    setNameChecked(false);
    setFoundMagicNumber(null);
    setMagicNumber('');
    setSaved(false);

    try {
      const response =
        await fetch(
          `/api/session/${encodeURIComponent(
            trimmedName
          )}`,
          {
            cache: 'no-store',
          }
        );

      const data =
        await response.json();

      if (!data.connected) {
        setRedisConnected(false);
        return;
      }

      setRedisConnected(true);

      setNameChecked(true);

      if (data.found) {
        setFoundMagicNumber(
          data.magicNumber
        );
      }
    } catch {
      setRedisConnected(false);
    } finally {
      setChecking(false);
    }
  };

  /**
   * Save or update the Redis magic number.
   */
  const saveMagicNumber = async () => {
    const trimmedName =
      name.trim();

    const trimmedMagicNumber =
      magicNumber.trim();

    if (
      !trimmedName ||
      !trimmedMagicNumber
    ) {
      return;
    }

    setSaving(true);
    setSaved(false);

    try {
      const response =
        await fetch(
          `/api/session/${encodeURIComponent(
            trimmedName
          )}`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              magicNumber:
                trimmedMagicNumber,
            }),
          }
        );

      const data =
        await response.json();

      if (!data.connected) {
        setRedisConnected(false);
        return;
      }

      if (data.saved) {
        setRedisConnected(true);
        setSaved(true);

        setFoundMagicNumber(
          data.magicNumber
        );

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
          <p>
            Kubernetes Environment Dashboard
          </p>
        </div>

        <span className="status">
          ● Demo
        </span>
      </header>

      <main className="dashboard">
        {/* Kubernetes information */}

        <div className="card">
          <span>Pod Uptime</span>
          <strong>
            {formatUptime(
              uptimeSeconds
            )}
          </strong>
        </div>

        <div className="card">
          <span>Pod IP</span>
          <strong>
            {clusterConfig.podIp}
          </strong>
        </div>

        <div className="card">
          <span>Namespace</span>
          <strong>
            {clusterConfig.namespace}
          </strong>
        </div>

        <div className="card">
          <span>Application</span>
          <strong>
            {clusterConfig.appName}
          </strong>
        </div>

        <div className="card">
          <span>Pod</span>
          <strong>
            {clusterConfig.podName}
          </strong>
        </div>

        <div className="card">
          <span>Node</span>
          <strong>
            {clusterConfig.nodeName}
          </strong>
        </div>

        <div className="card">
          <span>Restart Count</span>
          <strong>
            {clusterConfig.restartCount}
          </strong>
        </div>

        {/* Redis */}

        <div className="card redis-card">
          <span>Redis</span>

          {!redisConnected ? (
            <strong>
              Not connected
            </strong>
          ) : (
            <>
              <strong>
                Connected
              </strong>

              <div className="redis-form">
                <div className="input-row">
                  <input
                    type="text"
                    placeholder="Enter name"
                    value={name}
                    onChange={(event) => {
                      setName(
                        event.target.value
                      );

                      setNameChecked(
                        false
                      );

                      setFoundMagicNumber(
                        null
                      );

                      setMagicNumber(
                        ''
                      );

                      setSaved(false);

                      /*
                       * Clear the old PostgreSQL
                       * value when the name changes.
                       */
                      setBackendMagicValue(
                        null
                      );

                      setBackendMagicInput(
                        ''
                      );

                      setBackendMagicSaved(
                        false
                      );
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key ===
                        'Enter'
                      ) {
                        checkName();
                      }
                    }}
                  />

                  <button
                    type="button"
                    onClick={
                      checkName
                    }
                    disabled={
                      !name.trim() ||
                      checking
                    }
                  >
                    {checking
                      ? 'Checking...'
                      : '✓'}
                  </button>
                </div>

                {nameChecked &&
                  foundMagicNumber !==
                    null && (
                    <>
                      <p className="redis-message">
                        Your magic number is:{' '}
                        <strong>
                          {
                            foundMagicNumber
                          }
                        </strong>
                      </p>

                      <div className="magic-number-form">
                        <input
                          type="number"
                          placeholder="Enter new magic number"
                          value={
                            magicNumber
                          }
                          onChange={(
                            event
                          ) =>
                            setMagicNumber(
                              event
                                .target
                                .value
                            )
                          }
                          onKeyDown={(
                            event
                          ) => {
                            if (
                              event.key ===
                              'Enter'
                            ) {
                              saveMagicNumber();
                            }
                          }}
                        />

                        <button
                          type="button"
                          onClick={
                            saveMagicNumber
                          }
                          disabled={
                            !magicNumber.trim() ||
                            saving
                          }
                        >
                          {saving
                            ? 'Updating...'
                            : 'Update'}
                        </button>
                      </div>
                    </>
                  )}

                {nameChecked &&
                  foundMagicNumber ===
                    null &&
                  !saved && (
                    <div className="magic-number-form">
                      <input
                        type="number"
                        placeholder="Enter magic number"
                        value={
                          magicNumber
                        }
                        onChange={(
                          event
                        ) =>
                          setMagicNumber(
                            event
                              .target
                              .value
                          )
                        }
                        onKeyDown={(
                          event
                        ) => {
                          if (
                            event.key ===
                            'Enter'
                          ) {
                            saveMagicNumber();
                          }
                        }}
                      />

                      <button
                        type="button"
                        onClick={
                          saveMagicNumber
                        }
                        disabled={
                          !magicNumber.trim() ||
                          saving
                        }
                      >
                        {saving
                          ? 'Saving...'
                          : 'Send'}
                      </button>
                    </div>
                  )}

                {saved && (
                  <p className="redis-success">
                    ✓ Magic number
                    updated successfully
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Backend */}

        <div className="card backend-card">
          <div className="backend-header">
            <span>Backend</span>

            <button
              type="button"
              onClick={
                checkBackendStatus
              }
              disabled={
                backendLoading
              }
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
            <strong>
              Backend not found
            </strong>
          ) : (
            <div className="backend-info-grid">
              <div className="info-item">
                <span>Pod IP</span>
                <strong>
                  {backendStatus?.podIp ??
                    'Unavailable'}
                </strong>
              </div>

              <div className="info-item">
                <span>Namespace</span>
                <strong>
                  {backendStatus?.namespace ??
                    'Unavailable'}
                </strong>
              </div>

              <div className="info-item">
                <span>Application</span>
                <strong>
                  {backendStatus?.appName ??
                    'Unavailable'}
                </strong>
              </div>

              <div className="info-item">
                <span>Pod</span>
                <strong>
                  {backendStatus?.podName ??
                    'Unavailable'}
                </strong>
              </div>

              <div className="info-item">
                <span>Node</span>
                <strong>
                  {backendStatus?.nodeName ??
                    'Unavailable'}
                </strong>
              </div>

              <div className="info-item">
                <span>Restart Count</span>
                <strong>
                  {backendStatus?.restartCount ??
                    0}
                </strong>
              </div>

              <div className="info-item">
                <span>
                  Pod Start Time
                </span>

                <strong>
                  {backendStatus?.podStartTime ??
                    'Unavailable'}
                </strong>
              </div>
            </div>
          )}

          {/* PostgreSQL */}

          {backendConnected &&
            name.trim() && (
              <div className="backend-magic-section">
                <span>
                  PostgreSQL
                </span>

                {backendMagicLoading ? (
                  <strong>
                    Loading...
                  </strong>
                ) : backendMagicValue !==
                  null ? (
                  <>
                    <p className="backend-magic-message">
                      Real magic value:{' '}
                      <strong>
                        {
                          backendMagicValue
                        }
                      </strong>
                    </p>

                    <div className="magic-number-form">
                      <input
                        type="number"
                        placeholder="Enter new real magic value"
                        value={
                          backendMagicInput
                        }
                        onChange={(
                          event
                        ) =>
                          setBackendMagicInput(
                            event
                              .target
                              .value
                          )
                        }
                        onKeyDown={(
                          event
                        ) => {
                          if (
                            event.key ===
                            'Enter'
                          ) {
                            updateBackendMagicValue();
                          }
                        }}
                      />

                      <button
                        type="button"
                        onClick={
                          updateBackendMagicValue
                        }
                        disabled={
                          !backendMagicInput.trim() ||
                          backendMagicLoading
                        }
                      >
                        {backendMagicLoading
                          ? 'Updating...'
                          : 'Update'}
                      </button>
                    </div>

                    {backendMagicSaved && (
                      <p className="backend-magic-success">
                        ✓ Real magic
                        value updated
                        successfully
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="backend-magic-message">
                      No real magic value
                      found for{' '}
                      <strong>
                        {name.trim()}
                      </strong>
                    </p>

                    <div className="magic-number-form">
                      <input
                        type="number"
                        placeholder="Enter real magic value"
                        value={
                          backendMagicInput
                        }
                        onChange={(
                          event
                        ) =>
                          setBackendMagicInput(
                            event
                              .target
                              .value
                          )
                        }
                        onKeyDown={(
                          event
                        ) => {
                          if (
                            event.key ===
                            'Enter'
                          ) {
                            updateBackendMagicValue();
                          }
                        }}
                      />

                      <button
                        type="button"
                        onClick={
                          updateBackendMagicValue
                        }
                        disabled={
                          !backendMagicInput.trim() ||
                          backendMagicLoading
                        }
                      >
                        {backendMagicLoading
                          ? 'Saving...'
                          : 'Save'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
        </div>
      </main>
    </div>
  );
}

export default App;