import express from "express";
import { createClient } from "redis";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import https from "https";
const app = express();
const port = Number(process.env.PORT) || 8080;
app.use(express.json());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * Redis connection.
 *
 * REDIS_URL can point to:
 *
 *   redis://localhost:6379
 *   redis://:password@localhost:6379
 *   redis://redis-service:6379
 *   redis://:password@redis-service:6379
 *
 * For TLS:
 *
 *   rediss://:password@example.com:6380
 */
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const redis = createClient({
    url: redisUrl,
    socket: {
        reconnectStrategy: (retries) => {
            return Math.min(retries * 500, 5000);
        },
    },
});
redis.on("error", (error) => {
    console.error("Redis error:", error);
});
async function connectRedis() {
    try {
        await redis.connect();
        console.log("Connected to Redis");
    }
    catch (error) {
        console.error("Could not connect to Redis:", error);
    }
}
/**
 * Kubernetes configuration.
 *
 * These values are injected through the Downward API.
 */
const podName = process.env.POD_NAME;
const podNamespace = process.env.POD_NAMESPACE;
const kubernetesApiHost = process.env.KUBERNETES_SERVICE_HOST || "kubernetes.default.svc";
const kubernetesApiPort = Number(process.env.KUBERNETES_SERVICE_PORT_HTTPS) || 443;
const serviceAccountTokenPath = "/var/run/secrets/kubernetes.io/serviceaccount/token";
const serviceAccountCaPath = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt";
/**
 * Query the Kubernetes API for the current Pod.
 *
 * We use the Pod name from the Downward API and request only that Pod.
 *
 * Required RBAC:
 *
 *   apiGroups: [""]
 *   resources: ["pods"]
 *   verbs: ["get"]
 */
async function getCurrentPodInfo() {
    /**
     * When running locally, the Kubernetes ServiceAccount files
     * will not exist.
     */
    if (!podName || !podNamespace) {
        return {
            startTime: null,
            restartCount: 0,
        };
    }
    if (!fs.existsSync(serviceAccountTokenPath)) {
        return {
            startTime: null,
            restartCount: 0,
        };
    }
    try {
        const token = fs
            .readFileSync(serviceAccountTokenPath, "utf8")
            .trim();
        const ca = fs.existsSync(serviceAccountCaPath)
            ? fs.readFileSync(serviceAccountCaPath)
            : undefined;
        const apiPath = `/api/v1/namespaces/${encodeURIComponent(podNamespace)}/pods/${encodeURIComponent(podName)}`;
        const podData = await new Promise((resolve, reject) => {
            const request = https.request({
                hostname: kubernetesApiHost,
                port: kubernetesApiPort,
                path: apiPath,
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json",
                },
                ca,
                rejectUnauthorized: true,
            }, (response) => {
                let body = "";
                response.setEncoding("utf8");
                response.on("data", (chunk) => {
                    body += chunk;
                });
                response.on("end", () => {
                    if (response.statusCode === undefined ||
                        response.statusCode < 200 ||
                        response.statusCode >= 300) {
                        reject(new Error(`Kubernetes API returned HTTP ${response.statusCode}: ${body}`));
                        return;
                    }
                    try {
                        resolve(JSON.parse(body));
                    }
                    catch {
                        reject(new Error("Failed to parse Kubernetes API response"));
                    }
                });
            });
            request.on("error", reject);
            request.end();
        });
        const startTime = typeof podData?.status?.startTime === "string"
            ? podData.status.startTime
            : null;
        const containerStatuses = Array.isArray(podData?.status?.containerStatuses)
            ? podData.status.containerStatuses
            : [];
        /**
         * We have only one application container.
         *
         * If there are multiple containers in the future,
         * sum their restart counts.
         */
        const restartCount = containerStatuses.reduce((total, container) => {
            return total + Number(container.restartCount || 0);
        }, 0);
        return {
            startTime,
            restartCount,
        };
    }
    catch (error) {
        console.error("Failed to query Kubernetes API:", error);
        return {
            startTime: null,
            restartCount: 0,
        };
    }
}
/**
 * Liveness check.
 *
 * This intentionally does not depend on Redis or Kubernetes API.
 */
app.get("/healthz", (_req, res) => {
    res.status(200).json({
        status: "ok",
    });
});
/**
 * Readiness check.
 *
 * The application is Ready only when Redis is reachable.
 */
app.get("/readyz", async (_req, res) => {
    try {
        if (!redis.isReady) {
            return res.status(503).json({
                ready: false,
                redis: false,
            });
        }
        await redis.ping();
        res.status(200).json({
            ready: true,
            redis: true,
        });
    }
    catch {
        res.status(503).json({
            ready: false,
            redis: false,
        });
    }
});
/**
 * Check Redis connectivity.
 */
app.get("/api/session/status", async (_req, res) => {
    try {
        if (!redis.isReady) {
            return res.json({
                connected: false,
            });
        }
        await redis.ping();
        res.json({
            connected: true,
        });
    }
    catch {
        res.json({
            connected: false,
        });
    }
});
/**
 * Get session data for a name.
 */
app.get("/api/session/:name", async (req, res) => {
    try {
        if (!redis.isReady) {
            return res.status(503).json({
                connected: false,
                found: false,
            });
        }
        const name = req.params.name;
        const key = `session:${name}`;
        const magicNumber = await redis.hGet(key, "magicNumber");
        if (magicNumber === null) {
            return res.json({
                connected: true,
                found: false,
            });
        }
        res.json({
            connected: true,
            found: true,
            name,
            magicNumber,
        });
    }
    catch (error) {
        console.error("Session lookup error:", error);
        res.status(500).json({
            connected: false,
            found: false,
        });
    }
});
/**
 * Save or update session data for a name.
 *
 * HSET creates the field if it doesn't exist
 * and updates it if it already exists.
 */
app.post("/api/session/:name", async (req, res) => {
    try {
        if (!redis.isReady) {
            return res.status(503).json({
                connected: false,
                saved: false,
            });
        }
        const name = req.params.name;
        const { magicNumber } = req.body;
        if (magicNumber === undefined ||
            magicNumber === null ||
            magicNumber === "") {
            return res.status(400).json({
                saved: false,
                error: "magicNumber is required",
            });
        }
        const key = `session:${name}`;
        await redis.hSet(key, {
            magicNumber: String(magicNumber),
        });
        res.json({
            connected: true,
            saved: true,
            name,
            magicNumber: String(magicNumber),
        });
    }
    catch (error) {
        console.error("Session save error:", error);
        res.status(500).json({
            connected: false,
            saved: false,
        });
    }
});
/**
 * Serve the React application.
 */
const distPath = path.resolve(__dirname, "../../dist");
console.log("dirname:", __dirname);
console.log("distPath:", distPath);
/**
 * Kubernetes configuration endpoint.
 *
 * Most values come directly from environment variables
 * populated through the Downward API.
 *
 * Pod start time and restart count come from the Kubernetes API.
 */
app.get("/api/config", async (_req, res) => {
    const podInfo = await getCurrentPodInfo();
    res.json({
        podIp: process.env.POD_IP || "unknown",
        namespace: process.env.POD_NAMESPACE || "unknown",
        appName: process.env.APP_NAME || "unknown",
        podName: process.env.POD_NAME || "unknown",
        nodeName: process.env.NODE_NAME || "unknown",
        podStartTime: podInfo.startTime,
        restartCount: podInfo.restartCount,
    });
});
app.use(express.static(distPath));
/**
 * React SPA fallback.
 */
app.get("/", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
});
app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
});
app.listen(port, () => {
    console.log(`ClusterScope API listening on port ${port}`);
    connectRedis();
});
