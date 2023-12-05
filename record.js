document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('clearRecords').addEventListener('click', function () {
        chrome.storage.local.set({ records: [] }, function () {
            const recordsTableBody = document.getElementById('recordsTable').querySelector('tbody');
            recordsTableBody.innerHTML = ''; // Clear the table body
        });
    });
    chrome.storage.local.get({ records: [] }, function(data) {
        const recordsTableBody = document.getElementById('recordsTable').querySelector('tbody');
        data.records.forEach(function(record) {
            const tr = document.createElement('tr');
            const dateTd = document.createElement('td');
            const startTimeTd = document.createElement('td');
            const endTimeTd = document.createElement('td');
            const durationTd = document.createElement('td');
            const startDate = new Date(record.startTime);
            const endDate = new Date(record.endTime);
            const dateStr = startDate.toLocaleDateString();
            const startTimeStr = startDate.toLocaleTimeString();
            const endTimeStr = endDate.toLocaleTimeString();
            dateTd.textContent = dateStr;
            const duration = record.elapsedTime;
            const hours = Math.floor(duration / 3600000);
            const minutes = Math.floor((duration % 3600000) / 60000);
            const seconds = Math.floor((duration % 60000) / 1000);
            const durationStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            startTimeTd.textContent = startTimeStr;
            endTimeTd.textContent = endTimeStr;
            durationTd.textContent = durationStr;
            tr.appendChild(dateTd);
            tr.appendChild(startTimeTd);
            tr.appendChild(endTimeTd);
            tr.appendChild(durationTd);
            recordsTableBody.appendChild(tr);
        });
    });

    function convertToCsv(records) {
        const csvRows = [];
        // Add header
        csvRows.push('Date,Start Time,End Time,Duration');
        // Add records
        records.forEach(function(record) {
            const startDate = new Date(record.startTime);
            const endDate = new Date(record.endTime);
            const dateStr = startDate.toLocaleDateString();
            const startTimeStr = startDate.toLocaleTimeString();
            const endTimeStr = endDate.toLocaleTimeString();
            const duration = record.elapsedTime;
            const hours = Math.floor(duration / 3600000);
            const minutes = Math.floor((duration % 3600000) / 60000);
            const seconds = Math.floor((duration % 60000) / 1000);
            const durationStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            csvRows.push(`${dateStr},${startTimeStr},${endTimeStr},${durationStr}`);
        });
        return csvRows.join('\n');
    }

    document.getElementById('exportCsv').addEventListener('click', function() {
        chrome.storage.local.get({ records: [] }, function(data) {
            const csvData = convertToCsv(data.records);
            const blob = new Blob([csvData], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.setAttribute('hidden', '');
            a.setAttribute('href', url);
            a.setAttribute('download', 'records.csv');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
    });
});
