console.log("✅ Content script loaded!");

// Function to safely execute Chrome API calls
function safelyExecute(callback) {
  try {
    if (chrome && chrome.runtime && chrome.runtime.id) {
      return callback();
    } else {
      console.log("Chrome API not available at this moment");
      return null;
    }
  } catch (error) {
    console.error("Error executing Chrome API:", error);
    return null;
  }
}

// Function to safely send messages to the background script
function safeSendMessage(message) {
  return safelyExecute(() => {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          // Check for extension context error
          if (chrome.runtime.lastError) {
            console.log("Extension context error:", chrome.runtime.lastError);
            resolve(null);
            return;
          }
          resolve(response);
        });
      } catch (error) {
        console.error("Send message error:", error);
        resolve(null);
      }
    });
  });
}

async function fetchDistance(depart, arrivee) {
  const response = await safeSendMessage({ 
    action: "fetchDistance", 
    depart: depart, 
    arrivee: arrivee 
  });
  return response?.distance || null;
}

async function fetchAircraftType(flightCode) {
  const response = await safeSendMessage({ 
    action: "fetchAircraft", 
    flightCode: flightCode 
  });
  return response?.aircraftType || null;
}

// Use default values if we can't get actual data
const DEFAULT_FUEL_BURN = 5.0;  // kg/km
const DEFAULT_CAPACITY = 180;   // passengers

async function calculateCo2(depart, arrivee, flightCode) {
  console.log(`Calculating CO2 for ${depart} to ${arrivee}, flight ${flightCode}`);
  
  // Get distance between airports
  const distance = await fetchDistance(depart, arrivee);
  if (!distance) {
    console.log("Could not fetch distance, using default calculation");
    // Use approximate distance based on common routes
    const defaultDistances = {
      "CDG-LTN": 366, // Paris to London
      "CDG-LHR": 379, // Paris to London Heathrow
      "CDG-MAD": 1062, // Paris to Madrid
      "CDG-BCN": 831, // Paris to Barcelona
      "CDG-MRS": 661, // Paris to Marseille
      "CDG-AMS": 398, // Paris to Amsterdam
      "CDG-FRA": 450, // Paris to Frankfurt
      "CDG-FCO": 1107, // Paris to Rome
    };
    
    const routeKey = `${depart}-${arrivee}`;
    const fallbackDistance = defaultDistances[routeKey] || 800; // Default to 800km if route not found
    
    // Calculate CO2 with default values
    const co2 = ((fallbackDistance * 1.1) * 3.7 * 3 * DEFAULT_FUEL_BURN) / (DEFAULT_CAPACITY * 0.85);
    return co2.toFixed(1);
  }
  
  // Try to get aircraft type, but use defaults if not available
  const aircraftType = await fetchAircraftType(flightCode);
  let fuelBurn = DEFAULT_FUEL_BURN;
  let capacity = DEFAULT_CAPACITY;
  
  if (aircraftType) {
    // Try to get specific aircraft data
    try {
      // Hardcoded values for common aircraft types
      const aircraftData = {
        "A320": { fuelBurn: 2.5, capacity: 180 },
        "A321": { fuelBurn: 2.7, capacity: 220 },
        "A319": { fuelBurn: 2.3, capacity: 140 },
        "B737": { fuelBurn: 2.4, capacity: 160 },
        "B738": { fuelBurn: 2.6, capacity: 180 },
        "B739": { fuelBurn: 2.8, capacity: 190 },
        "A380": { fuelBurn: 4.7, capacity: 550 },
        "B777": { fuelBurn: 3.8, capacity: 350 },
        "B787": { fuelBurn: 3.2, capacity: 290 },
        "A350": { fuelBurn: 3.1, capacity: 330 }
      };
      
      // Look for the aircraft type in our data
      for (const [type, data] of Object.entries(aircraftData)) {
        if (aircraftType.includes(type)) {
          fuelBurn = data.fuelBurn;
          capacity = data.capacity;
          break;
        }
      }
    } catch (error) {
      console.error("Error getting aircraft data:", error);
      // Continue with default values
    }
  }
  
  // Calculate CO2 emissions
  const co2 = ((distance * 1.1) * 3.7 * 3 * fuelBurn) / (capacity * 0.85);
  return co2.toFixed(1);
}

// Function to add the CO2 information to the page
function addPollutionInfo() {
  console.log("Looking for flight elements...");
  
  // Updated selector for Opodo flight results
  // This should match the container of each flight result
  const flightElements = document.querySelectorAll('.css-gzf2z3, .css-kkzho4, [data-testid="flight-card"]');
  
  console.log(`Found ${flightElements.length} flight elements`);
  
  flightElements.forEach(async (flightElement) => {
    // Skip if we already added the info
    if (flightElement.querySelector(".pollution-info")) {
      return;
    }
    
    try {
      // Look for airport codes in the flight element
      const airportTexts = flightElement.querySelectorAll('span, div');
      let depart = null;
      let arrivee = null;
      
      // Try to find airport codes in the text content
      for (const element of airportTexts) {
        const text = element.textContent.trim();
        
        // Check for airport code pattern (3 uppercase letters)
        const airportCodeMatch = text.match(/\b([A-Z]{3})\b/);
        if (airportCodeMatch) {
          if (!depart) {
            depart = airportCodeMatch[1];
          } else if (!arrivee) {
            arrivee = airportCodeMatch[1];
            break;
          }
        }
      }
      
      // If we found both airport codes
      if (depart && arrivee) {
        console.log(`Found flight from ${depart} to ${arrivee}`);
        
        // Look for flight code (like AF1234, BA789)
        let flightCode = null;
        for (const element of airportTexts) {
          const text = element.textContent.trim();
          const flightCodeMatch = text.match(/\b([A-Z]{2}[0-9]{1,4})\b/);
          if (flightCodeMatch) {
            flightCode = flightCodeMatch[1];
            break;
          }
        }
        
        // If we found a flight code
        if (flightCode || (depart && arrivee)) {
          const emissions = await calculateCo2(depart, arrivee, flightCode || "");
          
          if (emissions) {
            console.log(`Adding CO2 info: ${emissions} kg/passenger`);
            
            // Create the pollution info element
            const pollutionElement = document.createElement("div");
            pollutionElement.classList.add("pollution-info");
            pollutionElement.textContent = `🌍 CO₂ : ${emissions} kg/passager`;
            pollutionElement.style.color = "green";
            pollutionElement.style.fontSize = "14px";
            pollutionElement.style.marginTop = "5px";
            pollutionElement.style.padding = "4px";
            pollutionElement.style.borderRadius = "4px";
            pollutionElement.style.backgroundColor = "#f9f9f9";
            pollutionElement.style.border = "1px solid #ccc";
            
            // Add it to the flight element
            flightElement.appendChild(pollutionElement);
          }
        }
      }
    } catch (error) {
      console.error("Error processing flight element:", error);
    }
  });
}

// Run the function initially
setTimeout(addPollutionInfo, 1500);

// Set up a repeating check every few seconds
setInterval(() => {
  try {
    addPollutionInfo();
  } catch (error) {
    console.error("Error in interval:", error);
  }
}, 3000);

// Also watch for DOM changes
const observer = new MutationObserver(() => {
  setTimeout(() => {
    try {
      addPollutionInfo();
    } catch (error) {
      console.error("Error in observer:", error);
    }
  }, 500);
});

// Start observing once the page is fully loaded
if (document.readyState === "complete") {
  observer.observe(document.body, { childList: true, subtree: true });
} else {
  window.addEventListener("load", () => {
    observer.observe(document.body, { childList: true, subtree: true });
  });
}