// ======================================
// SMART ENVIRONMENT MONITORING SERVER
// ESP32 + AHT30 + PostgreSQL
// Render: Web + API + Database
// ======================================

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 3000;


// =====================================================
// PATH
// =====================================================

const WEB_DIR = path.join(__dirname, "../web");


// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors());

app.use(express.json());


// Không cache các file giao diện.
app.use(
    express.static(WEB_DIR, {
        etag: false,
        maxAge: 0,
        setHeaders: (res) => {

            res.setHeader(
                "Cache-Control",
                "no-store, no-cache, must-revalidate, proxy-revalidate"
            );

            res.setHeader(
                "Pragma",
                "no-cache"
            );

            res.setHeader(
                "Expires",
                "0"
            );

        }
    })
);


// =====================================================
// POSTGRESQL
// =====================================================

const pool = new Pool({

    connectionString:
        process.env.DATABASE_URL,

    ssl:
        process.env.DATABASE_URL
            ? {
                rejectUnauthorized: false
            }
            : false

});


// =====================================================
// DATABASE CONNECTION
// =====================================================

pool.connect()

.then(client => {

    console.log("✅ PostgreSQL Connected");

    client.release();

})

.catch(error => {

    console.error(
        "❌ PostgreSQL connection error:",
        error.message
    );

});


// =====================================================
// DATABASE TABLE
// =====================================================

async function createTable()
{
    await pool.query(`

        CREATE TABLE IF NOT EXISTS sensor_data
        (
            id SERIAL PRIMARY KEY,

            temperature REAL NOT NULL,

            humidity REAL NOT NULL,

            fan BOOLEAN DEFAULT false,

            buzzer BOOLEAN DEFAULT false,

            timestamp TIMESTAMPTZ NOT NULL,

            received_at TIMESTAMPTZ DEFAULT NOW()
        )

    `);


    await pool.query(`

        ALTER TABLE sensor_data

        ADD COLUMN IF NOT EXISTS
        received_at TIMESTAMPTZ DEFAULT NOW()

    `);


    await pool.query(`

        UPDATE sensor_data

        SET received_at = timestamp

        WHERE received_at IS NULL

    `);


    console.log("✅ sensor_data ready");
}


(async () => {

    try {

        await createTable();

    }

    catch(error) {

        console.error(
            "❌ Create table error:",
            error.message
        );

    }

})();


// =====================================================
// SSE CLIENTS
// =====================================================

let clients = [];


// =====================================================
// LATEST DATA
// =====================================================

let latestData = null;


// =====================================================
// SAVE SENSOR DATA
// =====================================================

async function saveSensorData(data)
{
    if (
        data.temperature === undefined ||
        data.humidity === undefined
    )
    {
        throw new Error(
            "Dữ liệu cảm biến không hợp lệ"
        );
    }


    const temperature =
        Number(data.temperature);

    const humidity =
        Number(data.humidity);


    if (
        !Number.isFinite(temperature) ||
        !Number.isFinite(humidity)
    )
    {
        throw new Error(
            "Nhiệt độ hoặc độ ẩm không hợp lệ"
        );
    }


    const fan =
        Boolean(data.fan);

    const buzzer =
        Boolean(data.buzzer);


    let timestamp;


    // Thời gian đo của ESP32

    if (data.timestamp)
    {
        timestamp =
            new Date(data.timestamp);

        if (
            isNaN(timestamp.getTime())
        )
        {
            timestamp =
                new Date();
        }
    }
    else
    {
        timestamp =
            new Date();
    }


    // Thời điểm Render nhận dữ liệu

    const receivedAt =
        new Date();


    const result =
        await pool.query(

            `
            INSERT INTO sensor_data
            (
                temperature,
                humidity,
                fan,
                buzzer,
                timestamp,
                received_at
            )

            VALUES
            ($1,$2,$3,$4,$5,$6)

            RETURNING
                id,
                temperature,
                humidity,
                fan,
                buzzer,
                timestamp,
                received_at
            `,

            [
                temperature,
                humidity,
                fan,
                buzzer,
                timestamp,
                receivedAt
            ]

        );


    const row =
        result.rows[0];


    return {

        id:
            row.id,

        temperature:
            Number(row.temperature),

        humidity:
            Number(row.humidity),

        fan:
            row.fan,

        buzzer:
            row.buzzer,

        timestamp:
            new Date(
                row.timestamp
            ).toISOString(),

        lastUpdate:
            new Date(
                row.received_at
            ).getTime()

    };
}


// =====================================================
// BROADCAST SSE
// =====================================================

function broadcast(data)
{
    const message =
        `data:${JSON.stringify(data)}\n\n`;


    clients =
        clients.filter(
            client => {

                try {

                    client.write(message);

                    return true;

                }

                catch(error) {

                    return false;

                }

            }
        );
}


// =====================================================
// POST /data
// ESP32 → RENDER
// =====================================================

app.post(
    "/data",
    async (req,res) => {

        try {

            const data =
                req.body;


            // ==========================================
            // MỘT BẢN GHI
            // ==========================================

            if (
                !Array.isArray(data)
            )
            {

                console.log(
                    "ESP32:",
                    data
                );


                const saved =
                    await saveSensorData(
                        data
                    );


                latestData =
                    saved;


                // Gửi ngay dữ liệu mới tới các trình duyệt

                broadcast(
                    latestData
                );


                return res.json({

                    status:
                        "OK",

                    count:
                        1

                });

            }


            // ==========================================
            // NHIỀU BẢN GHI
            // ==========================================

            console.log(
                `ESP32: nhận ${data.length} bản ghi`
            );


            if (
                data.length === 0
            )
            {

                return res.json({

                    status:
                        "OK",

                    count:
                        0

                });

            }


            let lastSaved =
                null;


            for (
                const record of data
            )
            {

                lastSaved =
                    await saveSensorData(
                        record
                    );

            }


            if (lastSaved)
            {

                latestData =
                    lastSaved;


                broadcast(
                    latestData
                );

            }


            return res.json({

                status:
                    "OK",

                count:
                    data.length

            });

        }

        catch(error)
        {

            console.error(
                "POST /data ERROR:",
                error.message
            );


            return res
                .status(500)
                .json({

                    error:
                        error.message

                });

        }

    }
);


// =====================================================
// GET /data
// LẤY BẢN GHI MỚI NHẤT
// =====================================================

app.get(
    "/data",
    async (req,res) => {

        try {

            const result =
                await pool.query(`

                    SELECT

                        id,

                        temperature,

                        humidity,

                        fan,

                        buzzer,

                        timestamp,

                        received_at

                    FROM sensor_data

                    ORDER BY
                        received_at DESC

                    LIMIT 1

                `);


            if (
                result.rows.length === 0
            )
            {

                return res.json({

                    temperature: 0,

                    humidity: 0,

                    fan: false,

                    buzzer: false,

                    timestamp: null,

                    lastUpdate: null

                });

            }


            const row =
                result.rows[0];


            const data = {

                id:
                    row.id,

                temperature:
                    Number(row.temperature),

                humidity:
                    Number(row.humidity),

                fan:
                    row.fan,

                buzzer:
                    row.buzzer,

                timestamp:
                    new Date(
                        row.timestamp
                    ).toISOString(),

                lastUpdate:
                    new Date(
                        row.received_at
                    ).getTime()

            };


            latestData =
                data;


            res.json(data);

        }

        catch(error)
        {

            console.error(
                "GET /data ERROR:",
                error.message
            );


            res
                .status(500)
                .json({

                    error:
                        error.message

                });

        }

    }
);


// =====================================================
// GET /realtime
// 2 GIỜ GẦN NHẤT
// =====================================================

app.get(
    "/realtime",
    async (req,res) => {

        try {

            const result =
                await pool.query(`

                    SELECT

                        temperature,

                        humidity,

                        fan,

                        buzzer,

                        timestamp

                    FROM sensor_data

                    WHERE timestamp >=
                        NOW() - INTERVAL '2 hours'

                    ORDER BY
                        timestamp ASC

                `);


            res.json(
                result.rows
            );

        }

        catch(error)
        {

            console.error(
                "Realtime error:",
                error.message
            );


            res
                .status(500)
                .json({

                    error:
                        error.message

                });

        }

    }
);


// =====================================================
// SSE /events
// =====================================================

app.get(
    "/events",
    async (req,res) => {

        res.writeHead(
            200,
            {

                "Content-Type":
                    "text/event-stream",

                "Cache-Control":
                    "no-cache, no-store, must-revalidate",

                "Connection":
                    "keep-alive",

                "X-Accel-Buffering":
                    "no"

            }
        );


        // Giữ kết nối SSE sống

        res.write(": connected\n\n");


        clients.push(res);


        // Heartbeat mỗi 15 giây

        const heartbeat =
            setInterval(
                () => {

                    try {

                        res.write(
                            ": heartbeat\n\n"
                        );

                    }

                    catch(error) {

                        clearInterval(
                            heartbeat
                        );

                    }

                },
                15000
            );


        // Gửi dữ liệu mới nhất ngay khi trình duyệt kết nối

        try {

            const result =
                await pool.query(`

                    SELECT

                        id,

                        temperature,

                        humidity,

                        fan,

                        buzzer,

                        timestamp,

                        received_at

                    FROM sensor_data

                    ORDER BY
                        received_at DESC

                    LIMIT 1

                `);


            if (
                result.rows.length > 0
            )
            {

                const row =
                    result.rows[0];


                const data = {

                    id:
                        row.id,

                    temperature:
                        Number(row.temperature),

                    humidity:
                        Number(row.humidity),

                    fan:
                        row.fan,

                    buzzer:
                        row.buzzer,

                    timestamp:
                        new Date(
                            row.timestamp
                        ).toISOString(),

                    lastUpdate:
                        new Date(
                            row.received_at
                        ).getTime()

                };


                res.write(
                    `data:${JSON.stringify(data)}\n\n`
                );

            }

        }

        catch(error)
        {

            console.error(
                "SSE initial data error:",
                error.message
            );

        }


        // Client đóng kết nối

        req.on(
            "close",
            () => {

                clearInterval(
                    heartbeat
                );


                clients =
                    clients.filter(
                        client =>
                            client !== res
                    );

            }
        );

    }
);

// =====================================================
// HISTORY
// 30 NGÀY GẦN NHẤT
// =====================================================

app.get(
    "/history",
    async (req, res) => {

        try {

            const result = await pool.query(`

                SELECT

                    TO_CHAR(
                        (
                            timestamp AT TIME ZONE
                            'Asia/Ho_Chi_Minh'
                        )::date,
                        'DD/MM/YYYY'
                    ) AS date,

                    ROUND(
                        AVG(temperature)::numeric,
                        2
                    ) AS avg_temperature,

                    ROUND(
                        AVG(humidity)::numeric,
                        2
                    ) AS avg_humidity

                FROM sensor_data

                WHERE timestamp >=
                    NOW() - INTERVAL '30 days'

                GROUP BY
                    (
                        timestamp AT TIME ZONE
                        'Asia/Ho_Chi_Minh'
                    )::date

                ORDER BY
                    (
                        timestamp AT TIME ZONE
                        'Asia/Ho_Chi_Minh'
                    )::date ASC

            `);


            console.log(
                `📊 HISTORY: ${result.rows.length} ngày`
            );


            res.json(
                result.rows
            );

        }

        catch (error) {

            console.error(
                "❌ History error:",
                error
            );


            res
                .status(500)
                .json({

                    error:
                        "Không thể tải dữ liệu lịch sử",

                    detail:
                        error.message

                });

        }

    }
);

// =====================================================
// HEALTH CHECK
// =====================================================

app.get(
    "/health",
    async (req,res) => {

        try {

            await pool.query(
                "SELECT 1"
            );


            res.json({

                status:
                    "OK",

                server:
                    "Render",

                database:
                    "PostgreSQL"

            });

        }

        catch(error)
        {

            res
                .status(500)
                .json({

                    status:
                        "ERROR",

                    error:
                        error.message

                });

        }

    }
);


// =====================================================
// HOME
// =====================================================

app.get(
    "/",
    (req,res) => {

        res.sendFile(
            path.join(
                WEB_DIR,
                "index.html"
            )
        );

    }
);


// =====================================================
// 404
// =====================================================

app.use(
    (req,res) => {

        res
            .status(404)
            .json({

                error:
                    "Không tìm thấy trang"

            });

    }
);


// =====================================================
// START SERVER
// =====================================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `🚀 Render server đang chạy tại port ${PORT}`
        );

    }
);