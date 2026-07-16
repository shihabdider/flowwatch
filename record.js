// This script will be responsible for handling the OAuth2 flow
// It will communicate with the background script to initiate the authorization process

let flowwatchEvents = [];

document.addEventListener('DOMContentLoaded', function() {
    //
    // Add event listeners to the buttons for OAuth
    const authorizeBtn = document.getElementById('authorize_button');
    const signoutBtn = document.getElementById('signout_button');

    if (authorizeBtn && signoutBtn && chrome.identity) {
      authorizeBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'authorize' });
      });
      signoutBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'signout' });
      });

      if (chrome.identity.getAuthToken) {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          authorizeBtn.style.display = token ? 'none' : 'inline-block';
          signoutBtn.style.display = token ? 'inline-block' : 'none';
        });
      }
    } else {
      if (authorizeBtn) authorizeBtn.style.display = 'none';
      if (signoutBtn) signoutBtn.style.display = 'none';
    }


    const playAudioToggle = document.getElementById('playAudioToggle');
    if (playAudioToggle) {
      chrome.storage.sync.get('playAudio', (data) => {
        playAudioToggle.checked = data.playAudio !== false;
      });
      playAudioToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ playAudio: playAudioToggle.checked });
      });
    }

    // Timer and generated-audio settings
    const focusMinutesInput = document.getElementById('focusMinutesInput');
    if (focusMinutesInput) {
        chrome.storage.sync.get('focusMinutes', ({ focusMinutes }) => {
            const val = Number(focusMinutes);
            focusMinutesInput.value = Number.isFinite(val) && val > 0 ? val : 15;
        });
        focusMinutesInput.addEventListener('change', () => {
            const n = Math.max(1, parseInt(focusMinutesInput.value, 10) || 15);
            focusMinutesInput.value = n;
            chrome.storage.sync.set({ focusMinutes: n });
        });
    }

    function bindRateInput(id, key, min, max, fallback) {
      const input = document.getElementById(id);
      if (!input) return;
      chrome.storage.sync.get(key, (stored) => {
        const value = Number(stored[key]);
        input.value = Number.isFinite(value)
          ? Math.max(min, Math.min(max, value))
          : fallback;
      });
      input.addEventListener('change', () => {
        const parsed = Number(input.value);
        const value = Number.isFinite(parsed)
          ? Math.max(min, Math.min(max, parsed))
          : fallback;
        input.value = value;
        chrome.storage.sync.set({ [key]: value });
      });
    }

    function bindSelect(id, key, allowed, fallback) {
      const select = document.getElementById(id);
      if (!select) return;
      chrome.storage.sync.get(key, (stored) => {
        select.value = allowed.includes(stored[key]) ? stored[key] : fallback;
      });
      select.addEventListener('change', () => {
        const value = allowed.includes(select.value) ? select.value : fallback;
        select.value = value;
        chrome.storage.sync.set({ [key]: value });
      });
    }

    bindRateInput('focusHzInput', 'focusHz', 12, 16, 12);
    bindRateInput('relaxHzInput', 'relaxHz', 8, 12, 8);
    bindSelect('musicStyleSelect', 'musicStyle', ['ambient', 'classical', 'baroque', 'electronic'], 'ambient');

    const promptIntentionToggle = document.getElementById('promptIntentionToggle');
    if (promptIntentionToggle) {
      chrome.storage.sync.get('promptIntention', (data) => {
        promptIntentionToggle.checked = data.promptIntention !== false;
      });
      promptIntentionToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ promptIntention: promptIntentionToggle.checked });
      });
    }

    // Function to retrieve recorded sessions and aggregate by date
    function fetchFlowwatchEvents() {
        chrome.runtime.sendMessage({ type: 'getSessions' }, function(response) {
            if (response && response.sessions) {
                const eventsByDate = new Map();
                response.sessions.forEach((s) => {
                    const startTime = new Date(s.start);
                    const endTime = new Date(s.end);
                    const dateKey = startTime.toISOString().split('T')[0];
                    const durationHours = Math.max(
                        0,
                        s.durationSec ? (s.durationSec / 3600) : ((endTime - startTime) / (1000 * 60 * 60))
                    );
                    eventsByDate.set(dateKey, (eventsByDate.get(dateKey) || 0) + durationHours);
                });

                flowwatchEvents = Array.from(eventsByDate.entries()).map(([date, totalHours]) => ({
                    date: date,
                    value: parseFloat(totalHours.toFixed(2)),
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
        const container = document.getElementById('cal-heatmap');
        if (container) container.innerHTML = '';
        if (cal) {
            cal.destroy();
        }
        
        cal = new CalHeatmap();
        const config = {
            itemSelector: '#cal-heatmap',
            date: {
                start: customDate || (viewType === 'year' 
                    ? new Date(new Date().getFullYear(), 0, 1)  // January 1st of current year
                    : new Date(new Date().getFullYear(), new Date().getMonth(), 1)) // First day of current month
            },
            data: {
                source: flowwatchEvents,
                type: 'json',
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

        cal.paint(config);
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
        if (cal && typeof cal.previous === 'function') cal.previous();
    });

    nextButton.addEventListener('click', () => {
        if (cal && typeof cal.next === 'function') cal.next();
    });

    // Initialize calendar
    fetchFlowwatchEvents();
    // Initial calendar will be created by fetchFlowwatchEvents after data is loaded
});
