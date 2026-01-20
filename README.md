# Globe Flights ✈️

An interactive 3D globe visualization where you can fly between cities around the world. Built with Three.js.

![Globe Flights](https://img.shields.io/badge/Three.js-black?style=flat&logo=three.js&logoColor=white)
![Vanilla JS](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)

## Features

- **Interactive 3D Globe** – Fully rotatable Earth with realistic textures and atmosphere
- **City Search** – Search and autocomplete for any city worldwide using OpenStreetMap
- **Animated Flights** – Watch planes fly great-circle routes between destinations
- **Multi-city Journeys** – Add multiple cities and watch continuous flights between them
- **Speed Controls** – Adjust flight speed from 0.5x to 5x
- **Smooth Camera** – Auto-animated camera that follows your selections

## Tech Stack

- **Three.js** – 3D rendering and WebGL
- **OpenStreetMap Nominatim** – Geocoding API for city search
- **Vanilla JS** – No frameworks, just clean ES modules

## Getting Started

Just open `index.html` in a modern browser – no build step required!

```bash
# Or serve locally
npx serve .
```

## Usage

1. Type a city name in the search box
2. Select from the autocomplete suggestions or press Enter
3. Watch the plane fly to your destination
4. Add more cities to create a journey
5. Use +/- buttons to control flight speed

## License

MIT
