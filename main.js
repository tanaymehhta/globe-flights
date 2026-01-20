import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

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
const bordersGroup = new THREE.Group();
const damageGroup = new THREE.Group();
const missilesGroup = new THREE.Group();
globeMesh.add(markersGroup, routesGroup, bordersGroup, damageGroup, missilesGroup);

// Country data and damage state
let countryData = null; // GeoJSON data
const damagedCountries = new Set(); // Countries that have been attacked
const countryBorderLines = new Map(); // Map of country name to border lines
const countryDamageEffects = new Map(); // Map of country name to damage effects

// Load country borders from GeoJSON
async function loadCountryBorders() {
  try {
    const response = await fetch(
      "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
    );
    countryData = await response.json();
    console.log(`Loaded ${countryData.features.length} countries`);
    renderCountryBorders();
  } catch (err) {
    console.error("Failed to load country borders:", err);
  }
}

// Convert GeoJSON coordinates to 3D points on globe
function geoToVector3(lon, lat, radius = earthRadius + 0.005) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// Render all country borders
function renderCountryBorders() {
  if (!countryData) return;
  
  const borderMaterial = new THREE.LineBasicMaterial({
    color: 0x4a7dc4,
    transparent: true,
    opacity: 0.25,
    depthTest: true,
    depthWrite: false,
  });
  
  countryData.features.forEach((feature) => {
    const countryName = feature.properties.ADMIN || feature.properties.name;
    const geometry = feature.geometry;
    const lines = [];
    
    const processCoordinates = (coords, isMulti = false) => {
      // For polygon, coords is array of rings, first is outer boundary
      const rings = isMulti ? coords : [coords];
      
      rings.forEach((ring) => {
        // Skip if too few points
        if (ring.length < 3) return;
        
        // Sample points to reduce complexity (every 3rd point for performance)
        const points = [];
        const step = Math.max(1, Math.floor(ring.length / 100));
        
        for (let i = 0; i < ring.length; i += step) {
          const [lon, lat] = ring[i];
          points.push(geoToVector3(lon, lat));
        }
        
        // Close the loop
        if (points.length > 2) {
          points.push(points[0].clone());
          
          const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
          const line = new THREE.Line(lineGeometry, borderMaterial.clone());
          line.renderOrder = 0;
          bordersGroup.add(line);
          lines.push(line);
        }
      });
    };
    
    if (geometry.type === "Polygon") {
      processCoordinates(geometry.coordinates[0]); // Outer ring only
    } else if (geometry.type === "MultiPolygon") {
      geometry.coordinates.forEach((polygon) => {
        processCoordinates(polygon[0]); // Outer ring of each polygon
      });
    }
    
    if (lines.length > 0) {
      countryBorderLines.set(countryName, lines);
    }
  });
  
  console.log(`Rendered borders for ${countryBorderLines.size} countries`);
}

// ============================================
// MISSILE SYSTEM
// ============================================

// Active missiles for animation
const activeMissiles = [];

// Create missile texture (glowing red dot with trail)
function createMissileTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  
  // Glow
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "rgba(255, 100, 50, 1)");
  gradient.addColorStop(0.3, "rgba(255, 50, 0, 0.8)");
  gradient.addColorStop(0.6, "rgba(255, 0, 0, 0.4)");
  gradient.addColorStop(1, "rgba(255, 0, 0, 0)");
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  
  // Core
  ctx.beginPath();
  ctx.arc(16, 16, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

const missileTexture = createMissileTexture();

// Create high-arc missile trajectory (ballistic path)
function createMissileCurve(start, end, index = 0) {
  const startNorm = start.clone().normalize();
  const endNorm = end.clone().normalize();
  
  // Add slight random offset to end position for spread effect
  const spreadAngle = (Math.random() - 0.5) * 0.1;
  const spreadAxis = new THREE.Vector3().crossVectors(endNorm, new THREE.Vector3(0, 1, 0)).normalize();
  endNorm.applyAxisAngle(spreadAxis, spreadAngle);
  
  // Rotation axis
  const axis = new THREE.Vector3().crossVectors(startNorm, endNorm);
  if (axis.length() < 0.001) {
    axis.set(0, 1, 0);
    if (Math.abs(startNorm.y) > 0.9) axis.set(1, 0, 0);
    axis.crossVectors(startNorm, axis).normalize();
  } else {
    axis.normalize();
  }
  
  const angle = startNorm.angleTo(endNorm);
  
  // High ballistic arc - missiles go much higher than planes
  const maxAltitude = 0.8 + Math.random() * 0.4; // Very high arc
  const segments = 60;
  const points = [];
  
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const direction = startNorm.clone().applyAxisAngle(axis, t * angle);
    
    // Ballistic parabola - steeper launch, peaks in middle, steep descent
    const altitude = maxAltitude * Math.sin(t * Math.PI) * Math.pow(Math.sin(t * Math.PI), 0.3);
    
    const point = direction.multiplyScalar(earthRadius + altitude);
    points.push(point);
  }
  
  return new THREE.CatmullRomCurve3(points);
}

// Create a missile sprite
function createMissile(startPos, endPos, index) {
  const curve = createMissileCurve(startPos, endPos, index);
  
  // Create missile sprite
  const spriteMaterial = new THREE.SpriteMaterial({
    map: missileTexture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
  });
  
  const missile = new THREE.Sprite(spriteMaterial);
  missile.scale.set(0.15, 0.15, 1);
  missile.renderOrder = 10;
  missile.position.copy(startPos);
  missilesGroup.add(missile);
  
  // Create trail
  const trailGeometry = new THREE.BufferGeometry();
  const trailMaterial = new THREE.LineBasicMaterial({
    color: 0xff3300,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
  });
  const trail = new THREE.Line(trailGeometry, trailMaterial);
  trail.renderOrder = 9;
  missilesGroup.add(trail);
  
  // Store missile data for animation
  const missileData = {
    sprite: missile,
    trail,
    trailPoints: [],
    curve,
    progress: 0,
    duration: 2500 + Math.random() * 1000, // 2.5-3.5 seconds flight time
    startTime: performance.now(),
    active: true
  };
  
  activeMissiles.push(missileData);
  return missileData;
}

// Update all active missiles
function updateMissiles(time) {
  for (let i = activeMissiles.length - 1; i >= 0; i--) {
    const m = activeMissiles[i];
    if (!m.active) continue;
    
    const elapsed = time - m.startTime;
    m.progress = Math.min(1, elapsed / m.duration);
    
    // Get position along curve
    const pos = m.curve.getPointAt(m.progress);
    m.sprite.position.copy(pos);
    
    // Update trail
    m.trailPoints.push(pos.clone());
    if (m.trailPoints.length > 30) {
      m.trailPoints.shift();
    }
    
    if (m.trailPoints.length >= 2) {
      m.trail.geometry.dispose();
      m.trail.geometry = new THREE.BufferGeometry().setFromPoints(m.trailPoints);
    }
    
    // Fade trail opacity based on progress
    m.trail.material.opacity = 0.6 * (1 - m.progress * 0.5);
    
    // Pulse missile size
    const pulse = 1 + 0.2 * Math.sin(time * 0.02);
    m.sprite.scale.set(0.15 * pulse, 0.15 * pulse, 1);
    
    // Check if missile has landed
    if (m.progress >= 1) {
      m.active = false;
      
      // Create explosion at impact
      createExplosion(pos);
      
      // Remove missile after short delay
      setTimeout(() => {
        missilesGroup.remove(m.sprite);
        missilesGroup.remove(m.trail);
        m.sprite.material.dispose();
        m.trail.geometry.dispose();
        m.trail.material.dispose();
        
        const idx = activeMissiles.indexOf(m);
        if (idx > -1) activeMissiles.splice(idx, 1);
      }, 100);
    }
  }
}

// Create explosion effect at impact point
function createExplosion(position) {
  // Flash sphere
  const flashGeometry = new THREE.SphereGeometry(0.1, 16, 16);
  const flashMaterial = new THREE.MeshBasicMaterial({
    color: 0xff6600,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
  });
  const flash = new THREE.Mesh(flashGeometry, flashMaterial);
  flash.position.copy(position);
  flash.renderOrder = 15;
  missilesGroup.add(flash);
  
  // Animate flash expansion and fade
  const startTime = performance.now();
  const duration = 500;
  
  const animateExplosion = (time) => {
    const elapsed = time - startTime;
    const progress = Math.min(1, elapsed / duration);
    
    const scale = 0.1 + progress * 0.5;
    flash.scale.set(scale, scale, scale);
    flash.material.opacity = 1 - progress;
    
    if (progress < 1) {
      requestAnimationFrame(animateExplosion);
    } else {
      missilesGroup.remove(flash);
      flashGeometry.dispose();
      flashMaterial.dispose();
    }
  };
  
  requestAnimationFrame(animateExplosion);
}

// Get country center coordinates from GeoJSON
function getCountryCenter(countryName) {
  if (!countryData) return null;
  
  const searchName = countryName.toLowerCase().trim();
  
  // First try exact match
  let feature = countryData.features.find((f) => {
    const admin = (f.properties.ADMIN || "").toLowerCase();
    const name = (f.properties.name || "").toLowerCase();
    return admin === searchName || name === searchName;
  });
  
  // If no exact match, try case-insensitive contains (but only one direction for safety)
  if (!feature) {
    feature = countryData.features.find((f) => {
      const admin = (f.properties.ADMIN || "").toLowerCase();
      const name = (f.properties.name || "").toLowerCase();
      // Only check if country name contains search term (not reverse)
      return admin.includes(searchName) || name.includes(searchName);
    });
  }
  
  // If still no match, try reverse (search term contains country name) but only for common aliases
  if (!feature) {
    const aliases = {
      "usa": "united states",
      "us": "united states", 
      "uae": "united arab emirates",
      "uk": "united kingdom",
      "russia": "russian federation"
    };
    const normalizedSearch = aliases[searchName] || searchName;
    
    feature = countryData.features.find((f) => {
      const admin = (f.properties.ADMIN || "").toLowerCase();
      const name = (f.properties.name || "").toLowerCase();
      return normalizedSearch.includes(admin) || normalizedSearch.includes(name);
    });
  }
  
  if (!feature) return null;
  
  // Calculate centroid of the country
  const geometry = feature.geometry;
  let totalLat = 0, totalLon = 0, count = 0;
  
  const processCoords = (coords) => {
    coords.forEach(([lon, lat]) => {
      totalLon += lon;
      totalLat += lat;
      count++;
    });
  };
  
  if (geometry.type === "Polygon") {
    processCoords(geometry.coordinates[0]);
  } else if (geometry.type === "MultiPolygon") {
    geometry.coordinates.forEach((polygon) => processCoords(polygon[0]));
  }
  
  if (count === 0) return null;
  
  return {
    lat: totalLat / count,
    lon: totalLon / count,
    name: feature.properties.ADMIN || feature.properties.name
  };
}

// ============================================
// DAMAGE EFFECTS SYSTEM
// ============================================

// Active damage effects for animation
const activeDamageEffects = [];

// Apply damage to a country
function applyDamage(countryName, centerPos) {
  // Mark country as damaged
  damagedCountries.add(countryName);
  
  // Highlight country borders red
  const borderLines = countryBorderLines.get(countryName);
  if (borderLines) {
    borderLines.forEach((line) => {
      line.material.color.setHex(0xff3333);
      line.material.opacity = 0.8;
    });
  }
  
  // Create red glow overlay
  createDamageGlow(centerPos);
  
  // Create multiple craters around the center
  const craterCount = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < craterCount; i++) {
    const offset = new THREE.Vector3(
      (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.3
    );
    const craterPos = centerPos.clone().add(offset).normalize().multiplyScalar(earthRadius + 0.01);
    createCrater(craterPos);
  }
  
  // Create fire/smoke particle system
  createFireSmoke(centerPos);
  
  // Store damage effect for animation
  countryDamageEffects.set(countryName, {
    centerPos,
    startTime: performance.now()
  });
}

// Create pulsing red glow at damage site
function createDamageGlow(position) {
  const glowGeometry = new THREE.SphereGeometry(0.4, 32, 32);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xff2200,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.position.copy(position);
  glow.renderOrder = 5;
  damageGroup.add(glow);
  
  // Store for animation
  activeDamageEffects.push({
    type: "glow",
    mesh: glow,
    baseOpacity: 0.3,
    startTime: performance.now()
  });
}

// Create crater mark
function createCrater(position) {
  const craterSize = 0.03 + Math.random() * 0.04;
  const craterGeometry = new THREE.SphereGeometry(craterSize, 16, 16);
  const craterMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a0a00,
    roughness: 1,
    metalness: 0,
    emissive: 0x330000,
    emissiveIntensity: 0.3,
  });
  
  const crater = new THREE.Mesh(craterGeometry, craterMaterial);
  crater.position.copy(position);
  crater.renderOrder = 6;
  damageGroup.add(crater);
  
  // Add ring around crater
  const ringGeometry = new THREE.RingGeometry(craterSize, craterSize + 0.02, 16);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4400,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.position.copy(position);
  // Orient ring to face outward from globe center
  ring.lookAt(position.clone().multiplyScalar(2));
  ring.renderOrder = 7;
  damageGroup.add(ring);
  
  activeDamageEffects.push({
    type: "crater_ring",
    mesh: ring,
    startTime: performance.now()
  });
}

// Create fire and smoke particle system
function createFireSmoke(position) {
  const particleCount = 50;
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  const velocities = [];
  const lifetimes = [];
  
  for (let i = 0; i < particleCount; i++) {
    // Start at damage center with random offset
    positions[i * 3] = position.x + (Math.random() - 0.5) * 0.2;
    positions[i * 3 + 1] = position.y + (Math.random() - 0.5) * 0.2;
    positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.2;
    
    // Fire colors (orange to red)
    const fireRatio = Math.random();
    colors[i * 3] = 1; // R
    colors[i * 3 + 1] = 0.2 + fireRatio * 0.4; // G
    colors[i * 3 + 2] = 0; // B
    
    sizes[i] = 0.02 + Math.random() * 0.04;
    
    // Velocity - mostly outward from center, with some randomness
    const outward = position.clone().normalize();
    velocities.push(new THREE.Vector3(
      outward.x * 0.001 + (Math.random() - 0.5) * 0.0005,
      outward.y * 0.001 + (Math.random() - 0.5) * 0.0005 + 0.0003, // Slight upward bias
      outward.z * 0.001 + (Math.random() - 0.5) * 0.0005
    ));
    
    lifetimes.push(Math.random()); // Start at random phase
  }
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  
  const material = new THREE.PointsMaterial({
    size: 0.05,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  
  const particles = new THREE.Points(geometry, material);
  particles.renderOrder = 8;
  damageGroup.add(particles);
  
  activeDamageEffects.push({
    type: "fire",
    particles,
    geometry,
    velocities,
    lifetimes,
    basePosition: position.clone(),
    startTime: performance.now()
  });
}

// Update all damage effects
function updateDamageEffects(time) {
  activeDamageEffects.forEach((effect) => {
    const elapsed = time - effect.startTime;
    
    if (effect.type === "glow") {
      // Pulsing glow
      const pulse = 0.2 + 0.15 * Math.sin(time * 0.003);
      effect.mesh.material.opacity = pulse;
      
      // Slow size pulse
      const scale = 1 + 0.1 * Math.sin(time * 0.002);
      effect.mesh.scale.set(scale, scale, scale);
    }
    
    if (effect.type === "crater_ring") {
      // Flickering ring
      effect.mesh.material.opacity = 0.3 + 0.2 * Math.sin(time * 0.01 + Math.random() * 0.1);
    }
    
    if (effect.type === "fire") {
      const positions = effect.geometry.attributes.position.array;
      const colors = effect.geometry.attributes.color.array;
      const particleCount = positions.length / 3;
      
      for (let i = 0; i < particleCount; i++) {
        // Update lifetime
        effect.lifetimes[i] += 0.01;
        
        if (effect.lifetimes[i] > 1) {
          // Reset particle
          effect.lifetimes[i] = 0;
          positions[i * 3] = effect.basePosition.x + (Math.random() - 0.5) * 0.2;
          positions[i * 3 + 1] = effect.basePosition.y + (Math.random() - 0.5) * 0.2;
          positions[i * 3 + 2] = effect.basePosition.z + (Math.random() - 0.5) * 0.2;
          
          // Reset to fire color
          colors[i * 3] = 1;
          colors[i * 3 + 1] = 0.2 + Math.random() * 0.4;
          colors[i * 3 + 2] = 0;
        } else {
          // Move particle
          positions[i * 3] += effect.velocities[i].x;
          positions[i * 3 + 1] += effect.velocities[i].y;
          positions[i * 3 + 2] += effect.velocities[i].z;
          
          // Fade to smoke color (gray)
          const life = effect.lifetimes[i];
          if (life > 0.5) {
            const smokeFade = (life - 0.5) * 2;
            colors[i * 3] = 1 - smokeFade * 0.7; // R fades
            colors[i * 3 + 1] = colors[i * 3 + 1] * (1 - smokeFade) + 0.3 * smokeFade; // G
            colors[i * 3 + 2] = smokeFade * 0.3; // B increases
          }
        }
      }
      
      effect.geometry.attributes.position.needsUpdate = true;
      effect.geometry.attributes.color.needsUpdate = true;
      
      // Flicker opacity
      effect.particles.material.opacity = 0.6 + 0.2 * Math.sin(time * 0.01);
    }
  });
}

// Initialize country borders
loadCountryBorders();

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
    <li data-index="${i}" data-city='${JSON.stringify(city)}'>
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
    // Get city data from the selected DOM element to avoid race conditions
    const items = suggestionsEl.querySelectorAll("li");
    const selectedItem = items[selectedIndex];
    if (selectedItem) {
      const cityDataJson = selectedItem.dataset.city;
      if (cityDataJson) {
        try {
          const cityData = JSON.parse(cityDataJson);
          selectCity(cityData);
          form.dispatchEvent(new Event("submit"));
        } catch (err) {
          console.error("Error parsing city data:", err);
          // Fallback to array lookup
          if (selectedIndex < suggestionsList.length) {
            selectCity(suggestionsList[selectedIndex]);
            form.dispatchEvent(new Event("submit"));
          }
        }
      } else {
        // Fallback to array lookup
        if (selectedIndex < suggestionsList.length) {
          selectCity(suggestionsList[selectedIndex]);
          form.dispatchEvent(new Event("submit"));
        }
      }
    }
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
  
  // Get city data directly from the DOM element to avoid race conditions
  const cityDataJson = li.dataset.city;
  if (!cityDataJson) {
    // Fallback to index-based lookup if data attribute is missing
    const index = parseInt(li.dataset.index, 10);
    if (index >= 0 && index < suggestionsList.length) {
      selectCity(suggestionsList[index]);
      form.dispatchEvent(new Event("submit"));
    }
    return;
  }
  
  try {
    const cityData = JSON.parse(cityDataJson);
    selectCity(cityData);
    form.dispatchEvent(new Event("submit"));
  } catch (err) {
    console.error("Error parsing city data:", err);
    // Fallback to index-based lookup
    const index = parseInt(li.dataset.index, 10);
    if (index >= 0 && index < suggestionsList.length) {
      selectCity(suggestionsList[index]);
      form.dispatchEvent(new Event("submit"));
    }
  }
});

// Close suggestions when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".input-wrapper")) {
    suggestionsEl.classList.remove("active");
  }
});

// Check if a city is in a damaged country
function isCityInDamagedCountry(cityData) {
  const cityCountry = cityData.country?.toLowerCase() || "";
  
  for (const damaged of damagedCountries) {
    const damagedLower = damaged.toLowerCase();
    if (cityCountry.includes(damagedLower) || damagedLower.includes(cityCountry)) {
      return damaged;
    }
  }
  return null;
}

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
  
  // Check if city is in a damaged country
  const damagedCountry = isCityInDamagedCountry(cityData);
  if (damagedCountry) {
    statusEl.textContent = `💀 Cannot travel to ${cityData.label} - ${damagedCountry} has been destroyed!`;
    input.value = "";
    input.disabled = false;
    selectedCity = null;
    suggestionsEl.classList.remove("active");
    input.focus();
    return;
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
  updateMissiles(time);
  updateDamageEffects(time);
  
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

// ============================================
// ATTACK SYSTEM - Chatbox, GPT Integration, Missiles, Damage
// ============================================

// Chatbox DOM elements
const chatbox = document.getElementById("chatbox");
const chatboxToggle = document.getElementById("chatbox-toggle");
const chatLog = document.getElementById("chat-log");
const attackForm = document.getElementById("attack-form");
const attackInput = document.getElementById("attack-input");
const attackSubmitBtn = attackForm?.querySelector("button");

// Initialize chatbox state
function initChatbox() {
  // Enable attack form - API key is handled server-side
  if (attackInput) attackInput.disabled = false;
  if (attackSubmitBtn) attackSubmitBtn.disabled = false;
  addChatMessage("War Room ready. Enter attack commands.", "system");
}

// Toggle chatbox collapse
chatboxToggle?.addEventListener("click", () => {
  chatbox.classList.toggle("collapsed");
  chatboxToggle.textContent = chatbox.classList.contains("collapsed") ? "+" : "−";
});

// Add message to chat log
function addChatMessage(text, type = "system") {
  const msg = document.createElement("div");
  msg.className = `message ${type}`;
  msg.textContent = text;
  chatLog.appendChild(msg);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// Parse attack command via server-side API
async function parseAttackCommand(userInput) {
  try {
    const response = await fetch("/api/parse-attack", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userInput }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || "API request failed");
    }
    
    if (data.error) {
      addChatMessage(data.error, "error");
      return null;
    }
    
    // Ensure we return an array
    if (Array.isArray(data)) {
      return data;
    } else if (data.attacker && data.target) {
      // Handle legacy single command format
      return [data];
    } else {
      addChatMessage("Invalid command format", "error");
      return null;
    }
  } catch (err) {
    console.error("API error:", err);
    addChatMessage(`Error: ${err.message}`, "error");
    return null;
  }
}

// Handle attack form submission
attackForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const userInput = attackInput.value.trim();
  if (!userInput) return;
  
  addChatMessage(userInput, "user");
  attackInput.value = "";
  attackInput.disabled = true;
  attackSubmitBtn.disabled = true;
  
  // Parse the command(s) - now returns an array
  const commands = await parseAttackCommand(userInput);
  
  if (commands && Array.isArray(commands) && commands.length > 0) {
    // Process all attack commands sequentially
    for (const command of commands) {
      if (command.attacker && command.target) {
        // Check if target is already destroyed
        if (damagedCountries.has(command.target)) {
          addChatMessage(`${command.target} is already destroyed!`, "error");
        } else {
          addChatMessage(`${command.attacker} is attacking ${command.target}...`, "attack");
          
          // Execute the attack
          await executeAttack(command.attacker, command.target);
        }
      }
    }
  }
  
  attackInput.disabled = false;
  attackSubmitBtn.disabled = false;
  attackInput.focus();
});

// Execute attack - launch missiles and apply damage
async function executeAttack(attackerName, targetName) {
  // Get country centers
  const attacker = getCountryCenter(attackerName);
  const target = getCountryCenter(targetName);
  
  if (!attacker) {
    addChatMessage(`Could not find country: ${attackerName}`, "error");
    return;
  }
  
  if (!target) {
    addChatMessage(`Could not find country: ${targetName}`, "error");
    return;
  }
  
  // Debug: Log what countries were actually matched
  console.log(`Attack: ${attackerName} -> ${attacker.name}, Target: ${targetName} -> ${target.name}`);
  
  // Verify we're attacking the right country
  if (target.name.toLowerCase() !== targetName.toLowerCase() && 
      !target.name.toLowerCase().includes(targetName.toLowerCase()) &&
      !targetName.toLowerCase().includes(target.name.toLowerCase())) {
    console.warn(`Warning: Target name mismatch! Searched for "${targetName}" but got "${target.name}"`);
  }
  
  // Get positions on globe
  const attackerPos = latLngToVector3(attacker.lat, attacker.lon, earthRadius + 0.03);
  const targetPos = latLngToVector3(target.lat, target.lon, earthRadius + 0.03);
  
  // Launch missiles
  const missileCount = 5 + Math.floor(Math.random() * 6); // 5-10 missiles
  const missiles = [];
  
  for (let i = 0; i < missileCount; i++) {
    // Stagger launch times
    setTimeout(() => {
      const missile = createMissile(attackerPos, targetPos, i);
      missiles.push(missile);
    }, i * 200); // 200ms between each launch
  }
  
  // Wait for all missiles to land, then apply damage
  const flightDuration = 3000 + missileCount * 200;
  setTimeout(() => {
    applyDamage(target.name, targetPos);
    addChatMessage(`${target.name} has been destroyed!`, "system");
  }, flightDuration);
}

// Initialize chatbox
initChatbox();

// Initialize animation loop
console.log("Initializing Globe Flights...");
console.log("Canvas:", canvas);
console.log("Renderer:", renderer);
console.log("Scene objects:", scene.children.length);

animate(performance.now());
