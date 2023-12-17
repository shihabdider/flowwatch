// This script will be responsible for handling the OAuth2 flow
// It will communicate with the background script to initiate the authorization process

document.addEventListener('DOMContentLoaded', function() {
    // Add event listeners to the buttons for OAuth
    document.getElementById('authorize_button').addEventListener('click', function() {
        chrome.runtime.sendMessage({action: 'authorize'});
    });

    document.getElementById('signout_button').addEventListener('click', function() {
        chrome.runtime.sendMessage({action: 'signout'});
    });

    // Update the display of the signout button based on the authorization state
    chrome.identity.getAuthToken({ 'interactive': false }, function(token) {
        if (token) {
            document.getElementById('authorize_button').style.display = 'none';
            document.getElementById('signout_button').style.display = 'inline-block';
        } else {
            document.getElementById('authorize_button').style.display = 'inline-block';
            document.getElementById('signout_button').style.display = 'none';
        }
    });

    const recordCalendarToggle = document.getElementById('recordCalendarToggle');

    // Restore the state of the toggle from storage
    chrome.storage.sync.get('recordCalendar', (data) => {
        recordCalendarToggle.checked = data.recordCalendar !== false; // default true if not set
    });

    // Listen for toggle switch changes and save the state
    recordCalendarToggle.addEventListener('change', () => {
        chrome.storage.sync.set({ 'recordCalendar': recordCalendarToggle.checked });
    });

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
