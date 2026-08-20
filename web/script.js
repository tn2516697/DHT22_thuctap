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
        ) {
            loadHome();
        }

        else if (
            path.includes("dashboard.html")
        ) {
            loadDashboard();
        }

        else if (
            path.includes("history.html")
        ) {
            loadHistory();
        }

    }
);


/* =====================================================
   API HELPER
===================================================== */

async function apiFetch(endpoint)
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
            await apiFetch("/realtime");


        if (!Array.isArray(data))
        {
            console.error(
                "API /realtime không trả về mảng"
            );

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


        /*
         * Sau khi thêm dữ liệu xong
         * mới update biểu đồ.
         */

        if (tempChart)
        {
            tempChart.update("none");
        }


        if (humidityChart)
        {
            humidityChart.update("none");
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
        console.error(
            "Không tìm thấy canvas biểu đồ"
        );

        return;
    }


    /*
     * Nếu chart cũ tồn tại thì hủy trước.
     */

    if (tempChart)
    {
        tempChart.destroy();
        tempChart = null;
    }


    if (humidityChart)
    {
        humidityChart.destroy();
        humidityChart = null;
    }


    /* =================================================
       TEMPERATURE CHART
    ================================================= */

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

                            pointRadius: 2,

                            fill: false
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
                            type: "category",

                            ticks:
                            {
                                /*
                                 * Không để Chart.js
                                 * tự chọn mốc.
                                 */

                                autoSkip: false,

                                maxRotation: 0,

                                minRotation: 0,

                                callback:
                                    function(
                                        value,
                                        index
                                    )
                                    {
                                        return getRealtimeAxisLabel(
                                            this.chart,
                                            index
                                        );
                                    }
                            }
                        }
                    }
                }

            }
        );


    /* =================================================
       HUMIDITY CHART
    ================================================= */

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

                            pointRadius: 2,

                            fill: false
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
                            type: "category",

                            ticks:
                            {
                                autoSkip: false,

                                maxRotation: 0,

                                minRotation: 0,

                                callback:
                                    function(
                                        value,
                                        index
                                    )
                                    {
                                        return getRealtimeAxisLabel(
                                            this.chart,
                                            index
                                        );
                                    }
                            }
                        }
                    }
                }

            }
        );
}


/* =====================================================
   REALTIME AXIS LABEL
===================================================== */

/*
 * Hiển thị đúng 6 mốc trong khoảng 2 giờ.
 *
 * 2 giờ = 120 phút
 *
 * 6 mốc:
 *
 * mốc 1
 * mốc 2
 * mốc 3
 * mốc 4
 * mốc 5
 * mốc 6
 *
 * Khoảng cách giữa các mốc = 20 phút.
 *
 * Quan trọng:
 * Phần này CHỈ thay đổi cách hiển thị
 * trục thời gian.
 *
 * Không thay đổi dữ liệu thu thập.
 */

function getRealtimeAxisLabel(
    chart,
    index
)
{
    const labels =
        chart.data.labels;


    if (!labels || labels.length === 0)
    {
        return "";
    }


    /*
     * Chỉ hiển thị tối đa 6 mốc.
     */

    const total =
        labels.length;


    if (total <= 1)
    {
        return labels[index];
    }


    /*
     * Chọn 6 vị trí trải đều
     * trên toàn bộ vùng dữ liệu.
     */

    const positions = [];


    for (
        let i = 0;
        i < 6;
        i++
    )
    {
        const position =
            Math.round(
                i *
                (total - 1) /
                5
            );


        positions.push(
            position
        );
    }


    /*
     * Nếu vị trí hiện tại không phải
     * một trong 6 vị trí thì không hiện.
     */

    if (
        !positions.includes(index)
    )
    {
        return "";
    }


    /*
     * labels đã được tạo dưới dạng
     * HH:mm theo giờ Việt Nam.
     */

    return labels[index];
}


/* =====================================================
   SSE
===================================================== */

function connectSSE()
{
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
   VIETNAM TIME
===================================================== */

/*
 * Chuyển timestamp từ server sang giờ Việt Nam.
 *
 * Việt Nam:
 * UTC + 7
 *
 * Dùng Intl.DateTimeFormat để tránh
 * phụ thuộc múi giờ của máy tính người dùng.
 */

function formatVietnamTime(
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


    return new Intl.DateTimeFormat(
        "vi-VN",
        {
            timeZone: "Asia/Ho_Chi_Minh",

            hour: "2-digit",

            minute: "2-digit",

            hour12: false
        }
    ).format(date);
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
        console.warn(
            "Timestamp không hợp lệ:",
            data.timestamp
        );

        return;
    }


    /*
     * Lấy giờ Việt Nam.
     */

    const time =
        formatVietnamTime(
            timestamp
        );


    if (!time)
    {
        return;
    }


    /* =================================================
       TEMPERATURE
    ================================================= */

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


    /* =================================================
       HUMIDITY
    ================================================= */

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


    /*
     * Chỉ giữ dữ liệu trong khoảng
     * 2 giờ gần nhất theo số điểm.
     *
     * Đây KHÔNG phải thời gian thu thập.
     */

    removeOldRealtimeData();


    if (updateChart)
    {
        tempChart?.update("none");

        humidityChart?.update("none");
    }
}


/* =====================================================
   KEEP REALTIME DATA
===================================================== */

function removeOldRealtimeData()
{
    /*
     * Không xóa dữ liệu quá sớm.
     *
     * ESP32 hiện tại gửi dữ liệu mỗi 3 giây.
     *
     * 2 giờ:
     *
     * 7200 / 3 = 2400 điểm
     *
     * Cho phép 2500 điểm để giữ gần 2 giờ.
     */

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
        <
        15000
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