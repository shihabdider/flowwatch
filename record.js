document.addEventListener('DOMContentLoaded', function() {
    chrome.storage.local.get({ records: [] }, function(data) {
        const recordsList = document.getElementById('recordsList');
        data.records.forEach(function(record) {
            const li = document.createElement('li');
            li.textContent = `Start: ${record.startTime}, End: ${record.endTime}, Duration: ${record.elapsedTime}ms`;
            recordsList.appendChild(li);
        });
    });
});
