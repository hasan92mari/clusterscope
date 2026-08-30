interface ClusterConfig {
  podName?: string;
  namespace?: string;
  nodeName?: string;
  podIp?: string;
  appName?: string;
}

declare global {
  interface Window {
    __CLUSTERSCOPE_CONFIG__?: ClusterConfig;
  }
}

const config = window.__CLUSTERSCOPE_CONFIG__ || {};

export const clusterConfig = {
  podName: config.podName ?? "No value",
  namespace: config.namespace ?? "No value",
  nodeName: config.nodeName ?? "No value",
  podIp: config.podIp ?? "No value",
  appName: config.appName ?? "No value",
};