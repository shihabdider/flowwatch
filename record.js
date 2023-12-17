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
});
