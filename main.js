import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.164.1/examples/jsm/controls/OrbitControls.js";

const canvas = document.getElementById("globe");
const statusEl = document.getElementById("status");
const form = document.getElementById("city-form");
const input = document.getElementById("city-input");
const suggestionsEl = document.getElementById("suggestions");
const speedUpBtn = document.getElementById("speed-up");
const speedDownBtn = document.getElementById("speed-down");
const speedDisplay = document.getElementById("speed-display");

// Speed multiplier (1.0 = normal, 2.0 = double speed, 0.5 = half speed)
let speedMultiplier = 1.0;

// Selected city data from autocomplete
let selectedCity = null;
let suggestionsList = [];
let selectedIndex = -1;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x05060f, 12, 40);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 3.5, 9);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 5;
controls.maxDistance = 14;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.5;

const ambient = new THREE.AmbientLight(0x9fb3ff, 0.6);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
keyLight.position.set(5, 5, 3);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x6f87ff, 0.6);
fillLight.position.set(-5, -2, -3);
scene.add(fillLight);

const textureLoader = new THREE.TextureLoader();
const earthRadius = 3.2;

// Create a procedural Earth texture as fallback
function createEarthTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  
  // Create gradient background (ocean)
  const oceanGradient = ctx.createLinearGradient(0, 0, 0, 512);
  oceanGradient.addColorStop(0, "#0a1633");
  oceanGradient.addColorStop(0.5, "#1a237e");
  oceanGradient.addColorStop(1, "#283593");
  ctx.fillStyle = oceanGradient;
  ctx.fillRect(0, 0, 1024, 512);
  
  // Add some continent-like shapes
  ctx.fillStyle = "#2d5016";
  ctx.beginPath();
  ctx.ellipse(200, 200, 80, 60, 0, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.beginPath();
  ctx.ellipse(600, 150, 100, 70, 0, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.beginPath();
  ctx.ellipse(800, 350, 90, 65, 0, 0, Math.PI * 2);
  ctx.fill();
  
  return new THREE.CanvasTexture(canvas);
}

// Try to load a real Earth texture, fallback to procedural
let earthTexture = createEarthTexture();
textureLoader.load(
  "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg",
  (texture) => {
    console.log("Earth texture loaded");
    texture.colorSpace = THREE.SRGBColorSpace;
    globeMesh.material.map = texture;
    globeMesh.material.needsUpdate = true;
  },
  undefined,
  () => {
    console.log("Using procedural Earth texture");
  }
);
earthTexture.colorSpace = THREE.SRGBColorSpace;

const globeMesh = new THREE.Mesh(
  new THREE.SphereGeometry(earthRadius, 64, 64),
  new THREE.MeshStandardMaterial({
    map: earthTexture,
    roughness: 0.7,
    metalness: 0.1,
    emissive: new THREE.Color(0x0a1633),
    emissiveIntensity: 0.35,
  })
);
scene.add(globeMesh);

const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(earthRadius * 1.02, 64, 64),
  new THREE.MeshBasicMaterial({
    color: 0x4c8dff,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  })
);
scene.add(atmosphere);

const starGeometry = new THREE.BufferGeometry();
const starCount = 1600;
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i += 1) {
  const radius = 50 + Math.random() * 50;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
  starPositions[i * 3 + 1] = radius * Math.cos(phi);
  starPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
}
starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
const stars = new THREE.Points(
  starGeometry,
  new THREE.PointsMaterial({ color: 0xaed5ff, size: 0.2, transparent: true, opacity: 0.6 })
);
scene.add(stars);

// Attach markers and routes to the globe so they rotate together
const markersGroup = new THREE.Group();
const routesGroup = new THREE.Group();
globeMesh.add(markersGroup, routesGroup);

// Flight state
let cities = []; // Array of all city stops: [{label, position}, ...]
let currentCityIndex = 0; // Current position in the cities array
let flyingForward = true; // Direction of travel
let activeFlight = null;
let thePlane = null; // Single plane instance
let allRouteLines = []; // All route lines between consecutive cities
let returnFlightTimeout = null; // Timeout for next leg of journey
let flightVersion = 0; // Incremented when flight changes, used to invalidate pending flights

// Camera animation state
let cameraAnimation = null;
let globeRotationEnabled = true;

// Animate camera to look at a specific lat/lng position
function animateCameraToCity(lat, lon, duration = 1500) {
  // Calculate target position on globe surface
  const targetOnGlobe = latLngToVector3(lat, lon, earthRadius);
  
  // Camera should be positioned above the city, looking at globe center
  // Position camera at a point along the line from globe center through the city
  const cameraDistance = 7; // How far from globe center
  const cameraTarget = targetOnGlobe.clone().normalize().multiplyScalar(cameraDistance);
  
  // Store starting values
  const startPosition = camera.position.clone();
  const startTarget = controls.target.clone();
  const startTime = performance.now();
  
  // Stop all rotation when user selects a city
  controls.autoRotate = false;
  globeRotationEnabled = false;
  
  // Cancel any existing animation
  if (cameraAnimation) {
    cameraAnimation.cancelled = true;
  }
  
  const animation = {
    cancelled: false,
    update: (time) => {
      if (animation.cancelled) return false;
      
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      
      // Interpolate camera position
      camera.position.lerpVectors(startPosition, cameraTarget, eased);
      
      // Keep looking at globe center
      controls.target.lerpVectors(startTarget, new THREE.Vector3(0, 0, 0), eased);
      
      if (progress >= 1) {
        // Animation complete - keep auto-rotate disabled
        return false; // Animation done
      }
      
      return true; // Continue animation
    }
  };
  
  cameraAnimation = animation;
}

const markerMaterial = new THREE.MeshStandardMaterial({
  color: 0xffd666,
  emissive: 0xffb347,
  emissiveIntensity: 0.6,
});

// Create a text texture for city labels
function createTextTexture(text) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Set font and measure text
  const fontSize = 24;
  const padding = 10;
  ctx.font = `500 ${fontSize}px "Space Grotesk", system-ui, sans-serif`;
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  
  // Size canvas to fit text with padding
  canvas.width = textWidth + padding * 2;
  canvas.height = fontSize + padding;
  
  // Re-set font after canvas resize
  ctx.font = `500 ${fontSize}px "Space Grotesk", system-ui, sans-serif`;
  
  // Draw background pill
  ctx.fillStyle = 'rgba(10, 12, 30, 0.75)';
  const radius = (fontSize + padding) / 2;
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, radius);
  ctx.fill();
  
  // Add subtle border
  ctx.strokeStyle = 'rgba(90, 120, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
  
  // Draw text
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  
  return { texture, aspect: canvas.width / canvas.height };
}

// Create a text label sprite
function createLabel(text, position) {
  const { texture, aspect } = createTextTexture(text);
  
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  
  const sprite = new THREE.Sprite(spriteMaterial);
  
  // Scale based on aspect ratio - smaller size
  const labelHeight = 0.09;
  const labelWidth = labelHeight * aspect;
  sprite.scale.set(labelWidth, labelHeight, 1);
  
  // Position label to the right and slightly above the marker
  const normal = position.clone().normalize();
  
  // Create a tangent vector (perpendicular to normal, roughly horizontal)
  const up = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3().crossVectors(up, normal).normalize();
  
  // Offset: outward from globe + to the side
  const outwardOffset = normal.clone().multiplyScalar(0.06);
  const sideOffset = tangent.clone().multiplyScalar(labelWidth / 2 + 0.08);
  const upOffset = up.clone().multiplyScalar(0.02);
  
  const labelPosition = position.clone().add(outwardOffset).add(sideOffset).add(upOffset);
  sprite.position.copy(labelPosition);
  
  sprite.renderOrder = 3;
  markersGroup.add(sprite);
  
  return sprite;
}

const planeMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0x7ef0ff,
  emissiveIntensity: 0.8,
});

function latLngToVector3(lat, lng, radius = earthRadius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function createMarker(position, label) {
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 16), markerMaterial);
  marker.position.copy(position);
  markersGroup.add(marker);
  
  // Create text label for the city
  if (label) {
    createLabel(label, position);
  }
  
  return marker;
}

// Create great circle arc using axis-angle rotation
// This method rotates the start point toward the end point around
// the axis perpendicular to both, following the sphere's surface
function createRouteCurve(start, end) {
  const startNorm = start.clone().normalize();
  const endNorm = end.clone().normalize();
  
  // Rotation axis = cross product of start and end directions
  const axis = new THREE.Vector3().crossVectors(startNorm, endNorm);
  
  // Handle antipodal/parallel points (cross product near zero)
  if (axis.length() < 0.001) {
    // Pick arbitrary perpendicular axis
    axis.set(0, 1, 0);
    if (Math.abs(startNorm.y) > 0.9) axis.set(1, 0, 0);
    axis.crossVectors(startNorm, axis).normalize();
  } else {
    axis.normalize();
  }
  
  // Total rotation angle between start and end
  const angle = startNorm.angleTo(endNorm);
  
  // Arc altitude - subtle curve that hugs the Earth's surface
  // Real planes fly at ~10km, Earth radius is ~6371km = 0.15% of radius
  // We exaggerate slightly for visibility, but keep it airplane-like, not rocket-like
  const maxAltitude = Math.min(0.15, angle * 0.08);
  
  // Number of segments - more for longer routes
  const segments = Math.max(32, Math.floor(angle * 40));
  
  // Generate points along the great circle arc
  const points = [];
  
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    
    // Rotate start toward end by t * angle around the axis
    const direction = startNorm.clone().applyAxisAngle(axis, t * angle);
    
    // Lift above surface with sinusoidal profile (0 at ends, max at middle)
    const altitude = maxAltitude * Math.sin(t * Math.PI);
    
    // Position = direction * (earthRadius + altitude)
    const point = direction.multiplyScalar(earthRadius + altitude + 0.02);
    points.push(point);
  }
  
  // Create a smooth curve through all the points
  return new THREE.CatmullRomCurve3(points);
}

function createRouteLine(curve, isActive = false) {
  const points = curve.getPoints(120);
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: isActive ? 0x6fb5ff : 0x4a7dc4,
    transparent: true,
    opacity: isActive ? 0.8 : 0.5,
    depthTest: true,
    depthWrite: false,
  });
  const line = new THREE.Line(geometry, material);
  line.renderOrder = 1;
  routesGroup.add(line);
  return line;
}

// Create a persistent route line between two cities (stored in allRouteLines)
function createPersistentRouteLine(fromCity, toCity) {
  const curve = createRouteCurve(fromCity.position, toCity.position);
  const line = createRouteLine(curve, false);
  allRouteLines.push({ line, curve, fromCity, toCity });
  return { line, curve };
}

// Highlight a specific route line (the one being flown)
function highlightRouteLine(index) {
  allRouteLines.forEach((route, i) => {
    const isActive = i === index;
    route.line.material.color.setHex(isActive ? 0x6fb5ff : 0x4a7dc4);
    route.line.material.opacity = isActive ? 0.8 : 0.5;
  });
}

// Create plane icon texture
function createPlaneTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  
  // Clear canvas
  ctx.clearRect(0, 0, 64, 64);
  
  // Draw plane icon (✈️ style)
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  
  ctx.beginPath();
  // Nose
  ctx.moveTo(32, 4);
  // Right side of body
  ctx.lineTo(36, 20);
  // Right wing
  ctx.lineTo(60, 30);
  ctx.lineTo(60, 34);
  ctx.lineTo(36, 32);
  // Right side lower body
  ctx.lineTo(38, 48);
  // Right tail
  ctx.lineTo(48, 56);
  ctx.lineTo(48, 60);
  ctx.lineTo(36, 54);
  // Bottom
  ctx.lineTo(32, 60);
  ctx.lineTo(28, 54);
  // Left tail  
  ctx.lineTo(16, 60);
  ctx.lineTo(16, 56);
  ctx.lineTo(26, 48);
  // Left side lower body
  ctx.lineTo(28, 32);
  // Left wing
  ctx.lineTo(4, 34);
  ctx.lineTo(4, 30);
  ctx.lineTo(28, 20);
  // Back to nose
  ctx.lineTo(32, 4);
  ctx.closePath();
  ctx.fill();
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

const planeTexture = createPlaneTexture();

function getOrCreatePlane() {
  if (thePlane) return thePlane;
  
  const spriteMaterial = new THREE.SpriteMaterial({
    map: planeTexture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(0.25, 0.25, 1);
  sprite.renderOrder = 2;
  sprite.visible = false;
  
  routesGroup.add(sprite);
  thePlane = sprite;
  return sprite;
}

function hidePlane() {
  if (thePlane) {
    thePlane.visible = false;
  }
}

// Start a flight between two cities using existing route line
function startFlight(fromCity, toCity, toCityIndex) {
  // Cancel any pending flight
  if (returnFlightTimeout) {
    clearTimeout(returnFlightTimeout);
    returnFlightTimeout = null;
  }
  
  flightVersion++;
  
  // Find the route line index for this flight
  const fromIndex = cities.indexOf(fromCity);
  const toIndex = cities.indexOf(toCity);
  const routeIndex = Math.min(fromIndex, toIndex);
  
  // Get the curve from the stored route
  const route = allRouteLines[routeIndex];
  const curve = route ? route.curve : createRouteCurve(fromCity.position, toCity.position);
  
  // Highlight the active route
  highlightRouteLine(routeIndex);
  
  const plane = getOrCreatePlane();
  plane.visible = true;
  
  // Base duration (speed-independent) - speed is applied per-frame for immediate responsiveness
  const baseDuration = 5000 + fromCity.position.distanceTo(toCity.position) * 800;

  // If flying backward along the curve, we need to reverse the parameter
  const flyingBackward = toIndex < fromIndex;

  activeFlight = {
    curve,
    toCity,
    toCityIndex,
    baseDuration,
    progress: 0, // Track progress (0 to 1) instead of fixed duration
    lastTime: performance.now(),
    version: flightVersion,
    flyingBackward,
    routeIndex,
  };
  
  statusEl.textContent = `✈️ Flying to ${toCity.label}`;
}

// Start flight from an arbitrary position to a city (used when redirecting mid-flight)
function startFlightFromPosition(startPos, toCity, toCityIndex) {
  // Cancel any pending flight
  if (returnFlightTimeout) {
    clearTimeout(returnFlightTimeout);
    returnFlightTimeout = null;
  }
  
  flightVersion++;
  
  // Create a temporary curve from current position to the new city
  const curve = createRouteCurve(startPos, toCity.position);
  
  // Highlight the last route (newest city connection)
  highlightRouteLine(allRouteLines.length - 1);
  
  const plane = getOrCreatePlane();
  plane.visible = true;
  
  // Base duration (speed-independent) - speed is applied per-frame for immediate responsiveness
  const baseDuration = 5000 + startPos.distanceTo(toCity.position) * 800;

  activeFlight = {
    curve,
    toCity,
    toCityIndex,
    baseDuration,
    progress: 0, // Track progress (0 to 1) instead of fixed duration
    lastTime: performance.now(),
    version: flightVersion,
    flyingBackward: false,
    routeIndex: allRouteLines.length - 1,
    isRedirect: true, // Flag to indicate this is a redirect flight
  };
  
  statusEl.textContent = `✈️ Flying to ${toCity.label}`;
}

// Start the next leg of the journey
function startNextLeg() {
  if (cities.length < 2) return;
  
  const fromCity = cities[currentCityIndex];
  let nextIndex;
  
  if (flyingForward) {
    nextIndex = currentCityIndex + 1;
    if (nextIndex >= cities.length) {
      // Reached the end, reverse direction
      flyingForward = false;
      nextIndex = currentCityIndex - 1;
    }
  } else {
    nextIndex = currentCityIndex - 1;
    if (nextIndex < 0) {
      // Reached the start, reverse direction
      flyingForward = true;
      nextIndex = currentCityIndex + 1;
    }
  }
  
  // Safety check
  if (nextIndex < 0 || nextIndex >= cities.length) return;
  
  const toCity = cities[nextIndex];
  startFlight(fromCity, toCity, nextIndex);
}

// Add a new city to the journey
function addCity(cityData) {
  const position = latLngToVector3(cityData.lat, cityData.lon, earthRadius + 0.02);
  const city = { label: cityData.label, position };
  
  // Create marker at the city location with label
  createMarker(position, cityData.label);
  
  if (cities.length === 0) {
    // First city - just place the marker, no plane yet
    cities.push(city);
    currentCityIndex = 0;
    statusEl.textContent = `📍 Starting at ${city.label}`;
    return;
  }
  
  // Get the previous city before adding the new one
  const previousCity = cities[cities.length - 1];
  
  // Add new city to the end of the path
  cities.push(city);
  
  // Create a persistent route line between the previous city and this new city
  createPersistentRouteLine(previousCity, city);
  
  if (cities.length === 2) {
    // Second city - start the plane flying from first city
    flyingForward = true;
    currentCityIndex = 0;
    startFlight(cities[0], cities[1], 1);
    return;
  }
  
  // Third+ city
  if (activeFlight && thePlane) {
    // Mid-flight: let the plane continue its current journey
    // Don't redirect - the normal back-and-forth will reach the new city
    // Don't change flyingForward - preserve current direction
    statusEl.textContent = `📍 Added ${city.label} to journey`;
    return;
  }
  
  // Not in flight: cancel any pending timeout and start toward new city
  if (returnFlightTimeout) {
    clearTimeout(returnFlightTimeout);
    returnFlightTimeout = null;
  }
  
  // Set direction toward new city and start next leg
  flyingForward = true;
  startNextLeg();
}

function updateFlight(time) {
  if (!activeFlight || !thePlane) return;
  
  const { curve, toCity, toCityIndex, baseDuration, lastTime, version, flyingBackward, routeIndex } = activeFlight;
  
  // Calculate delta time and increment progress based on current speed
  // This allows speed changes to take effect immediately
  const deltaTime = time - lastTime;
  activeFlight.lastTime = time;
  activeFlight.progress += (deltaTime * speedMultiplier) / baseDuration;
  
  let t = Math.min(1, activeFlight.progress);
  
  // If flying backward, reverse the curve parameter
  const curveT = flyingBackward ? (1 - t) : t;
  const position = curve.getPointAt(curveT);

  // Update plane position
  thePlane.position.copy(position);
  
  // Get tangent direction along the curve (direction of travel)
  let tangent = curve.getTangentAt(curveT);
  
  // If flying backward, reverse the tangent direction
  if (flyingBackward) {
    tangent.negate();
  }
  
  // Project current position and a point along the tangent to screen space
  const screenPos = position.clone().applyMatrix4(globeMesh.matrixWorld).project(camera);
  const aheadPos = position.clone().add(tangent.multiplyScalar(0.1));
  const screenAhead = aheadPos.applyMatrix4(globeMesh.matrixWorld).project(camera);
  
  // Calculate angle in screen space
  const dx = screenAhead.x - screenPos.x;
  const dy = screenAhead.y - screenPos.y;
  const angle = Math.atan2(dy, dx);
  
  // Rotate sprite (plane points up by default, so subtract PI/2)
  thePlane.material.rotation = angle - Math.PI / 2;

  // Pulse the active route line opacity slightly
  if (routeIndex !== undefined && allRouteLines[routeIndex]) {
    allRouteLines[routeIndex].line.material.opacity = 0.6 + 0.2 * Math.sin(time * 0.003);
  }

  if (t >= 1) {
    // Flight complete
    statusEl.textContent = `📍 Arrived at ${toCity.label}`;
    
    // Update current position
    currentCityIndex = toCityIndex;
    
    const thisVersion = version;
    activeFlight = null;
    
    // Reset all route lines to default opacity
    allRouteLines.forEach(route => {
      route.line.material.opacity = 0.5;
      route.line.material.color.setHex(0x4a7dc4);
    });
    
    // Small delay before starting next leg
    returnFlightTimeout = setTimeout(() => {
      returnFlightTimeout = null;
      // Only continue if no new city was added (version unchanged)
      if (flightVersion === thisVersion && cities.length >= 2) {
        startNextLeg();
      }
    }, 500);
  }
}

// Debounce helper
function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// Search for cities (returns multiple results for autocomplete)
async function searchCities(query) {
  if (!query || query.length < 2) return [];
  
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&addressdetails=1&featuretype=city`,
    {
      headers: {
        "Accept": "application/json",
        "User-Agent": "GlobeFlightsApp/1.0"
      }
    }
  );
  
  if (!response.ok) return [];
  
  const data = await response.json();
  
  return data.map(item => {
    const parts = item.display_name.split(",");
    const cityName = parts[0].trim();
    const country = parts[parts.length - 1].trim();
    const region = parts.length > 2 ? parts[1].trim() : "";
    
    return {
      label: cityName,
      country: country,
      region: region,
      fullName: item.display_name,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      type: item.type || "place"
    };
  });
}

// Render suggestions dropdown
function renderSuggestions(cities) {
  suggestionsList = cities;
  selectedIndex = -1;
  
  if (!cities.length) {
    suggestionsEl.innerHTML = "";
    suggestionsEl.classList.remove("active");
    return;
  }
  
  suggestionsEl.innerHTML = cities.map((city, i) => `
    <li data-index="${i}">
      <span class="city-name">${city.label}</span>
      <span class="city-country">${city.region ? city.region + ", " : ""}${city.country}</span>
    </li>
  `).join("");
  
  suggestionsEl.classList.add("active");
}

// Handle selecting a city
function selectCity(city) {
  selectedCity = city;
  input.value = city.label;
  suggestionsEl.classList.remove("active");
  suggestionsList = [];
  selectedIndex = -1;
}

// Autocomplete input handler
const handleInput = debounce(async (e) => {
  const query = e.target.value.trim();
  selectedCity = null;
  
  if (query.length < 2) {
    suggestionsEl.classList.remove("active");
    return;
  }
  
  try {
    const cities = await searchCities(query);
    renderSuggestions(cities);
  } catch (err) {
    console.error("Search error:", err);
  }
}, 300);

input.addEventListener("input", handleInput);

// Keyboard navigation for suggestions
input.addEventListener("keydown", (e) => {
  if (!suggestionsEl.classList.contains("active")) return;
  
  if (e.key === "ArrowDown") {
    e.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, suggestionsList.length - 1);
    updateSelectedSuggestion();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    updateSelectedSuggestion();
  } else if (e.key === "Enter" && selectedIndex >= 0) {
    e.preventDefault();
    selectCity(suggestionsList[selectedIndex]);
    form.dispatchEvent(new Event("submit"));
  } else if (e.key === "Escape") {
    suggestionsEl.classList.remove("active");
  }
});

function updateSelectedSuggestion() {
  const items = suggestionsEl.querySelectorAll("li");
  items.forEach((item, i) => {
    item.classList.toggle("selected", i === selectedIndex);
  });
}

// Click on suggestion
suggestionsEl.addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (!li) return;
  
  const index = parseInt(li.dataset.index, 10);
  selectCity(suggestionsList[index]);
  form.dispatchEvent(new Event("submit"));
});

// Close suggestions when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".input-wrapper")) {
    suggestionsEl.classList.remove("active");
  }
});

// Form submission - fly to city
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  
  let cityData = selectedCity;
  
  // If no city selected from autocomplete, try to search
  if (!cityData) {
    const query = input.value.trim();
    if (!query) return;
    
    statusEl.textContent = "🔍 Searching…";
    input.disabled = true;
    
    try {
      const results = await searchCities(query);
      if (!results.length) {
        statusEl.textContent = `❌ Couldn't find "${query}". Try a real city name.`;
        input.disabled = false;
        input.focus();
        return;
      }
      cityData = results[0];
    } catch (err) {
      statusEl.textContent = "❌ Network error. Check your connection.";
      input.disabled = false;
      return;
    }
  }
  
  // Clear input and suggestions
  input.value = "";
  input.disabled = false;
  selectedCity = null;
  suggestionsEl.classList.remove("active");
  
  console.log(`Flying to ${cityData.label} at (${cityData.lat}, ${cityData.lon})`);
  
  // Animate camera to the city
  animateCameraToCity(cityData.lat, cityData.lon);
  
  // Add city to journey (handles marker, plane, and flight logic)
  addCity(cityData);
  
  input.focus();
});

function animate(time) {
  requestAnimationFrame(animate);
  
  // Only rotate globe if enabled
  if (globeRotationEnabled) {
    globeMesh.rotation.y += 0.0009;
    atmosphere.rotation.y += 0.0012;
    stars.rotation.y += 0.0002;
  }
  
  updateFlight(time);
  
  // Update camera animation if active
  if (cameraAnimation && !cameraAnimation.update(time)) {
    cameraAnimation = null;
  }
  
  controls.update();
  renderer.render(scene, camera);
}

function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", handleResize);

// Speed control handlers
function updateSpeedDisplay() {
  if (speedDisplay) {
    speedDisplay.textContent = `${speedMultiplier.toFixed(1)}x`;
  }
}

if (speedUpBtn) {
  speedUpBtn.addEventListener("click", () => {
    speedMultiplier = Math.min(speedMultiplier + 0.5, 5.0);
    updateSpeedDisplay();
  });
}

if (speedDownBtn) {
  speedDownBtn.addEventListener("click", () => {
    speedMultiplier = Math.max(speedMultiplier - 0.5, 0.5);
    updateSpeedDisplay();
  });
}

// Initialize animation loop
console.log("Initializing Globe Flights...");
console.log("Canvas:", canvas);
console.log("Renderer:", renderer);
console.log("Scene objects:", scene.children.length);

animate(performance.now());
