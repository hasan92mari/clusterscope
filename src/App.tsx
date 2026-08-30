import './App.css'
import { clusterConfig } from './config';

function App() {
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

        <div className="card">
          <span>Redis</span>
          <strong>Not connected</strong>
        </div>
      </main>
    </div>
  );
}

export default App;