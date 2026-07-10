require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const pool = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

//==================================================
// SSE CLIENT
//==================================================

let clients = [];

//==================================================
// MIDDLEWARE
//==================================================

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "../WEB")));

//==================================================
// WEB PAGE
//==================================================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../WEB/index.html"));
});

app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "../WEB/dashboard.html"));
});

app.get("/history-page", (req, res) => {
    res.sendFile(path.join(__dirname, "../WEB/history.html"));
});

//==================================================
// DATABASE
//==================================================

async function initDatabase() {

    try {

        await pool.query(`
            CREATE TABLE IF NOT EXISTS sensor_data
            (
                id SERIAL PRIMARY KEY,
                temperature REAL NOT NULL,
                humidity REAL NOT NULL,
                fan_status BOOLEAN DEFAULT FALSE,
                buzzer_status BOOLEAN DEFAULT FALSE,
                time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("✅ PostgreSQL Connected");
        console.log("✅ sensor_data ready");

    } catch (err) {

        console.log(err);

    }

}

initDatabase();

//==================================================
// ESP32 POST DATA
//==================================================

app.post("/data", async (req, res) => {

    try {

        const {
            temperature,
            humidity,
            fan,
            buzzer
        } = req.body;

        if (temperature == undefined || humidity == undefined) {

            return res.status(400).json({
                error: "Missing sensor data"
            });

        }

        const result = await pool.query(

            `
            INSERT INTO sensor_data
            (
                temperature,
                humidity,
                fan_status,
                buzzer_status
            )

            VALUES
            ($1,$2,$3,$4)

            RETURNING *
            `,

            [
                Number(temperature),
                Number(humidity),
                Boolean(fan),
                Boolean(buzzer)
            ]

        );

        const data = result.rows[0];

        console.log("ESP32 :", data);

        //Realtime

        clients.forEach(client => {

            client.write(`data:${JSON.stringify(data)}\n\n`);

        });

        res.json({

            status: "OK",
            data

        });

    }

    catch (err) {

        console.log(err);

        res.status(500).json({

            error: err.message

        });

    }

});

//==================================================
// SSE
//==================================================

app.get("/events", (req, res) => {

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.flushHeaders();

    clients.push(res);

    console.log("Client Connected");

    const keepAlive = setInterval(() => {

        res.write(":keepalive\n\n");

    }, 30000);

    req.on("close", () => {

        clearInterval(keepAlive);

        clients = clients.filter(c => c !== res);

        console.log("Client Disconnected");

    });

});

//==================================================
// LAST DATA
//==================================================

app.get("/data", async (req, res) => {

    try {

        const result = await pool.query(

            `SELECT * FROM sensor_data
             ORDER BY id DESC
             LIMIT 1`

        );

        res.json(result.rows[0] || {});

    }

    catch (err) {

        res.status(500).json({

            error: err.message

        });

    }

});

//==================================================
// HISTORY
//==================================================

app.get("/history", async (req, res) => {

    try {

        const limit = Number(req.query.limit) || 500;

        const result = await pool.query(

            `SELECT *
             FROM sensor_data
             ORDER BY id DESC
             LIMIT $1`,

            [limit]

        );

        res.json(result.rows);

    }

    catch (err) {

        res.status(500).json({

            error: err.message

        });

    }

});

//==================================================
// ANALYTICS
//==================================================

app.get("/analytics", async (req, res) => {

    try {

        const result = await pool.query(

            `
            SELECT

            ROUND(AVG(temperature)::numeric,2) AS avg_temperature,
            ROUND(AVG(humidity)::numeric,2) AS avg_humidity,

            MAX(temperature) AS max_temperature,
            MIN(temperature) AS min_temperature,

            MAX(humidity) AS max_humidity,
            MIN(humidity) AS min_humidity,

            COUNT(*) FILTER
            (
                WHERE fan_status=true
            ) AS fan_count,

            COUNT(*) FILTER
            (
                WHERE buzzer_status=true
            ) AS buzzer_count,

            COUNT(*) AS total_record

            FROM sensor_data
            `

        );

        res.json(result.rows[0]);

    }

    catch (err) {

        res.status(500).json({

            error: err.message

        });

    }

});

//==================================================
// DAILY ANALYTICS
//==================================================

app.get("/analytics/daily", async (req, res) => {

    try {

        const result = await pool.query(

            `
            SELECT

            DATE(time) AS day,

            ROUND(AVG(temperature)::numeric,2) AS avg_temperature,

            ROUND(AVG(humidity)::numeric,2) AS avg_humidity,

            COUNT(*) AS total

            FROM sensor_data

            GROUP BY DATE(time)

            ORDER BY day DESC

            LIMIT 30
            `

        );

        res.json(result.rows);

    }

    catch (err) {

        res.status(500).json({

            error: err.message

        });

    }

});

//==================================================
// CLEAR DATABASE
//==================================================

app.delete("/clear", async (req, res) => {

    try {

        await pool.query("DELETE FROM sensor_data");

        res.json({

            message: "Database cleared"

        });

    }

    catch (err) {

        res.status(500).json({

            error: err.message

        });

    }

});

//==================================================

app.listen(PORT, () => {

    console.log("======================================");
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 http://localhost:${PORT}`);
    console.log("======================================");

});