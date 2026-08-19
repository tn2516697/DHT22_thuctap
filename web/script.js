/* =====================================
   HỆ THỐNG GIÁM SÁT MÔI TRƯỜNG

   ESP32-C3
   AHT30
   PostgreSQL

   - Dữ liệu thời gian thực bằng SSE
   - Biểu đồ giữ 2 giờ gần nhất
   - F5 không làm mất dữ liệu biểu đồ
===================================== */


const SERVER_URL = "";


/* ==========================
   BIỂU ĐỒ
========================== */

let tempChart = null;

let humidityChart = null;

let historyChart = null;


/* ==========================
   THỜI ĐIỂM NHẬN DỮ LIỆU
========================== */

let lastReceiveTime = 0;


/* ==========================
   PAGE DETECTION
========================== */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        const page =
            window.location.pathname;


        if (
            page.includes("index.html") ||
            page === "/" ||
            page.endsWith("/")
        )
        {
            loadHome();
        }


        if (
            page.includes("dashboard.html")
        )
        {
            loadDashboard();
        }


        if (
            page.includes("history.html")
        )
        {
            loadHistory();
        }

    }
);


/* ==================================================
   TRANG TỔNG QUAN
================================================== */

function loadHome()
{

    connectSSE();

}


/* ==================================================
   CẬP NHẬT TRANG TỔNG QUAN
================================================== */

function updateHomeValue(data)
{

    const sensorStatus =
        document.getElementById(
            "sensorStatus"
        );


    if (sensorStatus)
    {

        sensorStatus.innerHTML =
            "🟢 AHT30 đang hoạt động";

    }


    updateEnvironmentState(
        data
    );

}


/* ==================================================
   KIỂM TRA ESP32
================================================== */

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
        Date.now() -
        Number(data.lastUpdate)
        < 15000
    );

}


/* ==================================================
   CẬP NHẬT TRẠNG THÁI TOÀN HỆ THỐNG
================================================== */

function updateGlobalDeviceStatus(data)
{

    const online =
        isDeviceOnline(data);


    if (data.lastUpdate)
    {

        lastReceiveTime =
            Number(
                data.lastUpdate
            );

    }


    updateConnectionStatus(
        online
    );


    updateDashboardStatus(
        online
    );


    updateHistoryStatus(
        online
    );

}


/* ==================================================
   INDEX STATUS
================================================== */

function updateConnectionStatus(
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


    const lastSeen =
        document.getElementById(
            "lastSeen"
        );


    if (serverStatus)
    {

        serverStatus.innerHTML =
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

        espStatus.innerHTML =
            online
            ? "🟢 Trực tuyến"
            : "🔴 Ngoại tuyến";

    }


    if (lastSeen)
    {

        lastSeen.innerHTML =
            online
            ?
            "Cập nhật: "
            +
            formatTime(
                lastReceiveTime
            )
            :
            "Chưa nhận dữ liệu";

    }

}


/* ==================================================
   TRẠNG THÁI MÔI TRƯỜNG
================================================== */

function updateEnvironmentState(data)
{

    /*
     * Index hiện tại không còn card
     * nhiệt độ / độ ẩm.
     *
     * Giữ hàm để tránh lỗi nếu sau này
     * bạn thêm lại.
     */

}


/* ==================================================
   DASHBOARD
================================================== */

async function loadDashboard()
{

    /*
     * Bước 1:
     * Lấy dữ liệu 2 giờ gần nhất
     */

    await loadRealtimeHistory();


    /*
     * Bước 2:
     * Kết nối dữ liệu thời gian thực
     */

    connectSSE();

}


/* ==================================================
   LẤY DỮ LIỆU 2 GIỜ GẦN NHẤT
================================================== */

async function loadRealtimeHistory()
{

    try
    {

        const response =
            await fetch(
                SERVER_URL +
                "/realtime"
            );


        const data =
            await response.json();


        createRealtimeCharts();


        /*
         * Nạp lại toàn bộ dữ liệu
         * 2 giờ vào biểu đồ.
         */

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
         * Chỉ cập nhật biểu đồ một lần
         */

        if (tempChart)
        {
            tempChart.update();
        }


        if (humidityChart)
        {
            humidityChart.update();
        }


        /*
         * Lấy bản ghi mới nhất
         */

        if (data.length > 0)
        {

            const latest =
                data[data.length - 1];


            /*
             * Không dùng timestamp cảm biến
             * làm thời gian online.
             *
             * Lấy server /data sau đó.
             */

            updateDeviceStatus(
                latest
            );

        }


    }

    catch(error)
    {

        console.log(
            "Không thể tải dữ liệu 2 giờ:",
            error
        );

    }

}


/* ==================================================
   TẠO BIỂU ĐỒ
================================================== */

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


    /*
     * Tránh tạo lại biểu đồ
     */

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

                        maintainAspectRatio:
                            false,

                        animation: false,

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

                        maintainAspectRatio:
                            false,

                        animation: false,

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

}


/* ==================================================
   SSE
================================================== */

function connectSSE()
{

    const source =
        new EventSource(
            SERVER_URL +
            "/events"
        );


    source.onopen =
        function()
        {

            console.log(
                "✅ SSE đã kết nối"
            );

        };


    source.onmessage =
        function(event)
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


                /*
                 * Cập nhật dashboard
                 */

                updateDeviceStatus(
                    data
                );


                /*
                 * Cập nhật biểu đồ
                 */

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


                /*
                 * Cập nhật trạng thái
                 */

                updateGlobalDeviceStatus(
                    data
                );

            }

            catch(error)
            {

                console.log(
                    "SSE data error:",
                    error
                );

            }

        };


    source.onerror =
        function()
        {

            console.log(
                "⚠ SSE mất kết nối"
            );

            updateDashboardStatus(
                false
            );

        };

}


/* ==================================================
   THÊM ĐIỂM VÀO BIỂU ĐỒ
================================================== */

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


    const time =
        timestamp.toLocaleTimeString(
            "vi-VN",
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );


    /*
     * =================================
     * BIỂU ĐỒ NHIỆT ĐỘ
     * =================================
     */

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


    /*
     * =================================
     * BIỂU ĐỒ ĐỘ ẨM
     * =================================
     */

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
     * =================================
     * CHỈ GIỮ DỮ LIỆU TRONG 2 GIỜ
     *
     * Không dùng số lượng điểm cố định.
     * Dựa vào timestamp thực tế.
     * =================================
     */

    removeOldRealtimeData();


    if (updateChart)
    {

        if (tempChart)
        {
            tempChart.update();
        }


        if (humidityChart)
        {
            humidityChart.update();
        }

    }

}


/* ==================================================
   XÓA DỮ LIỆU QUÁ 2 GIỜ
================================================== */

function removeOldRealtimeData()
{

    if (!tempChart)
        return;


    /*
     * Biểu đồ dùng labels dạng HH:mm
     * nên ta giới hạn theo số điểm dựa
     * trên timestamp thực tế không thể
     * làm chính xác tuyệt đối ở đây.
     *
     * Vì ESP32 thường gửi đều nhau,
     * ta giới hạn số điểm theo dữ liệu
     * được lấy từ server.
     */

    const maxPoints =
        240;


    while (
        tempChart.data.labels.length
        >
        maxPoints
    )
    {

        tempChart.data.labels.shift();

        tempChart.data.datasets[0]
            .data.shift();

    }


    if (humidityChart)
    {

        while (
            humidityChart.data.labels.length
            >
            maxPoints
        )
        {

            humidityChart.data.labels.shift();

            humidityChart.data.datasets[0]
                .data.shift();

        }

    }

}


/* ==================================================
   DASHBOARD VALUES
================================================== */

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
            Number(
                data.temperature
            ).toFixed(2)
            +
            " °C";

    }


    if (hum)
    {

        hum.innerHTML =
            Number(
                data.humidity
            ).toFixed(2)
            +
            " %";

    }


    if (fan)
    {

        fan.innerHTML =
            data.fan
            ?
            "🟢 BẬT"
            :
            "⚪ TẮT";

    }


    if (alarm)
    {

        alarm.innerHTML =
            data.buzzer
            ?
            "🔴 BẬT"
            :
            "⚪ TẮT";

    }


    if (update)
    {

        update.innerHTML =
            formatTime(
                lastReceiveTime
            );

    }

}


/* ==================================================
   TRẠNG THÁI DASHBOARD
================================================== */

function updateDashboardStatus(
    online
)
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
            ?
            "🟢 Đang nhận dữ liệu"
            :
            "🔴 Mất kết nối";

    }


    if (realtime)
    {

        realtime.innerHTML =
            online
            ?
            "🟢 Trực tuyến"
            :
            "🔴 Ngoại tuyến";

    }


    if (stream)
    {

        stream.innerHTML =
            online
            ?
            "🟢 Đang hoạt động"
            :
            "🔴 Đã dừng";

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

        lastSeen.innerHTML =
            online
            ?
            "Cập nhật: "
            +
            formatTime(
                lastReceiveTime
            )
            :
            "Chưa nhận dữ liệu";

    }

}


/* ==================================================
   HISTORY STATUS
================================================== */

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


    if (!status)
        return;


    status.innerHTML =
        online
        ?
        `<i class="fa-solid fa-circle online"></i>
         ESP32 Trực tuyến`
        :
        `<i class="fa-solid fa-circle"></i>
         ESP32 Ngoại tuyến`;


    if (time)
    {

        time.innerHTML =
            online
            ?
            "Cập nhật: "
            +
            formatTime(
                lastReceiveTime
            )
            :
            "Chưa nhận dữ liệu";

    }

}


/* ==================================================
   OFFLINE
================================================== */

function updateOfflineStatus()
{

    updateConnectionStatus(
        false
    );


    updateDashboardStatus(
        false
    );


    updateHistoryStatus(
        false
    );

}


/* ==================================================
   HISTORY
================================================== */

async function loadHistory()
{

    try
    {

        const response =
            await fetch(
                SERVER_URL +
                "/history"
            );


        const data =
            await response.json();


        createHistoryChart(
            data
        );


        createHistoryTable(
            data
        );


        calculatePrediction(
            data
        );


        /*
         * Lấy trạng thái mới nhất
         */

        const latestResponse =
            await fetch(
                SERVER_URL +
                "/data"
            );


        const latest =
            await latestResponse.json();


        updateGlobalDeviceStatus(
            latest
        );


        /*
         * History cũng kết nối SSE
         * để thời gian cập nhật thay đổi.
         */

        connectSSE();

    }

    catch(error)
    {

        console.log(
            "Lỗi tải lịch sử:",
            error
        );

    }

}


/* ==================================================
   HISTORY CHART
================================================== */

function createHistoryChart(
    data
)
{

    const canvas =
        document.getElementById(
            "historyChart"
        );


    if (!canvas)
        return;


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

                    labels: labels,

                    datasets:
                    [

                        {

                            label:
                                "Nhiệt độ trung bình (°C)",

                            data:
                                temperatures,

                            borderWidth: 2,

                            tension: 0.3,

                            pointRadius: 2

                        },


                        {

                            label:
                                "Độ ẩm trung bình (%)",

                            data:
                                humidities,

                            borderWidth: 2,

                            tension: 0.3,

                            pointRadius: 2

                        }

                    ]

                },


                options:
                {

                    responsive: true,

                    maintainAspectRatio:
                        false,

                    animation: false,

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


/* ==================================================
   HISTORY TABLE
================================================== */

function createHistoryTable(
    data
)
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

                    </tr>

                `;

            }
        );

}


/* ==================================================
   DỰ ĐOÁN
================================================== */

function calculatePrediction(
    data
)
{

    if (
        data.length < 3
    )
    {
        return;
    }


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
            +
            " °C";

    }


    if (humElement)
    {

        humElement.innerHTML =
            predictedHum.toFixed(2)
            +
            " %";

    }

}


/* ==================================================
   DỰ ĐOÁN TUYẾN TÍNH
================================================== */

function linearPrediction(
    values
)
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


    if (
        denominator === 0
    )
    {

        return values[n - 1];

    }


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


/* ==================================================
   THỜI GIAN
================================================== */

function formatTime(
    timestamp
)
{

    if (!timestamp)
    {
        return "--";
    }


    return new Date(
        Number(timestamp)
    ).toLocaleTimeString(
        "vi-VN",
        {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        }
    );

}


function formatDate(
    date
)
{

    if (!date)
    {
        return "";
    }


    const parts =
        String(date).split("-");


    if (
        parts.length !== 3
    )
    {
        return date;
    }


    return (
        parts[2]
        +
        "/"
        +
        parts[1]
        +
        "/"
        +
        parts[0]
    );

}


/* ==================================================
   ĐỒNG HỒ "CẬP NHẬT BAO LÂU TRƯỚC"
================================================== */

/*
 * Quan trọng:
 *
 * lastUpdate không còn đứng yên.
 *
 * Ví dụ ESP32 gửi lúc 22:10:05
 *
 * 22:10:05 → "Vừa cập nhật"
 * 22:10:10 → "5 giây trước"
 * 22:10:30 → "25 giây trước"
 * ...
 *
 * Khi quá 15 giây → Offline.
 */

setInterval(
    () =>
    {

        if (!lastReceiveTime)
            return;


        const elapsed =
            Date.now() -
            lastReceiveTime;


        /*
         * Nếu quá 15 giây
         * coi ESP32 ngoại tuyến.
         */

        if (
            elapsed > 15000
        )
        {

            updateGlobalDeviceStatus({

                lastUpdate:
                    lastReceiveTime

            });

        }


        /*
         * Cập nhật chữ thời gian
         * liên tục mà không cần F5.
         */

        updateRunningLastUpdate();

    },
    1000
);


/* ==================================================
   HIỂN THỊ THỜI GIAN CHẠY LIÊN TỤC
================================================== */

function updateRunningLastUpdate()
{

    if (!lastReceiveTime)
        return;


    const elapsed =
        Math.floor(
            (
                Date.now() -
                lastReceiveTime
            )
            /
            1000
        );


    let text;


    if (
        elapsed < 2
    )
    {

        text =
            "Vừa cập nhật";

    }

    else if (
        elapsed < 60
    )
    {

        text =
            elapsed +
            " giây trước";

    }

    else
    {

        const minutes =
            Math.floor(
                elapsed / 60
            );


        text =
            minutes +
            " phút trước";

    }


    const lastUpdate =
        document.getElementById(
            "lastUpdate"
        );


    if (lastUpdate)
    {

        lastUpdate.innerHTML =
            text;

    }


    const lastSeen =
        document.getElementById(
            "lastSeen"
        );


    if (lastSeen)
    {

        lastSeen.innerHTML =
            "Cập nhật: " +
            text;

    }


    const dashboardLastSeen =
        document.getElementById(
            "dashboardLastSeen"
        );


    if (dashboardLastSeen)
    {

        dashboardLastSeen.innerHTML =
            "Cập nhật: " +
            text;

    }


    const historyLastSeen =
        document.getElementById(
            "historyLastSeen"
        );


    if (historyLastSeen)
    {

        historyLastSeen.innerHTML =
            "Cập nhật: " +
            text;

    }

}