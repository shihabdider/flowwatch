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

  if (record.elapsedTime > stopwatch.minDuration) {
    chrome.storage.local.get({ records: [] }, (data) => {
      data.records.push(record);
      chrome.storage.local.set({ records: data.records });
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
                chrome.identity.removeCachedAuthToken({ 'token': currentToken }, function() {
                    console.log('Token removed.');
                    sendResponse({ token: null });
                });
            }
        });
        return true; // Indicates that the response is asynchronous
    }
});

chrome.runtime.onInstalled.addListener(function() {
  chrome.identity.getAuthToken({ 'interactive': false }, function(token) {
    if (chrome.runtime.lastError || !token) {
      // No valid token, we are not authorized yet
      chrome.tabs.create({ url: 'oauth2-init.html' });
    }
  });
});

chrome.browserAction.onClicked.addListener(startStopwatch);
