import './App.css'

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
          <span>Cluster</span>
          <strong>local-cluster</strong>
        </div>

        <div className="card">
          <span>Namespace</span>
          <strong>clusterscope</strong>
        </div>

        <div className="card">
          <span>Application</span>
          <strong>frontend</strong>
        </div>

        <div className="card">
          <span>Pod Status</span>
          <strong>Running</strong>
        </div>

        <div className="card">
          <span>Node</span>
          <strong>Not connected</strong>
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