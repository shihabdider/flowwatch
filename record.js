// This script will be responsible for handling the OAuth2 flow
// It will communicate with the background script to initiate the authorization process

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

    // ... existing code ...

    const recordCalendarToggle = document.getElementById('recordCalendarToggle');

    // Restore the state of the toggle from storage
    chrome.storage.sync.get('recordCalendar', (data) => {
        recordCalendarToggle.checked = data.recordCalendar !== false; // default true if not set
    });

    // Listen for toggle switch changes and save the state
    recordCalendarToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ 'recordCalendar': recordCalendarToggle.checked });
    });

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
                let flowwatchEvents = response.events.map(event => {
                    let startTime = new Date(event.start.dateTime);
                    let endTime = new Date(event.end.dateTime);
                    let durationHours = ((endTime - startTime) / (1000 * 60 * 60)).toPrecision(2);
                    return {
                        date: startTime.toISOString().split('T')[0],
                        value: parseFloat(durationHours)
                    };
                });
                console.log(flowwatchEvents);
                const cal = new CalHeatmap();
                cal.paint({
                    data: {
                        source: flowwatchEvents, 
                        x: 'date',
                        y: 'value',
                    },
                    domain: { 
                        type: 'month', 
                        label: {
                            position: 'left',
                            offset: {
                                y: 5,
                            },
                        },
                    },
                    subDomain: { 
                        type: 'week' ,
                        height: 20,
                        width: 20,
                    },
                    scale: {
                        color: {
                            scheme: 'BuPu',
                            domain: [0, 40],
                        },
                    },
                    verticalOrientation: true,
                }, 
                    [
                        [
                            Tooltip,
                            {
                                text: function (date, value, dayjsDate) {
                                    let displayValue = value ? parseFloat(value).toFixed(2) : 'No data';
                                    return `${displayValue} hours on week of ${dayjsDate.format('MM-DD')}`;
                                },
                            },
                        ],
                    ]
                );
            }
        });
    }

    // Call the function to fetch events
    const flowwatchEvents = fetchFlowwatchEvents();
});
