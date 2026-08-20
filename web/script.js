/* ============================================
   SMART ENVIRONMENT MONITORING
   ESP32 + AHT30 + PostgreSQL + Render
============================================ */


/* =====================================================
   SERVER
===================================================== */

const SERVER_URL =
    "https://dht22-thuctap.onrender.com";


/* =====================================================
   GLOBAL
===================================================== */

let tempChart = null;
let humidityChart = null;
let historyChart = null;

let eventSource = null;

let lastReceiveTime = 0;


/* =====================================================
   CONSTANT
===================================================== */

// 2 giờ = 120 phút
const REALTIME_WINDOW = 2 * 60 * 60 * 1000;

// Mỗi mốc cách nhau 20 phút
const REALTIME_TICK_INTERVAL = 20 * 60 * 1000;


/* =====================================================
   PAGE DETECTION
===================================================== */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        const path =
            window.location.pathname;


        if (
            path === "/" ||
            path.includes("index.html")
        )
        {
            loadHome();
        }

        else if (
            path.includes("dashboard.html")
        )
        {
            loadDashboard();
        }

        else if (
            path.includes("history.html")
        )
        {
            loadHistory();
        }

    }
);


/* =====================================================
   API HELPER
===================================================== */

async function apiFetch(
    endpoint
)
{
    const response =
        await fetch(
            SERVER_URL + endpoint,
            {
                cache: "no-store"
            }
        );


    if (!response.ok)
    {
        throw new Error(
            `HTTP ${response.status}`
        );
    }


    return response.json();
}


/* =====================================================
   INDEX
===================================================== */

function loadHome()
{
    connectSSE();
}


/* =====================================================
   DASHBOARD
===================================================== */

async function loadDashboard()
{
    createRealtimeCharts();

    await loadRealtimeHistory();

    connectSSE();
}


/* =====================================================
   LOAD REALTIME HISTORY
===================================================== */

async function loadRealtimeHistory()
{
    try
    {
        const data =
            await apiFetch(
                "/realtime"
            );


        if (!Array.isArray(data))
        {
            return;
        }


        data.forEach(
            record =>
            {
                addRealtimePoint(
                    record,
                    false
                );
            }
        );


        updateRealtimeChartWindow();


        tempChart?.update();
        humidityChart?.update();

    }
    catch(error)
    {
        console.error(
            "Không thể tải dữ liệu realtime:",
            error
        );
    }
}


/* =====================================================
   FORMAT REALTIME TIME
   HIỂN THỊ GIỜ:PHÚT THEO THỜI GIAN THỰC
===================================================== */

function formatRealtimeTime(
    timestamp
)
{
    const date =
        new Date(timestamp);


    if (
        isNaN(
            date.getTime()
        )
    )
    {
        return "";
    }


    return date.toLocaleTimeString(
        "vi-VN",
        {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }
    );
}


/* =====================================================
   CREATE REALTIME CHARTS
===================================================== */

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


    if (
        !tempCanvas ||
        !humCanvas
    )
    {
        return;
    }


    /* =================================================
       TEMPERATURE
    ================================================= */

    if (!tempChart)
    {
        tempChart =
            new Chart(
                tempCanvas,
                {

                    type: "line",

                    data:
                    {
                        datasets:
                        [
                            {
                                label:
                                    "Nhiệt độ (°C)",

                                data: [],

                                borderWidth: 2,

                                tension: 0.3,

                                pointRadius: 2
                            }
                        ]
                    },

                    options:
                    {
                        responsive: true,

                        maintainAspectRatio: false,

                        animation: false,

                        interaction:
                        {
                            mode: "nearest",

                            intersect: false
                        },

                        scales:
                        {
                            x:
                            {
                                type: "linear",

                                min:
                                    Date.now()
                                    -
                                    REALTIME_WINDOW,

                                max:
                                    Date.now(),

                                grid:
                                {
                                    display: true
                                },

                                ticks:
                                {
                                    autoSkip: false,

                                    maxTicksLimit: 7,

                                    callback:
                                        function(
                                            value
                                        )
                                        {
                                            return formatRealtimeTime(
                                                value
                                            );
                                        }
                                }
                            }
                        }
                    }

                }
            );
    }


    /* =================================================
       HUMIDITY
    ================================================= */

    if (!humidityChart)
    {
        humidityChart =
            new Chart(
                humCanvas,
                {

                    type: "line",

                    data:
                    {
                        datasets:
                        [
                            {
                                label:
                                    "Độ ẩm (%)",

                                data: [],

                                borderWidth: 2,

                                tension: 0.3,

                                pointRadius: 2
                            }
                        ]
                    },

                    options:
                    {
                        responsive: true,

                        maintainAspectRatio: false,

                        animation: false,

                        interaction:
                        {
                            mode: "nearest",

                            intersect: false
                        },

                        scales:
                        {
                            x:
                            {
                                type: "linear",

                                min:
                                    Date.now()
                                    -
                                    REALTIME_WINDOW,

                                max:
                                    Date.now(),

                                grid:
                                {
                                    display: true
                                },

                                ticks:
                                {
                                    autoSkip: false,

                                    maxTicksLimit: 7,

                                    callback:
                                        function(
                                            value
                                        )
                                        {
                                            return formatRealtimeTime(
                                                value
                                            );
                                        }
                                }
                            }
                        }
                    }

                }
            );
    }


    updateRealtimeChartWindow();
}


/* =====================================================
   UPDATE REALTIME CHART WINDOW
===================================================== */

function updateRealtimeChartWindow()
{
    const now =
        Date.now();


    const startTime =
        now -
        REALTIME_WINDOW;


    /*
     * Trục X luôn đúng 2 giờ gần nhất.
     *
     * Ví dụ:
     *
     * 15:00
     * 15:20
     * 15:40
     * 16:00
     * 16:20
     * 16:40
     * 17:00
     *
     * = 7 mốc
     */

    if (tempChart)
    {
        tempChart.options.scales.x.min =
            startTime;

        tempChart.options.scales.x.max =
            now;

        tempChart.options.scales.x.ticks.stepSize =
            REALTIME_TICK_INTERVAL;
    }


    if (humidityChart)
    {
        humidityChart.options.scales.x.min =
            startTime;

        humidityChart.options.scales.x.max =
            now;

        humidityChart.options.scales.x.ticks.stepSize =
            REALTIME_TICK_INTERVAL;
    }
}


/* =====================================================
   SSE
===================================================== */

function connectSSE()
{
    /*
     * Không tạo nhiều SSE connection
     * trên cùng một trang.
     */

    if (eventSource)
    {
        return;
    }


    eventSource =
        new EventSource(
            SERVER_URL + "/events"
        );


    eventSource.onopen =
        () =>
        {
            console.log(
                "✅ SSE connected to Render"
            );
        };


    eventSource.onmessage =
        event =>
        {
            try
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
                        Number(
                            data.lastUpdate
                        );
                }


                updateDashboardValues(
                    data
                );


                updateGlobalDeviceStatus(
                    data
                );


                if (
                    tempChart ||
                    humidityChart
                )
                {
                    addRealtimePoint(
                        data,
                        true
                    );
                }

            }
            catch(error)
            {
                console.error(
                    "SSE data error:",
                    error
                );
            }
        };


    eventSource.onerror =
        () =>
        {
            console.warn(
                "⚠ SSE mất kết nối"
            );


            updateGlobalDeviceStatus(
                {
                    lastUpdate:
                        lastReceiveTime
                }
            );
        };
}


/* =====================================================
   REALTIME POINT
===================================================== */

function addRealtimePoint(
    data,
    updateChart = true
)
{
    if (
        !data.timestamp
    )
    {
        return;
    }


    const timestamp =
        new Date(
            data.timestamp
        );


    if (
        isNaN(
            timestamp.getTime()
        )
    )
    {
        return;
    }


    const timestampValue =
        timestamp.getTime();


    /*
     * Không thêm điểm trùng timestamp.
     */

    if (tempChart)
    {
        const tempData =
            tempChart.data.datasets[0].data;


        const exists =
            tempData.some(
                point =>
                    Number(point.x) ===
                    timestampValue
            );


        if (!exists)
        {
            tempData.push(
                {
                    x: timestampValue,

                    y:
                        Number(
                            data.temperature
                        )
                }
            );
        }
    }


    if (humidityChart)
    {
        const humidityData =
            humidityChart.data.datasets[0].data;


        const exists =
            humidityData.some(
                point =>
                    Number(point.x) ===
                    timestampValue
            );


        if (!exists)
        {
            humidityData.push(
                {
                    x: timestampValue,

                    y:
                        Number(
                            data.humidity
                        )
                }
            );
        }
    }


    removeOldRealtimeData();


    updateRealtimeChartWindow();


    if (updateChart)
    {
        tempChart?.update();

        humidityChart?.update();
    }
}


/* =====================================================
   KEEP ONLY LAST 2 HOURS
===================================================== */

function removeOldRealtimeData()
{
    const cutoff =
        Date.now()
        -
        REALTIME_WINDOW;


    if (tempChart)
    {
        tempChart.data.datasets[0].data =
            tempChart.data.datasets[0].data.filter(
                point =>
                    Number(point.x) >= cutoff
            );
    }


    if (humidityChart)
    {
        humidityChart.data.datasets[0].data =
            humidityChart.data.datasets[0].data.filter(
                point =>
                    Number(point.x) >= cutoff
            );
    }
}


/* =====================================================
   DASHBOARD VALUES
===================================================== */

function updateDashboardValues(
    data
)
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
        temp.textContent =
            Number(
                data.temperature
            ).toFixed(2)
            +
            " °C";
    }


    if (hum)
    {
        hum.textContent =
            Number(
                data.humidity
            ).toFixed(2)
            +
            " %";
    }


    if (fan)
    {
        fan.textContent =
            data.fan
            ? "🟢 BẬT"
            : "⚪ TẮT";
    }


    if (alarm)
    {
        alarm.textContent =
            data.buzzer
            ? "🔴 BẬT"
            : "⚪ TẮT";
    }


    if (update)
    {
        update.textContent =
            getRelativeTime(
                lastReceiveTime
            );
    }
}


/* =====================================================
   DEVICE ONLINE
===================================================== */

function isDeviceOnline(
    data
)
{
    if (
        !data ||
        !data.lastUpdate
    )
    {
        return false;
    }


    return (
        Date.now() -
        Number(data.lastUpdate)
        < 15000
    );
}


/* =====================================================
   GLOBAL STATUS
===================================================== */

function updateGlobalDeviceStatus(
    data
)
{
    if (
        data &&
        data.lastUpdate
    )
    {
        lastReceiveTime =
            Number(
                data.lastUpdate
            );
    }


    const online =
        isDeviceOnline(data);


    updateIndexStatus(
        online
    );


    updateDashboardStatus(
        online
    );


    updateHistoryStatus(
        online
    );


    if (data)
    {
        updateDashboardValues(
            data
        );
    }
}


/* =====================================================
   INDEX STATUS
===================================================== */

function updateIndexStatus(
    online
)
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


    const sensorStatus =
        document.getElementById(
            "sensorStatus"
        );


    const lastSeen =
        document.getElementById(
            "lastSeen"
        );


    if (serverStatus)
    {
        serverStatus.textContent =
            online
            ? "🟢 ESP32 Trực tuyến"
            : "🔴 ESP32 Ngoại tuyến";
    }


    if (deviceStatus)
    {
        deviceStatus.innerHTML =
            online
            ?
            `<i class="fa-solid fa-circle online"></i>
             ESP32 Trực tuyến`
            :
            `<i class="fa-solid fa-circle"></i>
             ESP32 Ngoại tuyến`;
    }


    if (espStatus)
    {
        espStatus.textContent =
            online
            ? "🟢 Trực tuyến"
            : "🔴 Ngoại tuyến";
    }


    if (sensorStatus)
    {
        sensorStatus.textContent =
            online
            ? "🟢 AHT30 đang hoạt động"
            : "🔴 Chưa kết nối";
    }


    if (lastSeen)
    {
        lastSeen.textContent =
            online
            ? "Cập nhật: " +
              getRelativeTime(
                  lastReceiveTime
              )
            : "Chưa nhận dữ liệu";
    }
}


/* =====================================================
   DASHBOARD STATUS
===================================================== */

function updateDashboardStatus(
    online
)
{
    const status =
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


    if (status)
    {
        status.textContent =
            online
            ? "🟢 Đang nhận dữ liệu"
            : "🔴 Mất kết nối";
    }


    if (realtime)
    {
        realtime.textContent =
            online
            ? "🟢 Trực tuyến"
            : "🔴 Ngoại tuyến";
    }


    if (stream)
    {
        stream.textContent =
            online
            ? "🟢 Đang hoạt động"
            : "🔴 Đã dừng";
    }


    if (device)
    {
        device.innerHTML =
            online
            ?
            `<i class="fa-solid fa-circle online"></i>
             ESP32 Trực tuyến`
            :
            `<i class="fa-solid fa-circle"></i>
             ESP32 Ngoại tuyến`;
    }


    if (lastSeen)
    {
        lastSeen.textContent =
            online
            ? "Cập nhật: " +
              getRelativeTime(
                  lastReceiveTime
              )
            : "Chưa nhận dữ liệu";
    }
}


/* =====================================================
   HISTORY STATUS
===================================================== */

function updateHistoryStatus(
    online
)
{
    const status =
        document.getElementById(
            "historyDeviceStatus"
        );


    const time =
        document.getElementById(
            "historyLastSeen"
        );


    if (status)
    {
        status.innerHTML =
            online
            ?
            `<i class="fa-solid fa-circle online"></i>
             ESP32 Trực tuyến`
            :
            `<i class="fa-solid fa-circle"></i>
             ESP32 Ngoại tuyến`;
    }


    if (time)
    {
        time.textContent =
            online
            ? "Cập nhật: " +
              getRelativeTime(
                  lastReceiveTime
              )
            : "Chưa nhận dữ liệu";
    }
}


/* =====================================================
   HISTORY
===================================================== */

async function loadHistory()
{
    try
    {
        const data =
            await apiFetch(
                "/history"
            );


        console.log(
            "📊 Dữ liệu history:",
            data
        );


        if (
            !Array.isArray(data)
        )
        {
            throw new Error(
                "API /history không trả về mảng dữ liệu"
            );
        }


        createHistoryChart(
            data
        );


        createHistoryTable(
            data
        );


        try
        {
            const latest =
                await apiFetch(
                    "/data"
                );


            updateGlobalDeviceStatus(
                latest
            );
        }

        catch(error)
        {
            console.warn(
                "⚠ Không lấy được trạng thái thiết bị:",
                error
            );
        }


        connectSSE();

    }

    catch(error)
    {
        console.error(
            "❌ Lỗi tải lịch sử:",
            error
        );


        const table =
            document.getElementById(
                "historyTable"
            );


        if (table)
        {
            table.innerHTML = `

                <tr>

                    <td
                        colspan="3"
                        style="text-align:center;"
                    >

                        Không thể tải dữ liệu lịch sử

                    </td>

                </tr>

            `;
        }
    }
}


/* =====================================================
   HISTORY CHART
===================================================== */

function createHistoryChart(
    data
)
{
    const canvas =
        document.getElementById(
            "historyChart"
        );


    if (!canvas)
    {
        return;
    }


    const labels =
        data.map(
            item =>
                formatDate(
                    item.date
                )
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

                data:
                {
                    labels,

                    datasets:
                    [

                        {
                            label:
                                "Nhiệt độ trung bình (°C)",

                            data:
                                temperatures,

                            borderWidth:
                                2,

                            tension:
                                0.3,

                            pointRadius:
                                3
                        },

                        {
                            label:
                                "Độ ẩm trung bình (%)",

                            data:
                                humidities,

                            borderWidth:
                                2,

                            tension:
                                0.3,

                            pointRadius:
                                3
                        }

                    ]
                },

                options:
                {
                    responsive:
                        true,

                    maintainAspectRatio:
                        false,

                    animation:
                        false,

                    interaction:
                    {
                        mode:
                            "index",

                        intersect:
                            false
                    },

                    plugins:
                    {
                        legend:
                        {
                            position:
                                "top"
                        }
                    },

                    scales:
                    {
                        x:
                        {
                            ticks:
                            {
                                maxTicksLimit:
                                    10
                            }
                        }
                    }
                }

            }
        );
}


/* =====================================================
   HISTORY TABLE
===================================================== */

function createHistoryTable(
    data
)
{
    const table =
        document.getElementById(
            "historyTable"
        );


    if (!table)
    {
        return;
    }


    table.innerHTML =
        "";


    data
        .slice()
        .reverse()
        .forEach(
            item =>
            {

                const row =
                    document.createElement(
                        "tr"
                    );


                row.innerHTML = `

                    <td>
                        ${formatDate(
                            item.date
                        )}
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

                `;


                table.appendChild(
                    row
                );

            }
        );
}


/* =====================================================
   TIME
===================================================== */

function getRelativeTime(
    timestamp
)
{
    if (!timestamp)
    {
        return "--";
    }


    const elapsed =
        Math.floor(
            (
                Date.now() -
                Number(timestamp)
            )
            /
            1000
        );


    if (elapsed < 2)
    {
        return "Vừa cập nhật";
    }


    if (elapsed < 60)
    {
        return (
            elapsed +
            " giây trước"
        );
    }


    const minutes =
        Math.floor(
            elapsed / 60
        );


    return (
        minutes +
        " phút trước"
    );
}


/* =====================================================
   DATE
===================================================== */

function formatDate(
    date
)
{
    if (!date)
    {
        return "";
    }


    /*
     * Server trả về:
     *
     * DD/MM/YYYY
     *
     * nên giữ nguyên.
     */

    return String(date);
}


/* =====================================================
   RUNNING STATUS UPDATE
===================================================== */

setInterval(
    () =>
    {

        if (!lastReceiveTime)
        {
            return;
        }


        const online =
            (
                Date.now() -
                lastReceiveTime
            )
            <
            15000;


        updateIndexStatus(
            online
        );


        updateDashboardStatus(
            online
        );


        updateHistoryStatus(
            online
        );


        const lastUpdate =
            document.getElementById(
                "lastUpdate"
            );


        if (lastUpdate)
        {
            lastUpdate.textContent =
                getRelativeTime(
                    lastReceiveTime
                );
        }


        /*
         * Cập nhật cửa sổ 2 giờ.
         *
         * Việc này chỉ thay đổi
         * trục thời gian, KHÔNG
         * thay đổi dữ liệu cảm biến.
         */

        if (
            tempChart ||
            humidityChart
        )
        {
            updateRealtimeChartWindow();

            tempChart?.update("none");

            humidityChart?.update("none");
        }

    },
    1000
);


/* =====================================================
   CLOSE SSE WHEN PAGE LEAVES
===================================================== */

window.addEventListener(
    "beforeunload",
    () =>
    {
        if (eventSource)
        {
            eventSource.close();

            eventSource =
                null;
        }
    }
);