import express from "express";
import { createClient } from "redis";
import path from "path";
import { fileURLToPath } from "url";
const app = express();
const port = Number(process.env.PORT) || 8080;
app.use(express.json());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const redis = createClient({
    socket: {
        host: process.env.REDIS_HOST || "localhost",
        port: Number(process.env.REDIS_PORT) || 6379,
        reconnectStrategy: (retries) => {
            return Math.min(retries * 500, 5000);
        },
    },
    password: process.env.REDIS_PASSWORD || undefined,
    database: Number(process.env.REDIS_DB) || 0,
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
 * Liveness check.
 *
 * This only tells Kubernetes that the application process is alive.
 * It intentionally does not depend on Redis.
 */
app.get("/healthz", (_req, res) => {
    res.status(200).json({
        status: "ok",
    });
});
/**
 * Readiness check.
 *
 * The pod is Ready only when Redis is reachable.
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
 * Save session data for a name.
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
