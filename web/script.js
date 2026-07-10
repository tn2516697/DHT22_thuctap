const API = "";

// ==========================
// DASHBOARD
// ==========================


let tempData=[];
let humData=[];
let timeData=[];


let realtimeChart;



function loadDashboard()
{
    const ctx =
    document.getElementById("realtimeChart");

    realtimeChart =
    new Chart
    (ctx,
    {
        type:"line",
        data:
            {
                labels:timeData,
                datasets:
                [
                    {
                        label:"Temperature (°C)",
                        data:tempData
                    },

                    {
                        label:"Humidity (%)",
                        data:humData
                    }
                ]
            },

        options:
            {
                responsive:true
            }
    });

    setInterval(updateDashboard,3000);
    updateDashboard();
}

async function updateDashboard()
{
    try
    {
        let res = await fetch(API+"/latest");
        let data = await res.json();

        document.getElementById("temperature")
        .innerHTML = data.temperature+" °C";

        document.getElementById("humidity")
        .innerHTML = data.humidity+" %";

        if(data.fan==1)
        { 
            document.getElementById("fan")
            .innerHTML="ON";
        }

        else
        {
            document.getElementById("fan")
            .innerHTML="OFF";
        }

        if(data.alarm==1)
        {
            document.getElementById("alarm")
            .innerHTML="WARNING";
        }
        else
        {
            document.getElementById("alarm")
            .innerHTML="NORMAL";
        }

        tempData.push(data.temperature);
        humData.push(data.humidity);

        timeData.push
        (
            new Date(data.time)
            .toLocaleTimeString()
        );

        if(tempData.length>20)
        {
            tempData.shift();
            humData.shift();
            timeData.shift();
        }
        realtimeChart.update();
    }

    catch(err)
    {
        console.log(err);
    }
}

// ==========================
// HISTORY
// ==========================

let tempChart;
let humChart;

async function loadHistory()   
{

    try
    {
        let history = await fetch(API+"/history")
        .then(r=>r.json());

        let analytics = await fetch(API+"/analytics")
        .then(r=>r.json());

        document.getElementById("avgTemp")
        .innerHTML = analytics.avgTemp+" °C";

        document.getElementById("maxTemp")
        .innerHTML = analytics.maxTemp+" °C";

        document.getElementById("avgHum")
        .innerHTML = analytics.avgHumidity+" %";

        document.getElementById("alarmCount")
        .innerHTML = analytics.alarmCount;

        createTable(history);
        createCharts(history);
        analysis(analytics);
    }

    catch(err) { console.log(err); }

}

function createTable(data)
{
    let table="";
    data.reverse();
    data.forEach(row=>{
    table+=`

    <tr>
    <td>${row.time}</td>
    <td>${row.temperature}</td>
    <td>${row.humidity}</td>

    <td>${row.fan==1?"ON":"OFF"}
    </td>

    <td>${row.alarm==1?"WARNING":"NORMAL"}
    </td>

    </tr>
    `;

    });
    document.getElementById("historyTable")
    .innerHTML=table;
}


function createCharts(data)
{
    let labels = data.map(x=>x.time);
    let temps = data.map(x=>x.temperature);
    let hums = data.map(x=>x.humidity);

    tempChart = new Chart
    ( document.getElementById("tempChart"),
    {
        type:"line",

        data:
        {

            labels:labels,
            datasets:
            [{
                label:"Temperature",
                data:temps
            }]

        }

    });

    humChart =
    new Chart
    (document.getElementById("humChart"),
    {
        type:"line",

        data:
        {
            labels:labels,
            datasets:
            [{
                label:"Humidity",
                data:hums
            }]
        }
    });

}

function analysis(data)
{
    let text="";
    if(data.maxTemp>35)
    {
        text += "High temperature detected. Fan operated frequently. ";
    }
    else
    {
        text += "Temperature condition is stable. ";
    }

    if(data.alarmCount>0)
    {
        text += "Warning alarm happened during monitoring.";
    }
    else
    {
    text += "No abnormal events detected.";
    }

    document.getElementById("analysis")
    .innerHTML=text;

}

// ==========================
// AUTO DETECT PAGE
// ==========================

window.onload=function()
{
    if( document.getElementById("realtimeChart"))
    {
         loadDashboard();

    }

    if( document.getElementById("historyTable"))
    {
        loadHistory();
    }
}