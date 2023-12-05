document.addEventListener('DOMContentLoaded', function() {
    chrome.storage.local.get({ records: [] }, function(data) {
        const recordsList = document.getElementById('recordsList');
        data.records.forEach(function(record) {
            const li = document.createElement('li');
            const startTimeStr = new Date(record.startTime).toLocaleString();
            const endTimeStr = new Date(record.endTime).toLocaleString();
            const duration = new Date(record.elapsedTime);
            const durationStr = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(duration);
            li.textContent = `Start: ${startTimeStr}, End: ${endTimeStr}, Duration: ${durationStr}`;
            recordsList.appendChild(li);
        });
    });
});
