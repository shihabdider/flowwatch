let stopwatch = {
  startTime: null,
  elapsedTime: 0,
  timer: null,
  running: false,
  maxDuration: 90 * 60 * 1000, // 90 minutes
  minDuration: 15 * 60 * 1000
};

let audio = new Audio('audio/focus_compressed.opus'); // Replace with your actual mp3 file path

function updateIconText(text) {
  chrome.browserAction.setBadgeText({ text: text });
}

function stopStopwatch(isBreak=false) {
  clearInterval(stopwatch.timer);
  stopwatch.running = false;
  updateIconText('');
  let endTime = new Date();
  let record = {
    startTime: new Date(stopwatch.startTime).toISOString(),
    endTime: endTime.toISOString(),
    elapsedTime: stopwatch.elapsedTime
  };

  // Check if the elapsed time is within the specified constraints
  if (record.elapsedTime >= stopwatch.minDuration) {
    // Check if the user has opted to record the stopwatch usage on the calendar
    chrome.storage.sync.get('recordCalendar', (data) => {
        if (data.recordCalendar !== false) { // default true if not set
            // Fetch the user's timezone and create the event
            fetchUserTimezone(function(timezone) {
                // Create an event object for Google Calendar with the fetched timezone
                let event = {
                    'summary': 'Flowwatch',
                    'start': {
                        'dateTime': record.startTime,
                        'timeZone': timezone
                    },
                    'end': {
                        'dateTime': record.endTime,
                        'timeZone': timezone
                    }
                };

                // Call the function to create the event on Google Calendar with the fetched timezone
                createGoogleCalendarEvent(event, timezone);
            });
        }
    });
  }
  stopwatch.elapsedTime = 0;
  if (isBreak) {
    let sound = new Audio('audio/alarm.wav');
    sound.play();
  }
  audio.pause();
  audio.currentTime = 0;
}

function startStopwatch() {
  if (!stopwatch.running) {
    chrome.storage.sync.get('newWindow', (data) => {
        if (data.newWindow !== false) { // default true if not set
            chrome.windows.create();
        }
    });
    stopwatch.startTime = Date.now() - stopwatch.elapsedTime;
    updateIconText('0s'); // Display 0s immediately when the stopwatch starts
    // Fetch the next calendar event
    fetchNextCalendarEvent(nextEventStartTime => {
      // If there is an event before the max duration, set a timeout to stop the stopwatch
      if (nextEventStartTime && nextEventStartTime < new Date(stopwatch.startTime + stopwatch.maxDuration)) {
        let timeUntilEvent = nextEventStartTime.getTime() - Date.now();
        setTimeout(() => {
          stopStopwatch();
        }, timeUntilEvent);
      }
    });

    stopwatch.timer = setInterval(() => {
      stopwatch.elapsedTime = Date.now() - stopwatch.startTime;
      
      if (stopwatch.elapsedTime >= stopwatch.maxDuration) {
        stopStopwatch(isBreak=true);
      } else {
        let seconds = Math.floor(stopwatch.elapsedTime / 1000);
        let minutes = Math.floor(seconds / 60);
        seconds = seconds % 60;
        let displayTime = minutes > 0 ? `${minutes}m` : `${seconds}s`;
        updateIconText(displayTime);
      }
    }, 100); // Update every 100ms for a more responsive UI
    stopwatch.running = true;

    chrome.storage.sync.get('playAudio', (data) => {
      if(data.playAudio !== false) { // default true if not set
        audio.play();
      }
    });
  } else {
    stopStopwatch();
  }
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'authorize') {
        chrome.identity.getAuthToken({ 'interactive': true }, function(token) {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                sendResponse({ token: null });
            } else {
                console.log('Token acquired:', token);
                sendResponse({ token: token });
            }
        });
        return true; // Indicates that the response is asynchronous
    } else if (request.action === 'signout') {
        chrome.identity.getAuthToken({ 'interactive': false }, function(currentToken) {
            if (currentToken) {
                // Invalidate the token in the Google's authorization server
                fetch(`https://accounts.google.com/o/oauth2/revoke?token=${currentToken}`, {
                    method: 'POST'
                }).then(() => {
                    // Remove the token from the cache
                    chrome.identity.removeCachedAuthToken({ 'token': currentToken }, function() {
                        alert('Token removed. Please reload the extension.');
                        sendResponse({ token: null });
                    });
                }).catch(error => {
                    console.error('Sign out error:', error);
                });
            } else {
                alert('No token found.');
                sendResponse({ token: null });
            }
        });
        return true; // Indicates that the response is asynchronous
    }
});

// Add a listener for the runtime.onInstalled event to handle any setup when the extension is installed or updated
chrome.runtime.onInstalled.addListener(function() {
  chrome.identity.getAuthToken({ 'interactive': false }, function(token) {
    if (chrome.runtime.lastError || !token) {
      // No valid token, we are not authorized yet
      chrome.tabs.create({ url: 'record.html' });
    }
  });
});

chrome.browserAction.onClicked.addListener(startStopwatch);

// Helper function to fetch the next calendar event
function fetchNextCalendarEvent(callback) {
  chrome.identity.getAuthToken({ 'interactive': true }, function(token) {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      return;
    }

    let timeMin = new Date().toISOString(); // Current time in ISO format
    let timeMax = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours from now

    // Define the API request parameters
    let init = {
      method: 'GET',
      async: true,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      'contentType': 'json'
    };

    // Make the API request to get the next event
    fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`, init)
      .then((response) => response.json())
      .then(function(data) {
        if (data.items && data.items.length > 0) {
          // Find the next event that is not an all-day event
          let nextEvent = data.items.find(event => event.start.dateTime);
          if (nextEvent) {
            callback(new Date(nextEvent.start.dateTime)); // Pass the start time of the next event to the callback
          }
        }
      })
      .catch(function(error) {
        console.error('Error fetching next calendar event:', error);
      });
  });
}

// Function to fetch the user's timezone
  chrome.identity.getAuthToken({ 'interactive': true }, function(token) {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      return;
    }

    // Define the API request parameters
    let init = {
      method: 'GET',
      async: true,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
    };

    // Make the API request to get the user's settings
    fetch('https://www.googleapis.com/calendar/v3/users/me/settings/timezone', init)
      .then((response) => response.json())
      .then(function(data) {
        console.log('User timezone:', data);
        callback(data.value); // Pass the timezone to the callback
      })
      .catch(function(error) {
        console.error('Error fetching user timezone:', error);
      });
  });
}

// Function to create an event on Google Calendar with the user's timezone
function createGoogleCalendarEvent(event, timezone) {
  chrome.identity.getAuthToken({ 'interactive': true }, function(token) {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      return;
    }

    // Define the API request parameters
    let init = {
      method: 'POST',
      async: true,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      'body': JSON.stringify(event),
      'contentType': 'json'
    };

    // Make the API request to create the event
    fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', init)
      .then((response) => response.json())
      .then(function(data) {
        console.log('Created Google Calendar event:', data);
      })
      .catch(function(error) {
        console.error('Error creating Google Calendar event:', error);
      });
  });
}
