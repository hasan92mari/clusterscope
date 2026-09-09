import { useEffect, useState } from 'react';
import './App.css';
import { formatUptime } from './utils/formatUptime';

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

type Language = 'en' | 'de' | 'ar';

const translations = {
  en: {
    subtitle: 'Kubernetes Environment Dashboard', greeting: 'Hello', greetingEmpty: 'Welcome to your cluster dashboard',
    nameLabel: 'Your name', language: 'Language', theme: 'Dark mode', demo: 'Demo',
    uptime: 'Pod Uptime', podIp: 'Pod IP', namespace: 'Namespace', application: 'Application', pod: 'Pod', node: 'Node', restarts: 'Restart Count',
  },
  de: {
    subtitle: 'Kubernetes-Umgebungsübersicht', greeting: 'Hallo', greetingEmpty: 'Willkommen zu deiner Cluster-Übersicht',
    nameLabel: 'Dein Name', language: 'Sprache', theme: 'Dunkler Modus', demo: 'Demo',
    uptime: 'Pod-Laufzeit', podIp: 'Pod-IP', namespace: 'Namespace', application: 'Anwendung', pod: 'Pod', node: 'Knoten', restarts: 'Neustarts',
  },
  ar: {
    subtitle: 'لوحة معلومات بيئة كوبرنيتس', greeting: 'مرحباً', greetingEmpty: 'أهلاً بك في لوحة معلومات الكلاستر',
    nameLabel: 'اسمك', language: 'اللغة', theme: 'الوضع الداكن', demo: 'تجريبي',
    uptime: 'مدة عمل Pod', podIp: 'عنوان Pod', namespace: 'مساحة الأسماء', application: 'التطبيق', pod: 'Pod', node: 'العقدة', restarts: 'عدد إعادة التشغيل',
  },
} as const;

function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [darkMode, setDarkMode] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
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

  const t = translations[language];

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  /**
   * The browser sends its HttpOnly cookie automatically. The selected
   * frontend Pod then reads the preferences from shared Redis.
   */
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const response = await fetch('/api/preferences', {
          cache: 'no-store',
          credentials: 'same-origin',
        });

        if (!response.ok) {
          throw new Error('Failed to load preferences');
        }

        const data: {
          name?: unknown;
          language?: unknown;
          theme?: unknown;
        } = await response.json();

        if (typeof data.name === 'string') {
          setName(data.name);
        }

        if (data.language === 'en' || data.language === 'de' || data.language === 'ar') {
          setLanguage(data.language);
        }

        setDarkMode(data.theme === 'dark');
      } catch (error) {
        console.error('Failed to load Redis preferences:', error);
      } finally {
        setPreferencesReady(true);
      }
    };

    loadPreferences();
  }, []);

  /** Persist profile preferences in the shared, expiring Redis session. */
  useEffect(() => {
    if (!preferencesReady) {
      return;
    }

    const savePreferences = async () => {
      try {
        await fetch('/api/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            name: name.trim(),
            language,
            theme: darkMode ? 'dark' : 'light',
          }),
        });
      } catch (error) {
        console.error('Failed to save Redis preferences:', error);
      }
    };

    savePreferences();
  }, [darkMode, language, name, preferencesReady]);

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
      return;
    }

    const loadBackendMagicValue = async () => {
      setBackendMagicLoading(true);
      setBackendMagicSaved(false);

      try {
        const response = await fetch(
          `/api/backend/magic/${encodeURIComponent(trimmedName)}`,
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

        setBackendMagicValue(data.magicValue);
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

  const handleNameChange = (value: string) => {
    setName(value);
    setBackendMagicValue(null);
    setBackendMagicInput('');
    setBackendMagicSaved(false);
  };

  return (
    <div className={`app ${darkMode ? 'dark' : ''}`}>
      <header className="header">
        <div>
          <h1>ClusterScope</h1>
          <p>
            {t.subtitle}
          </p>
        </div>

        <div className="header-controls">
          <label className="control-label" htmlFor="language-select">
            {t.language}
            <select
              id="language-select"
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
            >
              <option value="en">English</option>
              <option value="de">Deutsch</option>
              <option value="ar">العربية</option>
            </select>
          </label>
          <button
            className="theme-button"
            type="button"
            onClick={() => setDarkMode((current) => !current)}
            aria-pressed={darkMode}
          >
            {darkMode ? '☀' : '☾'} {t.theme}
          </button>
          <span className="status">● {t.demo}</span>
        </div>
      </header>

      <main className="dashboard">
        <section className="welcome-card">
          <div>
            <span>{t.nameLabel}</span>
            <strong>
              {name.trim()
                ? `${t.greeting}, ${name.trim()}!`
                : t.greetingEmpty}
            </strong>
          </div>
          <p>
            {language === 'ar'
              ? 'يُستخدم الاسم كمفتاح للجلسة المركزية المحفوظة في Redis بين جميع Pods.'
              : language === 'de'
                ? 'Der Name wird als Schlüssel für die zentrale Redis-Sitzung zwischen allen Pods verwendet.'
                : 'Your name is used as the key for the central Redis session shared by all Pods.'}
          </p>
          <label className="welcome-name" htmlFor="user-name">
            {t.nameLabel}
            <input
              id="user-name"
              type="text"
              value={name}
              placeholder={language === 'ar' ? 'اكتب اسمك' : language === 'de' ? 'Gib deinen Namen ein' : 'Enter your name'}
              onChange={(event) => handleNameChange(event.target.value)}
            />
          </label>
        </section>
        {/* Kubernetes information */}

        <div className="card">
          <span>{t.uptime}</span>
          <strong>
            {formatUptime(
              uptimeSeconds
            )}
          </strong>
        </div>

        <div className="card">
          <span>{t.podIp}</span>
          <strong>
            {clusterConfig.podIp}
          </strong>
        </div>

        <div className="card">
          <span>{t.namespace}</span>
          <strong>
            {clusterConfig.namespace}
          </strong>
        </div>

        <div className="card">
          <span>{t.application}</span>
          <strong>
            {clusterConfig.appName}
          </strong>
        </div>

        <div className="card">
          <span>{t.pod}</span>
          <strong>
            {clusterConfig.podName}
          </strong>
        </div>

        <div className="card">
          <span>{t.node}</span>
          <strong>
            {clusterConfig.nodeName}
          </strong>
        </div>

        <div className="card">
          <span>{t.restarts}</span>
          <strong>
            {clusterConfig.restartCount}
          </strong>
        </div>

        {/* Redis */}

        <div className="card redis-card">
          <span>Redis</span>
          <strong className={redisConnected ? 'connection-ok' : 'connection-error'}>
            {redisConnected ? '● Connected' : '● Not connected'}
          </strong>
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
