// ======================================
// SMART ENVIRONMENT MONITORING SERVER
// ESP32-C3 Super Mini + AHT30 + PostgreSQL
// ======================================

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");

const app = express();

const PORT =
    process.env.PORT || 3000;


/* ==========================
   MIDDLEWARE
========================== */

app.use(cors());

app.use(express.json());

app.use(
    express.static(
        path.join(
            __dirname,
            "../web"
        )
    )
);


/* ==========================
   POSTGRESQL
========================== */

const pool = new Pool({

    connectionString:
        process.env.DATABASE_URL,

    ssl:
        process.env.DATABASE_URL
        ?
        {
            rejectUnauthorized:false
        }
        :
        false
});


pool.connect()

.then(client => {

    console.log(
        "✅ PostgreSQL Connected"
    );

    client.release();

})

.catch(err => {

    console.log(
        "Database error:",
        err.message
    );

});


/* ==========================
   DATABASE TABLE
========================== */

async function createTable()
{
    await pool.query(`

        CREATE TABLE IF NOT EXISTS sensor_data
        (
            id SERIAL PRIMARY KEY,

            temperature REAL,

            humidity REAL,

            fan BOOLEAN DEFAULT false,

            buzzer BOOLEAN DEFAULT false,

            timestamp TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP
        )

    `);

    console.log(
        "✅ sensor_data ready"
    );
}


(async () => {

    try {

        await createTable();

    }
    catch(err) {

        console.error(err);

    }

})();


/* ==========================
   LATEST DATA
========================== */

let latestData = {

    temperature: 0,

    humidity: 0,

    fan: false,

    buzzer: false,

    lastUpdate: null

};


/* ==========================
   SSE CLIENTS
========================== */

let clients = [];


/* ==========================
   POST /data
   ESP32 SEND DATA
========================== */

app.post(
    "/data",
    async (req,res) => {

        try {

            const data =
                req.body;


            if (
                data.temperature === undefined ||
                data.humidity === undefined
            )
            {
                return res
                    .status(400)
                    .json({
                        error:
                            "Invalid data"
                    });
            }


            console.log(
                "ESP32-C3:",
                data
            );


            latestData = {

                temperature:
                    Number(
                        data.temperature
                    ),

                humidity:
                    Number(
                        data.humidity
                    ),

                fan:
                    Boolean(
                        data.fan
                    ),

                buzzer:
                    Boolean(
                        data.buzzer
                    ),

                lastUpdate:
                    Date.now()

            };


            /* SAVE DATABASE */

            await pool.query(

                `
                INSERT INTO sensor_data
                (
                    temperature,
                    humidity,
                    fan,
                    buzzer
                )

                VALUES
                ($1,$2,$3,$4)
                `,

                [
                    latestData.temperature,
                    latestData.humidity,
                    latestData.fan,
                    latestData.buzzer
                ]

            );


            /* SEND SSE */

            clients.forEach(
                client => {

                    client.write(
                        `data:${JSON.stringify(
                            latestData
                        )}\n\n`
                    );

                }
            );


            res.json({

                status:"OK"

            });

        }

        catch(error)
        {
            console.log(error);

            res
                .status(500)
                .json({
                    error:
                        error.message
                });
        }

    }
);


/* ==========================
   GET /data
========================== */

app.get(
    "/data",
    (req,res) => {

        res.json(
            latestData
        );

    }
);


/* ==========================
   SSE /events
========================== */

app.get(
    "/events",
    (req,res) => {

        res.writeHead(
            200,
            {

                "Content-Type":
                    "text/event-stream",

                "Cache-Control":
                    "no-cache",

                "Connection":
                    "keep-alive"
            }
        );


        /* gửi dữ liệu hiện tại */

        res.write(
            `data:${JSON.stringify(
                latestData
            )}\n\n`
        );


        clients.push(res);


        req.on(
            "close",
            () => {

                clients =
                    clients.filter(
                        client =>
                            client !== res
                    );

            }
        );

    }
);


/* ==========================
   HISTORY
========================== */

app.get(
    "/history",
    async (req,res) => {

        try {

            const result =
                await pool.query(

                    `

                    SELECT

                    DATE(timestamp)
                    AS date,

                    ROUND(
                        AVG(temperature)::numeric,
                        2
                    )
                    AS avg_temperature,

                    ROUND(
                        AVG(humidity)::numeric,
                        2
                    )
                    AS avg_humidity

                    FROM sensor_data

                    WHERE timestamp >=
                    NOW() -
                    INTERVAL '30 days'

                    GROUP BY
                    DATE(timestamp)

                    ORDER BY
                    date ASC

                    `
                );


            res.json(
                result.rows
            );

        }

        catch(error)
        {
            console.log(error);

            res
                .status(500)
                .json({
                    error:
                        error.message
                });
        }

    }
);


/* ==========================
   HOME
========================== */

app.get(
    "/",
    (req,res) => {

        res.sendFile(
            path.join(
                __dirname,
                "../web/index.html"
            )
        );

    }
);


/* ==========================
   404
========================== */

app.use(
    (req,res) => {

        res
            .status(404)
            .json({
                error:
                    "Not Found"
            });

    }
);


/* ==========================
   START SERVER
========================== */

app.listen(
    PORT,
    () => {

        console.log(
            `🚀 Server running port ${PORT}`
        );

    }
);