// This script will be responsible for handling the OAuth2 flow
// It will communicate with the background script to initiate the authorization process

let flowwatchEvents = [];

document.addEventListener('DOMContentLoaded', function() {
    //
    // Add event listeners to the buttons for OAuth
    document.getElementById('authorize_button').addEventListener('click', function() {
        chrome.runtime.sendMessage({action: 'authorize'});
    });

    document.getElementById('signout_button').addEventListener('click', function() {
        chrome.runtime.sendMessage({action: 'signout'});
    });

    // Update the display of the signout button based on the authorization state
    chrome.identity.getAuthToken({ 'interactive': false }, function(token) {
        if (token) {
            document.getElementById('authorize_button').style.display = 'none';
            document.getElementById('signout_button').style.display = 'inline-block';
        } else {
            document.getElementById('authorize_button').style.display = 'inline-block';
            document.getElementById('signout_button').style.display = 'none';
        }
    });

    const recordCalendarToggle = document.getElementById('recordCalendarToggle');
    // Restore the state of the toggle from storage
    chrome.storage.sync.get('recordCalendar', (data) => {
        recordCalendarToggle.checked = data.recordCalendar !== false; // default true if not set
    });

    // Listen for toggle switch changes and save the state
    recordCalendarToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ 'recordCalendar': recordCalendarToggle.checked });
    });

    const ignoreCalendarEventsToggle = document.getElementById('ignoreCalendarEventsToggle');
    chrome.storage.sync.get('ignoreCalendarEvents', (data) => {
        ignoreCalendarEventsToggle.checked = data.ignoreCalendarEvents === true; // default false if not set
    })

    ignoreCalendarEventsToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ 'ignoreCalendarEvents': ignoreCalendarEventsToggle.checked });
    })

    const playAudioToggle = document.getElementById('playAudioToggle');

    // Restore the state of the toggle from storage
    chrome.storage.sync.get('playAudio', (data) => {
        playAudioToggle.checked = data.playAudio !== false; // default true if not set
    });

    // Listen for toggle switch changes and save the state
    playAudioToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ 'playAudio': playAudioToggle.checked });
    });

    const newWindowToggle = document.getElementById('newWindowToggle');

    chrome.storage.sync.get('newWindow', (data) => {
        newWindowToggle.checked = data.newWindow !== false; // default true if not set
    });

    newWindowToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ 'newWindow': newWindowToggle.checked });
    });

    const learningModeToggle = document.getElementById('learningModeToggle');

    // Restore the state of the toggle from storage
    chrome.storage.sync.get('learningMode', (data) => {
        learningModeToggle.checked = data.learningMode === true; // default false if not set
    });

    // Listen for toggle switch changes and save the state
    learningModeToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ 'learningMode': learningModeToggle.checked });
    });

    // Function to retrieve all calendar events since the start of the year with "flowwatch" in their summary
    function fetchFlowwatchEvents() {
        chrome.runtime.sendMessage({action: 'fetchFlowwatchEvents'}, function(response) {
            if (response && response.events) {
                flowwatchEvents = response.events.map(event => {
                    let startTime = new Date(event.start.dateTime);
                    let endTime = new Date(event.end.dateTime);
                    let durationHours = ((endTime - startTime) / (1000 * 60 * 60)).toPrecision(2);
                    return {
                        date: startTime.toISOString().split('T')[0],
                        value: parseFloat(durationHours)
                    };
                });
                console.log(flowwatchEvents);
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

    function updateCalendar(viewType) {
        if (cal) {
            cal.destroy();
        }
        
        cal = new CalHeatmap();
        const config = {
            date: {
                start: viewType === 'year' 
                    ? new Date(new Date().getFullYear(), 0, 1)  // January 1st of current year
                    : new Date(new Date().getFullYear(), new Date().getMonth(), 1) // First day of current month
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
        if (currentView === 'year') {
            // Move back one year
            let currentDate = cal.options.date.start;
            let newDate = new Date(currentDate.getFullYear() - 1, 0, 1);
            cal.options.date.start = newDate;
            updateCalendar(currentView);
        } else {
            cal.previous();
        }
    });

    nextButton.addEventListener('click', () => {
        if (currentView === 'year') {
            // Move forward one year
            let currentDate = cal.options.date.start;
            let newDate = new Date(currentDate.getFullYear() + 1, 0, 1);
            cal.options.date.start = newDate;
            updateCalendar(currentView);
        } else {
            cal.next();
        }
    });

    // Initialize calendar
    fetchFlowwatchEvents();
    // Initial calendar will be created by fetchFlowwatchEvents after data is loaded
});
