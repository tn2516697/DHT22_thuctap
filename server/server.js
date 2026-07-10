require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const pool = require("./database");
const app = express();
const PORT = process.env.PORT || 3000;

// ==============================
// SSE CLIENTS
// ==============================

let clients = [];


// ==============================
// MIDDLEWARE

app.use(cors());
app.use(express.json());

// ==============================
// WEB STATIC

app.use(
    express.static(
        path.join(__dirname,"WEB")
    )
);

// ==============================
// DATABASE INIT

async function initDatabase(){

    try{

        await pool.query(`

        CREATE TABLE IF NOT EXISTS sensor_data(
            id SERIAL PRIMARY KEY,
            temperature REAL NOT NULL,
            humidity REAL NOT NULL,
            fan_status BOOLEAN DEFAULT FALSE,
            buzzer_status BOOLEAN DEFAULT FALSE,
            time TIMESTAMP DEFAULT CURRENT_TIMESTAMP

        );

        `);

        console.log(
            "✅ PostgreSQL Connected"
        );

        console.log(
            "✅ sensor_data ready"
        );
    }

    catch(err){

        console.log(
            "Database error:"
        );
        console.log(err);
    }
}

initDatabase();
// =================================================
// ESP32 SEND DATA
// =================================================

app.post("/data",async(req,res)=>{

    try{
        const {
            temperature,
            humidity,
            fan,
            buzzer
        } = req.body;

        if(
            temperature === undefined ||
            humidity === undefined
        ){
            return res.status(400).json({
                error:
                "Missing sensor data"
            });
        }

        const temp =
        Number(temperature);

        const hum =
        Number(humidity);

        const fanState =
        Boolean(fan);

        const buzzerState =
        Boolean(buzzer);

        const result =
        await pool.query(
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
        temp,
        hum,
        fanState,
        buzzerState
        ]
        );

        const data =
        result.rows[0];
        console.log(
            "ESP32:",
            data
        );


        // ======================
        // REALTIME UPDATE
        // ======================

        clients.forEach(client=>{
            client.write(
            `data:${JSON.stringify(data)}\n\n`
            );
        });


        res.json({
            status:"OK",
            data:data
        });
    }


    catch(err){
        console.log(err);
        res.status(500).json({
            error:
            err.message
        });
    }
});


// =================================================
// SSE REALTIME
// =================================================

app.get("/events",(req,res)=>{

    res.setHeader(
        "Content-Type",
        "text/event-stream"
    );
    res.setHeader(
        "Cache-Control",
        "no-cache"
    );
    res.setHeader(
        "Connection",
        "keep-alive"
    );

    res.flushHeaders();
    clients.push(res);
    console.log(
        "Client connected"
    );

    req.on(
        "close",
        ()=>{
        clients =
        clients.filter(
            c=>c!==res
        );
        console.log(
            "Client disconnected"
        );
    });
});


// =================================================
// GET LAST SENSOR
// =================================================


app.get("/data",async(req,res)=>{
try{
const result =
await pool.query(`
SELECT *
FROM sensor_data
ORDER BY id DESC
LIMIT 1
`);

res.json(
result.rows[0] || {}
);
}

catch(err){
res.status(500).json({
error:err.message
});
}
});


// =================================================
// HISTORY
// =================================================


app.get("/history",async(req,res)=>{
try{
    const limit =
    Number(req.query.limit) || 500;
    const result =
    await pool.query(`
    SELECT *
FROM sensor_data
ORDER BY id DESC
LIMIT $1
`,
[limit]
);
res.json(
result.rows
);
}

catch(err){
res.status(500).json({
error:err.message
});
}
});






// =================================================
// ANALYTICS
// =================================================


app.get("/analytics",

async(req,res)=>{
try{
        const result =
        await pool.query(`
        SELECT
        DATE(time)
        AS day,
        AVG(temperature)
        AS avg_temperature,
        AVG(humidity)
        AS avg_humidity
        FROM sensor_data
        GROUP BY DATE(time)
        ORDER BY day DESC
        LIMIT 30
        `);


res.json( result.rows );

}

catch(err)
{
    res.status(500).json({error:err.message});
}

});


// =================================================
// DELETE OLD DATA
// =================================================


app.delete("/clear",
async(req,res)=>{
try{
await pool.query(`
DELETE FROM sensor_data;
`);
res.json({
message:
"Database cleared"
});
}

catch(err){
res.status(500).json({
error:err.message
});
}
});

app.listen(PORT,()=>{
console.log(
`Server running port ${PORT}`
);
});