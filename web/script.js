/* ============================================
   SMART ENVIRONMENT MONITORING
   ESP32 + AHT30 + PostgreSQL + Render

   WEB:
   https://dht22-thuctap.onrender.com
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


/*
 * Lưu thời gian thực của từng điểm dữ liệu.
 * Chỉ phục vụ việc hiển thị trục X.
 */
let realtimeTimestamps = [];


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


        /*
         * Xóa dữ liệu cũ trước khi nạp lại.
         */
        realtimeTimestamps = [];


        data.forEach(
            record =>
            {
                addRealtimePoint(
                    record,
                    false
                );
            }
        );


        /*
         * Cập nhật lại trục thời gian
         * sau khi nạp toàn bộ 2 giờ dữ liệu.
         */
        updateRealtimeXAxis();


        if (tempChart)
        {
            tempChart.update();
        }


        if (humidityChart)
        {
            humidityChart.update();
        }

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


    if (!tempChart)
    {
        tempChart =
            new Chart(
                tempCanvas,
                {

                    type: "line",

                    data:
                    {
                        labels: [],

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
                            mode: "index",

                            intersect: false
                        },

                        scales:
                        {
                            x:
                            {
                                ticks:
                                {
                                    /*
                                     * Các mốc thời gian
                                     * sẽ được xử lý riêng
                                     * bằng updateRealtimeXAxis().
                                     */
                                    autoSkip: false,

                                    maxRotation: 0,

                                    minRotation: 0
                                }
                            }
                        }
                    }

                }
            );
    }


    if (!humidityChart)
    {
        humidityChart =
            new Chart(
                humCanvas,
                {

                    type: "line",

                    data:
                    {
                        labels: [],

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
                            mode: "index",

                            intersect: false
                        },

                        scales:
                        {
                            x:
                            {
                                ticks:
                                {
                                    autoSkip: false,

                                    maxRotation: 0,

                                    minRotation: 0
                                }
                            }
                        }
                    }

                }
            );
    }
}


/* =====================================================
   UPDATE REALTIME X AXIS
   2 GIỜ = 6 KHOẢNG × 20 PHÚT
===================================================== */

function updateRealtimeXAxis()
{
    if (
        realtimeTimestamps.length === 0
    )
    {
        return;
    }


    /*
     * Thời gian đầu và cuối của dữ liệu
     */
    const firstTime =
        realtimeTimestamps[0].getTime();

    const lastTime =
        realtimeTimestamps[
            realtimeTimestamps.length - 1
        ].getTime();


    /*
     * Khoảng thời gian hiển thị:
     *
     * 2 giờ = 120 phút
     *
     * 6 khoảng × 20 phút
     */
    const totalDuration =
        2 * 60 * 60 * 1000;


    const interval =
        20 * 60 * 1000;


    /*
     * Mốc cuối lấy theo dữ liệu mới nhất.
     */
    const endTime =
        lastTime;


    /*
     * Mốc đầu = 2 giờ trước mốc cuối.
     */
    const startTime =
        endTime -
        totalDuration;


    /*
     * Tạo 7 mốc:
     *
     * 0
     * 20
     * 40
     * 60
     * 80
     * 100
     * 120 phút
     *
     * => 6 khoảng, mỗi khoảng 20 phút.
     */
    const tickTimes = [];


    for (
        let i = 0;
        i <= 6;
        i++
    )
    {
        tickTimes.push(
            startTime +
            i * interval
        );
    }


    /*
     * Tìm điểm dữ liệu gần nhất với
     * từng mốc thời gian.
     */
    const tickIndexes =
        tickTimes.map(
            targetTime =>
            {

                let nearestIndex = 0;

                let nearestDifference =
                    Infinity;


                realtimeTimestamps.forEach(
                    (timestamp, index) =>
                    {

                        const difference =
                            Math.abs(
                                timestamp.getTime() -
                                targetTime
                            );


                        if (
                            difference <
                            nearestDifference
                        )
                        {
                            nearestDifference =
                                difference;

                            nearestIndex =
                                index;
                        }

                    }
                );


                return nearestIndex;

            }
        );


    /*
     * Loại bỏ index trùng nhau.
     */
    const uniqueIndexes =
        [
            ...new Set(
                tickIndexes
            )
        ];


    /*
     * Hàm tạo nhãn thời gian.
     */
    const formatTime =
        timestamp =>
        {

            return timestamp.toLocaleTimeString(
                "vi-VN",
                {
                    hour: "2-digit",

                    minute: "2-digit"
                }
            );

        };


    /*
     * Cập nhật cấu hình trục X
     * cho cả hai biểu đồ.
     */

    if (tempChart)
    {
        tempChart.options.scales.x.ticks.callback =
            function(value, index)
            {

                if (
                    uniqueIndexes.includes(index)
                )
                {
                    const timestamp =
                        realtimeTimestamps[index];


                    return formatTime(
                        timestamp
                    );
                }


                return "";
            };
    }


    if (humidityChart)
    {
        humidityChart.options.scales.x.ticks.callback =
            function(value, index)
            {

                if (
                    uniqueIndexes.includes(index)
                )
                {
                    const timestamp =
                        realtimeTimestamps[index];


                    return formatTime(
                        timestamp
                    );
                }


                return "";
            };
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


    /*
     * Lưu timestamp thật.
     */
    realtimeTimestamps.push(
        timestamp
    );


    const time =
        timestamp.toLocaleTimeString(
            "vi-VN",
            {
                hour: "2-digit",

                minute: "2-digit"
            }
        );


    if (tempChart)
    {
        tempChart.data.labels.push(
            time
        );


        tempChart.data.datasets[0]
            .data.push(
                Number(
                    data.temperature
                )
            );
    }


    if (humidityChart)
    {
        humidityChart.data.labels.push(
            time
        );


        humidityChart.data.datasets[0]
            .data.push(
                Number(
                    data.humidity
                )
            );
    }


    removeOldRealtimeData();


    /*
     * Cập nhật các mốc 20 phút.
     */
    updateRealtimeXAxis();


    if (updateChart)
    {
        tempChart?.update();

        humidityChart?.update();
    }
}


/* =====================================================
   KEEP 2 HOURS
===================================================== */

function removeOldRealtimeData()
{
    const maxPoints =
        2500;


    if (tempChart)
    {
        while (
            tempChart.data.labels.length >
            maxPoints
        )
        {
            tempChart.data.labels.shift();

            tempChart.data.datasets[0]
                .data.shift();
        }
    }


    if (humidityChart)
    {
        while (
            humidityChart.data.labels.length >
            maxPoints
        )
        {
            humidityChart.data.labels.shift();

            humidityChart.data.datasets[0]
                .data.shift();
        }
    }


    /*
     * Đồng thời xóa timestamp tương ứng.
     */
    while (
        realtimeTimestamps.length >
        maxPoints
    )
    {
        realtimeTimestamps.shift();
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


        /*
         * Lấy trạng thái mới nhất của ESP32
         */

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


        /*
         * Kết nối SSE
         */

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
     * Server đã trả về dạng:
     *
     * DD/MM/YYYY
     *
     * nên không cần chuyển đổi
     * qua JavaScript Date.
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