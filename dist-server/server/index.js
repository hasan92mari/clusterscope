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
/* ============================================================
   Redis
   ============================================================ */
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
/* ============================================================
   Kubernetes configuration
   ============================================================ */
const podName = process.env.POD_NAME;
const podNamespace = process.env.POD_NAMESPACE;
const kubernetesApiHost = process.env.KUBERNETES_SERVICE_HOST || "kubernetes.default.svc";
const kubernetesApiPort = Number(process.env.KUBERNETES_SERVICE_PORT_HTTPS) || 443;
const serviceAccountTokenPath = "/var/run/secrets/kubernetes.io/serviceaccount/token";
const serviceAccountCaPath = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt";
/**
 * Get information about the current Kubernetes Pod.
 *
 * This information cannot be provided by the Downward API:
 *
 * - status.startTime
 * - containerStatuses[].restartCount
 *
 * Therefore we query the Kubernetes API using the Pod's
 * ServiceAccount.
 */
async function getCurrentPodInfo() {
    /**
     * Local development.
     *
     * These values do not exist when running outside Kubernetes.
     */
    if (!podName || !podNamespace) {
        console.log("Kubernetes pod information unavailable: POD_NAME or POD_NAMESPACE is not set.");
        return {
            startTime: null,
            restartCount: 0,
        };
    }
    /**
     * Kubernetes ServiceAccount token is required.
     */
    if (!fs.existsSync(serviceAccountTokenPath)) {
        console.log("Kubernetes ServiceAccount token not found. Running outside Kubernetes?");
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
        console.log(`Querying Kubernetes API for pod ${podNamespace}/${podName}`);
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
                    const statusCode = response.statusCode;
                    if (statusCode === undefined ||
                        statusCode < 200 ||
                        statusCode >= 300) {
                        reject(new Error(`Kubernetes API returned HTTP ${statusCode}: ${body}`));
                        return;
                    }
                    try {
                        resolve(JSON.parse(body));
                    }
                    catch {
                        reject(new Error("Kubernetes API returned invalid JSON"));
                    }
                });
            });
            request.setTimeout(5000, () => {
                request.destroy(new Error("Kubernetes API request timed out"));
            });
            request.on("error", reject);
            request.end();
        });
        /**
         * Pod start time.
         *
         * Example:
         * 2026-09-01T13:28:44Z
         */
        const startTime = typeof podData?.status?.startTime === "string"
            ? podData.status.startTime
            : null;
        /**
         * Container restart count.
         */
        const containerStatuses = Array.isArray(podData?.status?.containerStatuses)
            ? podData.status.containerStatuses
            : [];
        /**
         * ClusterScope currently has one application container.
         *
         * We use the total of restart counts so this continues
         * to work if another container is added later.
         */
        const restartCount = containerStatuses.reduce((total, container) => {
            return total + Number(container.restartCount || 0);
        }, 0);
        console.log(`Kubernetes pod info: startTime=${startTime}, restartCount=${restartCount}`);
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
/* ============================================================
   Health
   ============================================================ */
/**
 * Liveness check.
 *
 * Does NOT depend on Redis or Kubernetes API.
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
/* ============================================================
   Redis API
   ============================================================ */
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
/* ============================================================
   Static frontend
   ============================================================ */
const distPath = path.resolve(__dirname, "../../dist");
console.log("dirname:", __dirname);
console.log("distPath:", distPath);
/* ============================================================
   Kubernetes configuration API
   ============================================================ */
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
/* ============================================================
   React application
   ============================================================ */
app.use(express.static(distPath));
app.get("/", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
});
app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
});
/* ============================================================
   Start server
   ============================================================ */
app.listen(port, () => {
    console.log(`ClusterScope API listening on port ${port}`);
    connectRedis();
});
