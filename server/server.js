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

const PORT = process.env.PORT || 3000;


/* ==========================
   MIDDLEWARE
========================== */

app.use(cors());

app.use(express.json());

app.use(
    express.static(
        path.join(__dirname, "../web")
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
            ? {
                rejectUnauthorized: false
            }
            : false
});


pool.connect()

.then(client => {

    console.log("✅ PostgreSQL Connected");

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

            timestamp TIMESTAMPTZ NOT NULL
        )

    `);

    console.log("✅ sensor_data ready");
}


(async () => {

    try {

        await createTable();

    }

    catch(err) {

        console.error(
            "Create table error:",
            err
        );

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

    timestamp: null,

    lastUpdate: null

};


/* ==========================
   SSE CLIENTS
========================== */

let clients = [];


/* ==========================
   SAVE SENSOR DATA
========================== */

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

    const fan =
        Boolean(data.fan);

    const buzzer =
        Boolean(data.buzzer);


    let timestamp;


    /*
       Nếu ESP32 gửi timestamp
       → dùng timestamp của ESP32.

       Nếu không có
       → dùng thời gian server.
    */

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


    /* ==========================
       LƯU DATABASE
    ========================== */

    await pool.query(

        `
        INSERT INTO sensor_data
        (
            temperature,
            humidity,
            fan,
            buzzer,
            timestamp
        )

        VALUES
        ($1,$2,$3,$4,$5)
        `,

        [
            temperature,
            humidity,
            fan,
            buzzer,
            timestamp
        ]

    );


    return {

        temperature,

        humidity,

        fan,

        buzzer,

        timestamp:
            timestamp.toISOString(),

        /*
         * Thời điểm server nhận dữ liệu.
         * Dùng để xác định ESP32 Online/Offline.
         */

        lastUpdate:
            Date.now()

    };

}


/* ==========================
   GỬI SSE
========================== */

function broadcast(data)
{

    clients.forEach(
        client => {

            try {

                client.write(
                    `data:${JSON.stringify(data)}\n\n`
                );

            }

            catch(error) {

                console.log(
                    "SSE client error"
                );

            }

        }
    );

}


/* ==========================
   POST /data
   ESP32 GỬI DỮ LIỆU
========================== */

app.post(
    "/data",
    async (req,res) => {

        try {

            const data =
                req.body;


            /* ==========================
               MỘT BẢN GHI
            ========================== */

            if (
                !Array.isArray(data)
            )
            {

                console.log(
                    "ESP32-C3:",
                    data
                );


                const saved =
                    await saveSensorData(
                        data
                    );


                latestData =
                    saved;


                broadcast(
                    latestData
                );


                return res.json({

                    status: "OK",

                    count: 1

                });

            }


            /* ==========================
               NHIỀU BẢN GHI
            ========================== */

            console.log(
                `ESP32-C3: nhận ${data.length} bản ghi`
            );


            if (
                data.length === 0
            )
            {

                return res.json({

                    status: "OK",

                    count: 0

                });

            }


            let lastSaved = null;


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

            }


            /*
             * Chỉ gửi bản ghi cuối cùng
             * qua SSE.
             */

            broadcast(
                latestData
            );


            return res.json({

                status: "OK",

                count: data.length

            });

        }

        catch(error)
        {

            console.log(
                "POST /data ERROR:",
                error
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
   GET /realtime
   2 GIỜ GẦN NHẤT
========================== */

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

            console.log(
                "Realtime error:",
                error
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


        /*
         * Gửi dữ liệu hiện tại
         */

        if (latestData.lastUpdate)
        {

            res.write(
                `data:${JSON.stringify(
                    latestData
                )}\n\n`
            );

        }


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
   30 NGÀY
========================== */

app.get(
    "/history",
    async (req,res) => {

        try {

            const result =
                await pool.query(`

                    SELECT

                        (
                            timestamp
                            AT TIME ZONE
                            'Asia/Ho_Chi_Minh'
                        )::date
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
                        NOW() - INTERVAL '30 days'

                    GROUP BY
                        (
                            timestamp
                            AT TIME ZONE
                            'Asia/Ho_Chi_Minh'
                        )::date

                    ORDER BY
                        date ASC

                `);


            res.json(
                result.rows
            );

        }

        catch(error)
        {

            console.log(
                "History error:",
                error
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
                    "Không tìm thấy trang"

            });

    }
);


/* ==========================
   START SERVER
========================== */

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `🚀 Server đang chạy tại cổng ${PORT}`
        );

    }
);