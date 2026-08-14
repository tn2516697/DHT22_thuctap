/* =====================================
   SMART ENVIRONMENT MONITORING SYSTEM

   ESP32-C3 Super Mini
   AHT30
   PostgreSQL

   Single JS file:
   - index.html
   - dashboard.html
   - history.html
===================================== */


const SERVER_URL = "";

let tempChart = null;
let humidityChart = null;
let historyChart = null;

let lastReceiveTime = 0;


/* =====================================
   PAGE DETECTION
===================================== */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        const page = window.location.pathname;

        if (
            page.includes("index.html") ||
            page === "/" ||
            page.endsWith("/")
        ) {
            loadHome();
        }

        if (page.includes("dashboard.html")) {
            loadDashboard();
        }

        if (page.includes("history.html")) {
            loadHistory();
        }

    }
);


/* =====================================
   HOME
===================================== */

function loadHome()
{
    fetchLatest();

    setInterval(
        fetchLatest,
        5000
    );
}


async function fetchLatest()
{
    try {

        const response =
            await fetch(
                SERVER_URL + "/data"
            );

        const data =
            await response.json();

        updateHomeValue(data);

        updateGlobalDeviceStatus(data);

    }
    catch(error) {

        console.log(
            "Server disconnected:",
            error
        );

        updateOfflineStatus();

    }
}


/* =====================================
   HOME VALUES
===================================== */

function updateHomeValue(data)
{
    const temperature =
        document.getElementById("temperature");

    const humidity =
        document.getElementById("humidity");

    const fan =
        document.getElementById("fan");

    const alarm =
        document.getElementById("alarm");

    const sensorStatus =
        document.getElementById("sensorStatus");


    if (temperature && data.temperature !== undefined)
    {
        temperature.innerHTML =
            Number(data.temperature).toFixed(2)
            + " °C";
    }


    if (humidity && data.humidity !== undefined)
    {
        humidity.innerHTML =
            Number(data.humidity).toFixed(2)
            + " %";
    }


    if (fan)
    {
        fan.innerHTML =
            data.fan ? "ON" : "OFF";
    }


    if (alarm)
    {
        alarm.innerHTML =
            data.buzzer ? "ON" : "OFF";
    }


    if (sensorStatus)
    {
        sensorStatus.innerHTML =
            "🟢 AHT30 Connected";
    }


    updateEnvironmentState(data);
}


/* =====================================
   DEVICE ONLINE / OFFLINE
===================================== */

function isDeviceOnline(data)
{
    if (
        !data ||
        !data.lastUpdate
    )
    {
        return false;
    }

    return (
        Date.now() - Number(data.lastUpdate)
        < 15000
    );
}


function updateGlobalDeviceStatus(data)
{
    const online =
        isDeviceOnline(data);

    lastReceiveTime =
        online
        ? Number(data.lastUpdate)
        : 0;


    updateConnectionStatus(online);

    updateDashboardStatus(online);

    updateHistoryStatus(online);

}


/* =====================================
   INDEX STATUS
===================================== */

function updateConnectionStatus(online)
{
    const serverStatus =
        document.getElementById(
            "serverStatus"
        );

    const deviceStatus =
        document.getElementById(
            "deviceStatus"
        );

    const espStatus =
        document.getElementById(
            "espStatus"
        );

    const lastSeen =
        document.getElementById(
            "lastSeen"
        );


    if (serverStatus)
    {
        serverStatus.innerHTML =
            online
            ? "🟢 ESP32 Connected"
            : "🔴 ESP32 Offline";
    }


    if (deviceStatus)
    {
        deviceStatus.innerHTML =
            online
            ?
            `<i class="fa-solid fa-circle online"></i>
             ESP32 Online`
            :
            `<i class="fa-solid fa-circle"></i>
             ESP32 Offline`;
    }


    if (espStatus)
    {
        espStatus.innerHTML =
            online
            ? "🟢 Online"
            : "🔴 Offline";
    }


    if (lastSeen)
    {
        lastSeen.innerHTML =
            online
            ?
            "Last update: "
            + new Date(
                lastReceiveTime
            ).toLocaleTimeString()
            :
            "No data received";
    }
}


/* =====================================
   ENVIRONMENT STATUS
===================================== */

function updateEnvironmentState(data)
{
    const tempState =
        document.getElementById(
            "tempState"
        );

    const humState =
        document.getElementById(
            "humState"
        );


    if (tempState)
    {
        if (Number(data.temperature) >= 35)
        {
            tempState.innerHTML =
                "⚠ High Temperature";

            tempState.className =
                "warning";
        }
        else
        {
            tempState.innerHTML =
                "Normal";

            tempState.className =
                "normal";
        }
    }


    if (humState)
    {
        if (
            Number(data.humidity) < 40 ||
            Number(data.humidity) > 80
        )
        {
            humState.innerHTML =
                "⚠ Abnormal";

            humState.className =
                "warning";
        }
        else
        {
            humState.innerHTML =
                "Normal";

            humState.className =
                "normal";
        }
    }
}


/* =====================================
   DASHBOARD
===================================== */

function loadDashboard()
{
    createRealtimeCharts();

    connectSSE();
}


/* =====================================
   REALTIME CHART
===================================== */

function createRealtimeCharts()
{
    const tempCanvas =
        document.getElementById(
            "tempChart"
        );

    const humCanvas =
        document.getElementById(
            "humidityChart"
        );


    if (!tempCanvas || !humCanvas)
        return;


    tempChart =
        new Chart(
            tempCanvas,
            {
                type: "line",

                data: {
                    labels: [],

                    datasets: [
                        {
                            label:
                                "Temperature (°C)",

                            data: [],

                            borderWidth: 2,

                            tension: 0.3
                        }
                    ]
                },

                options: {
                    responsive: true,

                    maintainAspectRatio: false,

                    animation: false,

                    scales: {
                        x: {
                            ticks: {
                                maxTicksLimit: 10
                            }
                        }
                    }
                }
            }
        );


    humidityChart =
        new Chart(
            humCanvas,
            {
                type: "line",

                data: {
                    labels: [],

                    datasets: [
                        {
                            label:
                                "Humidity (%)",

                            data: [],

                            borderWidth: 2,

                            tension: 0.3
                        }
                    ]
                },

                options: {
                    responsive: true,

                    maintainAspectRatio: false,

                    animation: false,

                    scales: {
                        x: {
                            ticks: {
                                maxTicksLimit: 10
                            }
                        }
                    }
                }
            }
        );
}


/* =====================================
   SSE
===================================== */

function connectSSE()
{
    const source =
        new EventSource(
            SERVER_URL + "/events"
        );


    source.onmessage =
        function(event)
        {
            const data =
                JSON.parse(
                    event.data
                );


            if (
                data.lastUpdate
            )
            {
                lastReceiveTime =
                    Number(data.lastUpdate);
            }


            updateRealtimeChart(data);

            updateDeviceStatus(data);

            updateGlobalDeviceStatus(data);
        };


    source.onerror =
        function()
        {
            console.log(
                "SSE connection lost"
            );

            updateDashboardStatus(false);
        };
}


/* =====================================
   REALTIME CHART UPDATE
===================================== */

function updateRealtimeChart(data)
{
    const time =
        new Date(
            data.lastUpdate ||
            Date.now()
        ).toLocaleTimeString(
            "vi-VN",
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );


    if (tempChart)
    {
        tempChart.data.labels.push(time);

        tempChart.data.datasets[0]
            .data.push(
                Number(data.temperature)
            );


        if (
            tempChart.data.labels.length > 30
        )
        {
            tempChart.data.labels.shift();

            tempChart.data.datasets[0]
                .data.shift();
        }


        tempChart.update();
    }


    if (humidityChart)
    {
        humidityChart.data.labels.push(time);

        humidityChart.data.datasets[0]
            .data.push(
                Number(data.humidity)
            );


        if (
            humidityChart.data.labels.length > 30
        )
        {
            humidityChart.data.labels.shift();

            humidityChart.data.datasets[0]
                .data.shift();
        }


        humidityChart.update();
    }
}


/* =====================================
   DASHBOARD VALUES
===================================== */

function updateDeviceStatus(data)
{
    const temp =
        document.getElementById(
            "dashboardTemp"
        );

    const hum =
        document.getElementById(
            "dashboardHum"
        );

    const fan =
        document.getElementById(
            "fanStatus"
        );

    const alarm =
        document.getElementById(
            "alarmStatus"
        );

    const update =
        document.getElementById(
            "lastUpdate"
        );


    if (temp)
    {
        temp.innerHTML =
            Number(data.temperature)
                .toFixed(2)
            + " °C";
    }


    if (hum)
    {
        hum.innerHTML =
            Number(data.humidity)
                .toFixed(2)
            + " %";
    }


    if (fan)
    {
        fan.innerHTML =
            data.fan
            ? "🟢 ON"
            : "⚪ OFF";
    }


    if (alarm)
    {
        alarm.innerHTML =
            data.buzzer
            ? "🔴 ON"
            : "⚪ OFF";
    }


    if (update)
    {
        update.innerHTML =
            new Date(
                data.lastUpdate ||
                Date.now()
            ).toLocaleTimeString();
    }
}


/* =====================================
   DASHBOARD STATUS
===================================== */

function updateDashboardStatus(online)
{
    const statusBox =
        document.getElementById(
            "dashboardServerStatus"
        );

    const realtime =
        document.getElementById(
            "espRealtime"
        );

    const stream =
        document.getElementById(
            "streamStatus"
        );

    const device =
        document.getElementById(
            "dashboardDeviceStatus"
        );

    const lastSeen =
        document.getElementById(
            "dashboardLastSeen"
        );


    if (statusBox)
    {
        statusBox.innerHTML =
            online
            ? "🟢 Receiving data"
            : "🔴 Connection lost";
    }


    if (realtime)
    {
        realtime.innerHTML =
            online
            ? "🟢 Online"
            : "🔴 Offline";
    }


    if (stream)
    {
        stream.innerHTML =
            online
            ? "🟢 Active"
            : "🔴 Stopped";
    }


    if (device)
    {
        device.innerHTML =
            online
            ?
            `<i class="fa-solid fa-circle online"></i>
             ESP32 Online`
            :
            `<i class="fa-solid fa-circle"></i>
             ESP32 Offline`;
    }


    if (lastSeen)
    {
        lastSeen.innerHTML =
            online
            ?
            "Last update: "
            + new Date(
                lastReceiveTime
            ).toLocaleTimeString()
            :
            "No data received";
    }
}


/* =====================================
   HISTORY STATUS
===================================== */

function updateHistoryStatus(online)
{
    const status =
        document.getElementById(
            "historyDeviceStatus"
        );

    const time =
        document.getElementById(
            "historyLastSeen"
        );


    if (!status)
        return;


    status.innerHTML =
        online
        ?
        `<i class="fa-solid fa-circle online"></i>
         ESP32 Online`
        :
        `<i class="fa-solid fa-circle"></i>
         ESP32 Offline`;


    if (time)
    {
        time.innerHTML =
            online
            ?
            "Last update: "
            + new Date(
                lastReceiveTime
            ).toLocaleTimeString()
            :
            "No data received";
    }
}


/* =====================================
   OFFLINE
===================================== */

function updateOfflineStatus()
{
    updateConnectionStatus(false);

    updateDashboardStatus(false);

    updateHistoryStatus(false);
}


/* =====================================
   HISTORY
===================================== */

async function loadHistory()
{
    try
    {
        const response =
            await fetch(
                SERVER_URL + "/history"
            );

        const data =
            await response.json();


        createHistoryChart(data);

        createHistoryTable(data);

        calculatePrediction(data);


        // lấy trạng thái ESP32
        const latestResponse =
            await fetch(
                SERVER_URL + "/data"
            );

        const latest =
            await latestResponse.json();


        updateGlobalDeviceStatus(
            latest
        );

    }
    catch(error)
    {
        console.log(
            "History loading error:",
            error
        );
    }
}


/* =====================================
   HISTORY CHART
===================================== */

function createHistoryChart(data)
{
    const canvas =
        document.getElementById(
            "historyChart"
        );


    if (!canvas)
        return;


    const labels =
        data.map(
            item => item.date
        );


    const temperatures =
        data.map(
            item =>
                Number(
                    item.avg_temperature
                )
        );


    const humidities =
        data.map(
            item =>
                Number(
                    item.avg_humidity
                )
        );


    historyChart =
        new Chart(
            canvas,
            {
                type: "line",

                data: {

                    labels: labels,

                    datasets: [

                        {
                            label:
                                "Temperature Average (°C)",

                            data:
                                temperatures,

                            borderWidth: 2,

                            tension: 0.3
                        },

                        {
                            label:
                                "Humidity Average (%)",

                            data:
                                humidities,

                            borderWidth: 2,

                            tension: 0.3
                        }

                    ]
                },

                options: {

                    responsive: true,

                    maintainAspectRatio: false,

                    animation: false,

                    scales: {

                        x: {

                            ticks: {
                                maxTicksLimit: 10
                            }

                        }

                    }

                }
            }
        );
}


/* =====================================
   HISTORY TABLE
===================================== */

function createHistoryTable(data)
{
    const table =
        document.getElementById(
            "historyTable"
        );


    if (!table)
        return;


    table.innerHTML = "";


    data
        .slice()
        .reverse()
        .forEach(
            item =>
            {
                table.innerHTML += `
                    <tr>

                        <td>
                            ${item.date}
                        </td>

                        <td>
                            ${Number(
                                item.avg_temperature
                            ).toFixed(2)}
                            °C
                        </td>

                        <td>
                            ${Number(
                                item.avg_humidity
                            ).toFixed(2)}
                            %
                        </td>

                    </tr>
                `;
            }
        );
}


/* =====================================
   PREDICTION
===================================== */

function calculatePrediction(data)
{
    if (data.length < 3)
        return;


    const tempValues =
        data.map(
            item =>
                Number(
                    item.avg_temperature
                )
        );


    const humValues =
        data.map(
            item =>
                Number(
                    item.avg_humidity
                )
        );


    const predictedTemp =
        linearPrediction(
            tempValues
        );


    const predictedHum =
        linearPrediction(
            humValues
        );


    const tempElement =
        document.getElementById(
            "predictTemp"
        );


    const humElement =
        document.getElementById(
            "predictHum"
        );


    if (tempElement)
    {
        tempElement.innerHTML =
            predictedTemp.toFixed(2)
            + " °C";
    }


    if (humElement)
    {
        humElement.innerHTML =
            predictedHum.toFixed(2)
            + " %";
    }
}


/* =====================================
   LINEAR PREDICTION
===================================== */

function linearPrediction(values)
{
    const n =
        values.length;


    let xSum = 0;
    let ySum = 0;
    let xySum = 0;
    let xSquareSum = 0;


    for (
        let i = 0;
        i < n;
        i++
    )
    {
        xSum += i;

        ySum += values[i];

        xySum +=
            i * values[i];

        xSquareSum +=
            i * i;
    }


    const denominator =
        n * xSquareSum -
        xSum * xSum;


    if (denominator === 0)
        return values[n - 1];


    const slope =
        (
            n * xySum -
            xSum * ySum
        )
        /
        denominator;


    const intercept =
        (
            ySum -
            slope * xSum
        )
        /
        n;


    return (
        slope * n +
        intercept
    );
}


/* =====================================
   PERIODIC ONLINE CHECK
===================================== */

setInterval(
    async () =>
    {
        try
        {
            const response =
                await fetch(
                    SERVER_URL + "/data"
                );


            const data =
                await response.json();


            updateGlobalDeviceStatus(
                data
            );

        }
        catch(error)
        {
            updateOfflineStatus();
        }

    },
    5000
);