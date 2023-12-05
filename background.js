let stopwatch = {
  startTime: null,
  elapsedTime: 0,
  timer: null,
  running: false
};

function updateIconText(text) {
  chrome.browserAction.setBadgeText({ text: text });
}

function startStopwatch() {
  if (!stopwatch.running) {
    stopwatch.startTime = Date.now() - stopwatch.elapsedTime;
    stopwatch.timer = setInterval(() => {
      stopwatch.elapsedTime = Date.now() - stopwatch.startTime;
      let seconds = Math.floor(stopwatch.elapsedTime / 1000);
      let minutes = Math.floor(seconds / 60);
      seconds = seconds % 60;
      let displayTime = minutes > 0 ? `${minutes}m` : `${seconds}s`;
      updateIconText(displayTime);
    }, 1000);
    stopwatch.running = true;
  } else {
    clearInterval(stopwatch.timer);
    let endTime = new Date();
    let record = {
      startTime: new Date(stopwatch.startTime),
      endTime: endTime,
      elapsedTime: stopwatch.elapsedTime
    };
    chrome.storage.local.get({ records: [] }, (data) => {
      data.records.push(record);
      chrome.storage.local.set({ records: data.records });
    });
    stopwatch.elapsedTime = 0;
    stopwatch.running = false;
    updateIconText('');
  }
}

chrome.browserAction.onClicked.addListener(startStopwatch);
