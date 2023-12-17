document.addEventListener('DOMContentLoaded', function () {
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

    // The clearRecords button functionality will be removed as we are not storing records locally anymore.
    // This section has been removed as we will no longer display records in a table.
    // Instead, we will create Google Calendar events.

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

    // The exportCsv button functionality will be removed as we are not storing records locally anymore.
});
