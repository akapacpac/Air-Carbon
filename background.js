console.log("✅ Background script is running!");

// Keep track of whether we've logged startup
let startupLogged = false;

// Function to handle errors in fetch requests
function handleFetchError(error, sendResponse, errorMessage) {
  console.error(`❌ ${errorMessage}:`, error);
  sendResponse(null);
}

// Handler for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Log the first message we receive (to confirm the background script is running)
  if (!startupLogged) {
    console.log("📩 First message received, background script is active");
    startupLogged = true;
  }

  console.log(`📩 Received message: ${request.action}`);

  // Simple ping to check if background script is alive
  if (request.action === "ping") {
    sendResponse({ status: "ok" });
    return false;
  }

  // Handle distance calculation requests
  if (request.action === "fetchDistance") {
    console.log(`📩 Fetching distance for: ${request.depart} to ${request.arrivee}`);
    
    fetch(`https://www.airmilescalculator.com/distance/${request.depart}-to-${request.arrivee}/`)
      .then(response => response.text())
      .then(text => {
        const match = text.match(/(\d{2,5}) km/);
        const distance = match ? parseInt(match[1]) * 1.1 : null; // +10% correction
        sendResponse({ distance: distance });
      })
      .catch(error => handleFetchError(error, sendResponse, "Failed to fetch distance"));
    
    return true; // Keep the message channel open for the async response
  }

  // Handle aircraft type requests
  if (request.action === "fetchAircraft") {
    console.log(`📩 Fetching aircraft type for flight: ${request.flightCode}`);
    
    // Check if we have a valid flight code
    if (!request.flightCode || request.flightCode.length < 3) {
      console.log("❌ Invalid flight code");
      sendResponse({ aircraftType: null });
      return false;
    }
    
    fetch(`https://fr.trip.com/flights/status-${request.flightCode}/`)
      .then(response => response.text())
      .then(text => {
        const match = text.match(/([A-Z0-9\-]+)\s+Aircraft Type/);
        sendResponse({ aircraftType: match ? match[1] : null });
      })
      .catch(error => handleFetchError(error, sendResponse, "Failed to fetch aircraft type"));
    
    return true; // Keep the message channel open for the async response
  }

  // If we don't recognize the action
  console.log(`❓ Unknown action: ${request.action}`);
  sendResponse(null);
  return false;
});

// Log when the background script starts
console.log("🚀 Background script started");