document.addEventListener('DOMContentLoaded', function() {
    chrome.storage.local.get({ records: [] }, function(data) {
        const recordsTableBody = document.getElementById('recordsTable').querySelector('tbody');
        data.records.forEach(function(record) {
            const tr = document.createElement('tr');
            const startTimeTd = document.createElement('td');
            const endTimeTd = document.createElement('td');
            const durationTd = document.createElement('td');
            const startTimeStr = new Date(record.startTime).toLocaleString();
            const endTimeStr = new Date(record.endTime).toLocaleString();
            const duration = record.elapsedTime;
            const hours = Math.floor(duration / 3600000);
            const minutes = Math.floor((duration % 3600000) / 60000);
            const seconds = Math.floor((duration % 60000) / 1000);
            const durationStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            startTimeTd.textContent = startTimeStr;
            endTimeTd.textContent = endTimeStr;
            durationTd.textContent = durationStr;
            tr.appendChild(startTimeTd);
            tr.appendChild(endTimeTd);
            tr.appendChild(durationTd);
            recordsTableBody.appendChild(tr);
        });
    });

    document.getElementById('exportCsv').addEventListener('click', function() {
        // Function to export the records as CSV will be implemented here
    });
});
