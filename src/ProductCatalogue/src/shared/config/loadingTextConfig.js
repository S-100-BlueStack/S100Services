export const loadingTextMode = "fun";
// Use "standard" for technical loading stages.
// Use "fun" for The Sims-inspired rotating loading messages.

export const loadingMessageIntervalMs = 1800;

export function shouldRotateLoadingMessages() {
  return loadingTextMode === "fun";
}

export function shouldShowTechnicalLoadingStages() {
  return loadingTextMode === "standard";
}

const standardLoadingMessages = {
  loadingData: [
    "Loading data...",
    "Contacting product services...",
    "Receiving electronic products...",
    "Preparing map data...",
  ],
  renderingMap: [
    "Preparing map layers...",
    "Rendering map layers...",
    "Creating map graphics...",
    "Adding graphics to the map...",
  ],
  retryingData: [
    "Retrying data load...",
    "Waiting before the next attempt...",
    "Trying the product service again...",
  ],
};

const funLoadingMessages = {
  loadingData: [
    "Reticulating splines...",
    "Convincing buoys to stay in position...",
    "Asking the chart corrections nicely...",
    "Polishing the sea surface...",
    "Sorting maritime paperwork by vibes...",
    "Checking if the North Sea moved again...",
    "Folding nautical data into tiny triangles...",
    "Whispering coordinates to the database...",
    "Waking up sleepy feature services...",
    "Counting islands twice, just to be sure...",
    "Untying knots in the API response...",
    "Persuading latitude and longitude to cooperate...",
    "Checking whether mermaids submitted amendments...",
    "Shuffling chart corrections into sensible piles...",
    "Reassuring the datum that it is still relevant...",
    "Looking for misplaced shoals under the sofa...",
    "Downloading ocean facts with dramatic intent...",
    "Asking the coastline to hold still...",
    "Calibrating imaginary sextants...",
    "Reading the fine print on the compass rose...",
    "Collecting suspiciously confident coordinates...",
    "Making sure all hazards are wearing name tags...",
    "Importing several buckets of seawater...",
    "Checking if the chart scale feels emotionally ready...",
    "Inviting product states to form an orderly queue...",
    "Requesting permission from the Notices to Mariners...",
    "Comparing depths with a very judgmental echo sounder...",
    "Checking if any wrecks have wandered off...",
    "Asking fairways to stay between the lines...",
    "Dusting off old chart corrections...",
    "Reading buoyage notes in a serious voice...",
    "Checking if the soundings still sound right...",
    "Interviewing beacons for positional accuracy...",
    "Making sure restricted areas feel sufficiently restricted...",
    "Searching for suspiciously shallow water...",
  ],

  renderingMap: [
    "Teaching graphics where they live...",
    "Painting tiny corrections with a tiny brush...",
    "Installing imaginary lighthouse bulbs...",
    "Untangling polygons from the anchor chain...",
    "Making the map look confidently nautical...",
    "Convincing points to stop pretending they are polygons...",
    "Giving every feature a tiny clipboard...",
    "Teaching graphics layers to speak quietly...",
    "Arranging symbols by nautical importance...",
    "Politely asking GraphicsLayer to do its thing...",
    "Explaining zoom levels to impatient corrections...",
    "Drawing the ocean one suspicious pixel at a time...",
    "Making features visible only when they deserve it...",
    "Handing out popup templates to well-behaved graphics...",
    "Applying symbology with excessive confidence...",
    "Measuring display scale with a very small ruler...",
    "Assembling map layers in international waters...",
    "Checking if the renderer brought snacks...",
    "Giving frozen products a little blanket...",
    "Convincing the map view this is absolutely normal...",
    "Teaching hover highlights to be dramatic but tasteful...",
    "Telling duplicate graphics they are only here for scale...",
    "Painting status colors without getting paint on the basemap...",
    "Aligning chart symbols with nautical dignity...",
    "Placing depth contours where they look most official...",
    "Drawing leading lights in their best outfits...",
    "Asking traffic separation schemes to form neat lanes...",
    "Putting cardinal marks in cardinal places...",
    "Making isolated danger marks look appropriately dangerous...",
    "Reminding safe water marks that they are safe, actually...",
    "Explaining to lateral marks which side is which...",
    "Rendering fairways without spilling them into the harbor...",
    "Placing anchorage areas gently on the seabed...",
    "Giving submarine cables a subtle but meaningful presence...",
    "Convincing dredged areas to stay dredged...",
    "Making depth areas respect their boundaries...",
    "Filling land areas without flooding the harbor...",
    "Checking if coastline generalization has gone too far...",
    "Smoothing contours without angering hydrographers...",
    "Applying chart corrections with a ceremonial stamp...",
    "Sorting wrecks by how ominous they look...",
    "Rendering obstructions with professional concern...",
    "Asking bridge clearances to be tall enough...",
    "Measuring berths with a tiny harbor ruler...",
    "Giving pilot boarding places somewhere sensible to stand...",
    "Checking if caution areas are being cautious enough...",
    "Convincing navigation lines to stop wobbling...",
    "Painting restricted areas with restricted enthusiasm...",
    "Making port limits look legally binding...",
    "Adding lights, sectors, and mild confusion...",
    "Checking if the compass rose approves this layout...",
  ],

  retryingData: [
    "The server went for coffee. Trying again...",
    "Re-sending carrier pigeon...",
    "Giving the API a motivational speech...",
    "Waiting for the tide to turn...",
    "Asking the endpoint if it meant to do that...",
    "Checking whether the request got lost at sea...",
    "Sending a tugboat for the response...",
    "Knocking politely on the firewall...",
    "Trying again with more nautical confidence...",
    "Waiting for the packets to finish docking...",
    "Recalculating patience...",
    "Offering the server a biscuit...",
    "Consulting the retry oracle...",
    "Checking if the API is hiding behind a buoy...",
    "Giving the network cable a stern look...",
    "Waiting for the response to clear customs at the harbor...",
    "Sending a pilot boat to guide the request back...",
    "Checking if the endpoint ran aground...",
    "Asking the tide table when the API returns...",
    "Recovering packets from the chart table...",
  ],
};

const loadingMessagesByMode = {
  standard: standardLoadingMessages,
  fun: funLoadingMessages,
};

export function getLoadingMessages(stage, mode = loadingTextMode) {
  const messages = loadingMessagesByMode[mode]?.[stage];

  if (Array.isArray(messages) && messages.length > 0) {
    return messages;
  }

  return standardLoadingMessages[stage] ?? ["Loading..."];
}
