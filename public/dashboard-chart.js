(() => {
  let fishChartInstance = null;

  function byDateAsc(a, b) {
    return new Date(a) - new Date(b);
  }

  function formatDateLabel(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pl-PL", {
      day: "2-digit",
      month: "2-digit"
    });
  }

  async function getCatchesSafe() {
    if (typeof loadCatchesFromSupabase === "function") {
      return await loadCatchesFromSupabase();
    }

    if (window.supabaseClient) {
      const { data, error } = await window.supabaseClient
        .from("catches")
        .select("person, caught_at, weight")
        .order("caught_at", { ascending: true });

      if (error) throw error;
      return data || [];
    }

    return [];
  }

  function buildDailySeries(catches) {
    const grouped = new Map();

    catches.forEach((item) => {
      const dateKey = new Date(item.caught_at).toISOString().slice(0, 10);

      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, {
          patrykCount: 0,
          maciekCount: 0,
          patrykWeight: 0,
          maciekWeight: 0
        });
      }

      const row = grouped.get(dateKey);
      const person = String(item.person || "").trim().toLowerCase();
      const weight = Number(item.weight || 0);

      if (person === "patryk") {
        row.patrykCount += 1;
        row.patrykWeight += weight;
      } else if (person === "maciek") {
        row.maciekCount += 1;
        row.maciekWeight += weight;
      }
    });

    const dates = Array.from(grouped.keys()).sort(byDateAsc);

    return {
      labels: dates.map(formatDateLabel),
      patrykCount: dates.map((d) => grouped.get(d).patrykCount),
      maciekCount: dates.map((d) => grouped.get(d).maciekCount),
      patrykWeight: dates.map((d) => Number(grouped.get(d).patrykWeight.toFixed(1))),
      maciekWeight: dates.map((d) => Number(grouped.get(d).maciekWeight.toFixed(1)))
    };
  }

  function showEmptyMessage(canvas, message) {
    const wrap = canvas.parentElement;
    if (!wrap) return;
    wrap.innerHTML = `<div class="chart-empty">${message}</div>`;
  }

  async function renderDashboardChart() {
    const canvas = document.getElementById("fishChart");
    if (!canvas) return;
    if (typeof Chart === "undefined") return;

    try {
      const catches = await getCatchesSafe();

      if (!catches.length) {
        showEmptyMessage(canvas, "Brak danych do wykresu.");
        return;
      }

      const series = buildDailySeries(catches);

      if (!series.labels.length) {
        showEmptyMessage(canvas, "Brak danych do wykresu.");
        return;
      }

      if (fishChartInstance) {
        fishChartInstance.destroy();
      }

      const ctx = canvas.getContext("2d");

      fishChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
          labels: series.labels,
          datasets: [
            {
              label: "Patryk — liczba ryb",
              data: series.patrykCount,
              backgroundColor: "rgba(74, 166, 255, 0.75)",
              borderColor: "rgba(74, 166, 255, 1)",
              borderWidth: 1,
              borderRadius: 8,
              yAxisID: "y"
            },
            {
              label: "Maciek — liczba ryb",
              data: series.maciekCount,
              backgroundColor: "rgba(61, 220, 151, 0.75)",
              borderColor: "rgba(61, 220, 151, 1)",
              borderWidth: 1,
              borderRadius: 8,
              yAxisID: "y"
            },
            {
              type: "line",
              label: "Patryk — kg",
              data: series.patrykWeight,
              borderColor: "rgba(140, 203, 255, 1)",
              backgroundColor: "rgba(140, 203, 255, 0.18)",
              tension: 0.28,
              fill: false,
              pointRadius: 4,
              pointHoverRadius: 5,
              yAxisID: "y1"
            },
            {
              type: "line",
              label: "Maciek — kg",
              data: series.maciekWeight,
              borderColor: "rgba(145, 245, 195, 1)",
              backgroundColor: "rgba(145, 245, 195, 0.18)",
              tension: 0.28,
              fill: false,
              pointRadius: 4,
              pointHoverRadius: 5,
              yAxisID: "y1"
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: "index",
            intersect: false
          },
          plugins: {
            legend: {
              labels: {
                color: "#dfe7f2",
                boxWidth: 14,
                boxHeight: 14
              }
            },
            tooltip: {
              backgroundColor: "rgba(10, 15, 24, 0.95)",
              titleColor: "#ffffff",
              bodyColor: "#dfe7f2",
              borderColor: "rgba(255,255,255,0.12)",
              borderWidth: 1
            }
          },
          scales: {
            x: {
              ticks: {
                color: "#aeb9c9"
              },
              grid: {
                color: "rgba(255,255,255,0.06)"
              }
            },
            y: {
              beginAtZero: true,
              ticks: {
                precision: 0,
                color: "#aeb9c9"
              },
              title: {
                display: true,
                text: "Liczba ryb",
                color: "#dfe7f2"
              },
              grid: {
                color: "rgba(255,255,255,0.06)"
              }
            },
            y1: {
              beginAtZero: true,
              position: "right",
              ticks: {
                color: "#aeb9c9"
              },
              title: {
                display: true,
                text: "Waga (kg)",
                color: "#dfe7f2"
              },
              grid: {
                drawOnChartArea: false
              }
            }
          }
        }
      });
    } catch (error) {
      console.error("Błąd wykresu dashboardu:", error);
      showEmptyMessage(document.getElementById("fishChart"), "Nie udało się wczytać wykresu.");
    }
  }

  async function bootDashboardChart() {
    let tries = 0;

    while (tries < 30) {
      const canvas = document.getElementById("fishChart");
      if (canvas && typeof Chart !== "undefined") {
        await renderDashboardChart();
        return;
      }

      tries += 1;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootDashboardChart);
  } else {
    bootDashboardChart();
  }
})();
