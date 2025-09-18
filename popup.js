let flowwatchEvents = [];

document.addEventListener('DOMContentLoaded', function() {
    // Binaural audio toggle using storage.local
    const playAudioToggle = document.getElementById('playAudioToggle');
    chrome.storage.local.get('playAudio', (data) => {
        playAudioToggle.checked = data.playAudio !== false; // default true if not set
    });
    playAudioToggle.addEventListener('change', () => {
        chrome.storage.local.set({ 'playAudio': playAudioToggle.checked });
    });

    // Timer control wiring
    document.getElementById('start_focus_button').addEventListener('click', () => {
        const intention = document.getElementById('intention_input')?.value || '';
        chrome.runtime.sendMessage({ type: 'startFocus', intention });
    });
    document.getElementById('end_flow_button').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'endFlow' });
    });
    document.getElementById('reset_button').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'reset' });
    });

    // Message listener to update timer display
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'updateTimer') {
            const sec = Math.max(0, msg.elapsed | 0);
            const m = String(Math.floor(sec / 60)).padStart(2, '0');
            const s = String(sec % 60).padStart(2, '0');
            const mode = msg.mode === 'break' ? ' (break)' : '';
            const el = document.getElementById('timer_display');
            if (el) el.textContent = `${m}:${s}${mode}`;
        } else if (msg.type === 'resetUI') {
            const el = document.getElementById('timer_display');
            if (el) el.textContent = '00:00';
        }
    });

    // Function to retrieve local sessions and aggregate duration by day
    function fetchFlowwatchEvents() {
        chrome.runtime.sendMessage({ type: 'getSessions' }, function(response) {
            if (response && response.sessions) {
                const eventsByDate = new Map();
                response.sessions.forEach((s) => {
                    const startTime = new Date(s.start);
                    const endTime = new Date(s.end);
                    const dateKey = startTime.toISOString().split('T')[0];
                    const durationHours = Math.max(0, (endTime - startTime) / (1000 * 60 * 60));
                    eventsByDate.set(dateKey, (eventsByDate.get(dateKey) || 0) + durationHours);
                });
                flowwatchEvents = Array.from(eventsByDate.entries()).map(([date, totalHours]) => ({
                    date,
                    value: parseFloat(totalHours.toPrecision(2))
                }));
                updateCalendar(currentView);
            }
        });
    }

    // View toggle functionality
    const weekView = document.getElementById('weekView');
    const monthView = document.getElementById('monthView');
    const prevButton = document.getElementById('prevButton');
    const nextButton = document.getElementById('nextButton');

    let currentView = 'year';
    let cal;

    function updateCalendar(viewType, customDate = null) {
        if (cal && cal.destroy) {
            cal.destroy();
        }

        cal = new CalHeatmap();
        const config = {
            date: {
                start: customDate || (viewType === 'year'
                    ? new Date(new Date().getFullYear(), 0, 1)  // January 1st of current year
                    : new Date(new Date().getFullYear(), new Date().getMonth(), 1)) // First day of current month
            },
            data: {
                source: flowwatchEvents,
                x: 'date',
                y: 'value',
            },
            domain: {
                type: viewType === 'year' ? 'month' : 'month',
                gutter: 4,
                label: {
                    position: 'left',
                    offset: {
                        y: 5,
                    },
                },
            },
            subDomain: {
                type: viewType === 'year' ? 'week' : 'day',
                height: viewType === 'year' ? 10 : 20,
                width: viewType === 'year' ? 10 : 20,
            },
            range: viewType === 'year' ? 12 : 1, // Show 12 months for year view, 1 month for month view
            scale: {
                color: {
                    scheme: 'BuPu',
                    domain: [0, 40],
                },
            },
            verticalOrientation: true,
        };

        cal.paint(config, [
            [
                Tooltip,
                {
                    text: function (date, value, dayjsDate) {
                        let displayValue = value ? parseFloat(value).toFixed(2) : 'No data';
                        return `${displayValue} hours on ${dayjsDate.format('MM-DD')}`;
                    },
                },
            ],
        ]);
    }

    weekView.addEventListener('click', () => {
        currentView = 'year';
        weekView.classList.add('active');
        monthView.classList.remove('active');
        updateCalendar('year');
    });

    monthView.addEventListener('click', () => {
        currentView = 'month';
        monthView.classList.add('active');
        weekView.classList.remove('active');
        updateCalendar('month');
    });

    prevButton.addEventListener('click', () => {
        if (cal && cal.previous) cal.previous();
    });

    nextButton.addEventListener('click', () => {
        if (cal && cal.next) cal.next();
    });

    // Initialize calendar
    fetchFlowwatchEvents();
    // Initial calendar will be created by fetchFlowwatchEvents after data is loaded
});
