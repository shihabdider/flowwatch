document.addEventListener('DOMContentLoaded', function() {
    chrome.storage.local.get({ records: [] }, function(data) {
        const recordsList = document.getElementById('recordsList');
        data.records.forEach(function(record) {
            const li = document.createElement('li');
            const startTimeStr = new Date(record.startTime).toLocaleString();
            const endTimeStr = new Date(record.endTime).toLocaleString();
            const duration = record.elapsedTime;
            const hours = Math.floor(duration / 3600000);
            const minutes = Math.floor((duration % 3600000) / 60000);
            const seconds = Math.floor((duration % 60000) / 1000);
            const durationStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            li.textContent = `Start: ${startTimeStr}, End: ${endTimeStr}, Duration: ${durationStr}`;
            recordsList.appendChild(li);
        });
    });
});
